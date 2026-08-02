/**
 * 주보 자동 동기화 — 교회 홈페이지에 로그인해 최신 주보 PDF를 내려받아
 * 접는 주보의 세로 반쪽 4면(읽는 순서 1→2→3→4면)으로 잘라
 * Firestore bulletins/{날짜}/pages 에 저장한다.
 *
 * 필요 시크릿:
 *  - TVPC_WEB_USER / TVPC_WEB_PASS : tvpc.church 워드프레스 로그인
 *  - FIREBASE_SERVICE_ACCOUNT      : 기존 동기화와 공용
 *
 * PDF 렌더링은 poppler(pdftoppm), 자르기·JPEG 인코딩은 sharp를 쓴다
 * (GitHub Actions 러너에서 실행).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { chromium } from 'playwright';
import sharp from 'sharp';

const WEB_USER = process.env.TVPC_WEB_USER;
const WEB_PASS = process.env.TVPC_WEB_PASS;
if (!WEB_USER || !WEB_PASS) {
  console.log('TVPC_WEB_USER / TVPC_WEB_PASS 시크릿이 없어 주보 동기화를 건너뜁니다.');
  process.exit(0);
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const ORIGIN = 'https://tvpc.church';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// ── 쿠키 유지 fetch ────────────────────────────────────────────
const jar = new Map();
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
  }
}
async function jfetch(url, opts = {}, depth = 0) {
  const res = await fetch(url, {
    redirect: 'manual',
    ...opts,
    headers: {
      'user-agent': UA,
      'accept-language': 'ko,en',
      ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      ...(opts.headers ?? {}),
    },
  });
  storeCookies(res);
  if ([301, 302, 303, 307, 308].includes(res.status) && depth < 6) {
    const loc = res.headers.get('location');
    if (loc) return jfetch(new URL(loc, url).href, { method: 'GET' }, depth + 1);
  }
  return res;
}

const unescapeHtml = (s) =>
  s
    .replace(/&amp;|&#0?38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');

// ── 1. 로그인 (실제 브라우저) ──────────────────────────────────
// 홈페이지 앞단에 봇 차단 스크립트가 붙었다(로그인 페이지가 HTTP 409로,
// JS로 쿠키를 심고 스스로 새로고침하는 도전 페이지만 내려줌 — 일반 fetch는
// JS를 실행하지 못해 이 관문을 절대 통과할 수 없다). 로그인만 헤드리스
// 브라우저로 통과시켜 쿠키를 받아온 뒤, 나머지는 기존처럼 fetch로 처리한다.
console.log('[주보] 홈페이지 로그인(브라우저):');
{
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ userAgent: UA });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/wp/wp-login.php`, { waitUntil: 'domcontentloaded' });
    try {
      // 차단 스크립트가 쿠키를 심고 스스로 새로고침한 뒤에야 진짜 로그인 폼이 뜬다
      await page.waitForSelector('#user_login', { timeout: 20000 });
    } catch {
      console.error(`  ✗ 로그인 폼을 찾지 못했습니다 (제목: ${await page.title()})`);
      console.error(
        `  ! 페이지 앞부분(진단용): ${(await page.content()).replace(/\s+/g, ' ').slice(0, 800)}`,
      );
      process.exit(1);
    }
    await page.fill('#user_login', WEB_USER);
    await page.fill('#user_pass', WEB_PASS);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
      page.click('#wp-submit'),
    ]);
    for (const c of await context.cookies()) jar.set(c.name, c.value);
  } finally {
    await browser.close();
  }
}
const loggedIn = [...jar.keys()].some((k) => k.startsWith('wordpress_logged_in'));
if (!loggedIn) {
  console.error('  ✗ 로그인 실패 — 아이디/비밀번호를 확인해 주세요.');
  process.exit(1);
}
console.log('  ✓ 로그인 성공');

// ── 2. 주보 목록에서 최신 글/PDF 링크 찾기 ─────────────────────
const listRes = await jfetch(`${ORIGIN}/wp/jubo/`);
const listHtml = await listRes.text();
console.log(`[주보] 목록 페이지: HTTP ${listRes.status}, ${listHtml.length}B`);

const anchors = [];
for (const m of listHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
  const href = unescapeHtml(m[1]);
  const text = unescapeHtml(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  anchors.push({ href, text });
}

// 진단용: 흥미로운 링크(첨부/게시글/날짜 포함)만 추려 출력
function dumpInteresting(list, html) {
  const inter = list.filter((a) =>
    /\.pdf|download|attach|kboard|uid=|mod=document|action=|\d{8}|20\d{2}[-./년]/i.test(
      `${a.href} ${a.text}`,
    ),
  );
  console.error(`  발견한 관련 링크 ${inter.length}건:`);
  for (const a of inter.slice(0, 80)) console.error(`    - "${a.text}" → ${a.href}`);
  const pdfish = html.match(/[^"'\s>]{0,140}\.pdf[^"'\s<]{0,60}/gi) ?? [];
  console.error(`  HTML 안 ".pdf" 흔적 ${pdfish.length}건:`);
  for (const p of pdfish.slice(0, 10)) console.error(`    · ${p}`);
}

// PDF 직링크가 목록에 바로 있으면 그것부터, 없으면 최신 게시글로 들어가서 찾는다.
const abs = (h) => (h.startsWith('http') ? h : ORIGIN + (h.startsWith('/') ? h : `/${h}`));
const listUrl = `${ORIGIN}/wp/jubo/`;
let pdfUrl = anchors.find((a) => /\.pdf(\?|$)/i.test(a.href))?.href ?? null;
let pdfLabel = anchors.find((a) => /\.pdf(\?|$)/i.test(a.href))?.text ?? '';

/** 게시글 HTML에서 주보 PDF 링크 찾기 — 없으면 null */
function findPdfInPost(postHtml, postAnchors) {
  return (
    postAnchors.find((a) => /\.pdf(\?|$)/i.test(a.href)) ??
    // KBoard 첨부파일 다운로드 링크 (파일명이 표시 텍스트에 옴)
    postAnchors.find((a) => /kboard_file_download|kboard-file-download/i.test(a.href)) ??
    postAnchors.find(
      (a) =>
        /download|attach|action=file/i.test(a.href) &&
        /pdf|주보|\d{8}|20\d{2}/i.test(`${a.text} ${a.href}`),
    ) ??
    // 본문에 링크 대신 <embed>/<iframe>으로 넣는 경우
    (() => {
      const m =
        postHtml.match(/<(?:embed|iframe|object)[^>]+(?:src|data)="([^"]+\.pdf[^"]*)"/i) ??
        postHtml.match(/(?:src|data|href)="([^"]+\.pdf[^"]*)"/i);
      return m ? { href: unescapeHtml(m[1]), text: '' } : null;
    })() ??
    // KBoard 다운로드 버튼 — URL이 onclick/data 속성 안에 있는 경우: HTML 전체에서 탐색
    (() => {
      const m = postHtml.match(
        /[^"'\s<>()]*(?:action=kboard_file_download|kboard-file-download)[^"'\s<>()]*/,
      );
      return m ? { href: unescapeHtml(m[0]), text: '' } : null;
    })() ??
    null
  );
}

if (!pdfUrl) {
  // 게시글 후보: KBoard 글 링크(?mod=document&uid=) 중 "M/D/YYYY 주보" 제목의 최신 날짜.
  const dated = [];
  const seen = new Set();
  for (const a of anchors) {
    if (!/uid=\d+/.test(a.href) || /mod=(editor|remove)/.test(a.href)) continue;
    const uid = a.href.match(/uid=(\d+)/)[1];
    if (seen.has(uid)) continue;
    const m =
      a.text.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/) ??
      a.text.match(/(20\d{2})[-.년\s]*(\d{1,2})[-.월\s]*(\d{1,2})/);
    if (!m || !/주보/.test(a.text)) continue;
    const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[1], m[2]];
    seen.add(uid);
    dated.push({ ...a, key: `${y}${mo.padStart(2, '0')}${d.padStart(2, '0')}` });
  }
  dated.sort((x, y) => y.key.localeCompare(x.key));
  const candidates = dated.length
    ? dated
    : anchors.filter(
        (a) =>
          /uid=\d+|mod=document/.test(a.href) &&
          !/mod=(editor|remove)/.test(a.href) &&
          /주보/.test(a.text),
      );
  if (!candidates.length) {
    console.error('  ✗ 주보 게시글 링크를 찾지 못했습니다.');
    dumpInteresting(anchors, listHtml);
    process.exit(1);
  }
  // 게시판에는 "7/26/2026 주보에 광고 부탁드립니다" 같은 안내 글도 주보 제목으로 올라온다.
  // 첨부가 없으면 실패로 끝내지 말고 다음(지난주) 주보 글로 내려가며 찾는다.
  let last = null;
  for (const post of candidates.slice(0, 5)) {
    const postUrl = abs(post.href);
    console.log(`  → 게시글 확인: "${post.text}" ${postUrl}`);
    const postHtml = await (await jfetch(postUrl)).text();
    const postAnchors = [];
    for (const m of postHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      postAnchors.push({
        href: unescapeHtml(m[1]),
        text: unescapeHtml(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
      });
    }
    const cand = findPdfInPost(postHtml, postAnchors);
    if (!cand) {
      console.log('    · PDF 첨부가 없습니다 — 이전 주보 글을 확인합니다.');
      last = { postHtml, postAnchors };
      continue;
    }
    pdfLabel = post.text;
    pdfUrl = cand.href.startsWith('?') ? `${postUrl.split('?')[0]}${cand.href}` : cand.href;
    if (!pdfLabel) pdfLabel = cand.text;
    break;
  }
  if (!pdfUrl) {
    console.error('  ✗ 최근 주보 게시글 어디에서도 PDF 링크를 찾지 못했습니다.');
    if (last) {
      dumpInteresting(last.postAnchors, last.postHtml);
      // ".pdf" 주변 마크업을 보여 구조 파악
      const idx = last.postHtml.search(/\.pdf/i);
      if (idx >= 0) {
        console.error('  ".pdf" 주변 마크업:');
        console.error(
          '  ' + last.postHtml.slice(Math.max(0, idx - 700), idx + 300).replace(/\s+/g, ' '),
        );
      }
    }
    process.exit(1);
  }
}
pdfUrl = abs(pdfUrl);
console.log(`  → PDF: ${pdfUrl}`);

// ── 3. PDF 다운로드 ────────────────────────────────────────────
const pdfRes = await jfetch(pdfUrl);
const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
if (pdfBuf.subarray(0, 5).toString() !== '%PDF-') {
  console.error(`  ✗ PDF가 아닌 응답 (HTTP ${pdfRes.status}, ${pdfBuf.length}B) — 권한/링크 확인 필요`);
  process.exit(1);
}
console.log(`  ✓ 다운로드 ${Math.round(pdfBuf.length / 1024)}KB`);

// 날짜: 링크/제목/파일명에서 YYYYMMDD 우선, 없으면 다가오는 주일(LA 기준)
function bulletinDate() {
  const hay = `${pdfUrl} ${pdfLabel}`;
  let m = hay.match(/(20\d{2})[-._/]?(\d{2})[-._/]?(\d{2})/) ?? hay.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // 게시글 제목의 M/D/YYYY (예: 7/19/2026 주보)
  m = hay.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const la = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  la.setDate(la.getDate() + ((7 - la.getDay()) % 7));
  return `${la.getFullYear()}-${String(la.getMonth() + 1).padStart(2, '0')}-${String(la.getDate()).padStart(2, '0')}`;
}
const date = bulletinDate();
const pdfHash = createHash('sha256').update(pdfBuf).digest('hex');
const dir = mkdtempSync(join(tmpdir(), 'jubo-'));
writeFileSync(join(dir, 'in.pdf'), pdfBuf);

// ── 3.5 주보의 새벽예배 본문표 → 매일 말씀(verses/{날짜}) 자동 등록 ──
// 주보에 "화(21일) 수(22일) …" / "이사야 34장 이사야 35장 …" 두 줄이 있어
// 각 요일의 본문을 개역한글 본문과 함께 등록한다. 목사님이 직접 올린 날은 건너뜀.
/** pdftotext 결과 (한 번만 변환) — 아래 함수들이 공유한다 */
let pdfTextCache = null;

try {
  await syncDawnVerses();
} catch (e) {
  console.log(`  ! 새벽예배 본문 등록 실패(주보 등록은 계속): ${e.message}`);
}

// ── 3.6 주보의 주일 성경봉독 → 그 주일의 말씀(verses/{주일}) 자동 등록 ──
try {
  await syncSundayReading();
} catch (e) {
  console.log(`  ! 주일 성경봉독 등록 실패(주보 등록은 계속): ${e.message}`);
}

/** 개역한글 본문 로드 — 책이름 → 장별 절 배열 */
async function loadBible() {
  const { gunzipSync } = await import('node:zlib');
  const scriptDir = new URL('.', import.meta.url).pathname;
  return JSON.parse(gunzipSync(readFileSync(join(scriptDir, 'data', 'krv.json.gz'))).toString());
}

/** 숫자·한글 표기 차이(요한1서↔요한일서 등)를 허용해 책 이름 찾기 */
function findBookIn(bible, name) {
  const norm = (s) =>
    s.replace(/\s/g, '').replace(/1서/, '일서').replace(/2서/, '이서').replace(/3서/, '삼서');
  return bible[name] ? name : (Object.keys(bible).find((k) => norm(k) === norm(name)) ?? null);
}

function pdfText() {
  if (pdfTextCache == null) {
    execFileSync('pdftotext', ['-layout', join(dir, 'in.pdf'), join(dir, 'out.txt')]);
    pdfTextCache = readFileSync(join(dir, 'out.txt'), 'utf8');
  }
  return pdfTextCache;
}

/**
 * 주보 예배 순서의 "성경봉독" 칸에서 그 주일 본문을 읽어
 * verses/{주일 날짜}에 등록한다. 예) "성경봉독  사도행전 (Acts) 11:19-30".
 * 목사님이 직접 올린 말씀은 덮어쓰지 않는다.
 */
async function syncSundayReading() {
  const lines = pdfText().split('\n');
  // "성경봉독" 칸 — pdftotext가 글자 사이에 공백을 넣는 경우도 있어 느슨하게 찾는다
  let hay = null;
  for (let i = 0; i < lines.length; i++) {
    if (!/성\s*경\s*봉\s*독/.test(lines[i])) continue;
    // 같은 줄의 오른쪽(본문 칸) + 다음 줄까지 함께 본다
    hay = `${lines[i].replace(/.*성\s*경\s*봉\s*독/, ' ')} ${lines[i + 1] ?? ''}`;
    break;
  }
  if (!hay) {
    console.log('[말씀] 주보에서 성경봉독 칸을 찾지 못했습니다.');
    return;
  }
  // 영어 병기 "(Acts)" 제거 후 "책 장:절-절" / "책 장:절-장:절" 인식
  const cleaned = hay.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  const m = cleaned.match(
    // 책 이름은 "요한1서"처럼 숫자가 낀 경우도 허용
    /([가-힣]+(?:\d[가-힣]+)?)\s*(\d{1,3})\s*(?::|장)\s*(\d{1,3})(?:\s*절)?(?:\s*[-–~]\s*(?:(\d{1,3})\s*(?::|장)\s*)?(\d{1,3})(?:\s*절)?)?/,
  );
  if (!m) {
    console.log(`[말씀] 성경봉독 본문을 인식하지 못했습니다: "${cleaned.trim().slice(0, 60)}"`);
    return;
  }
  const bible = await loadBible();
  const bookName = findBookIn(bible, m[1]);
  if (!bookName) {
    console.log(`[말씀] 성경봉독 책 이름을 인식하지 못했습니다: "${m[1]}"`);
    return;
  }
  const ch1 = Number(m[2]);
  const v1 = Number(m[3]);
  const ch2 = m[4] ? Number(m[4]) : ch1;
  const v2 = m[5] ? Number(m[5]) : v1;
  const chapters = bible[bookName];
  if (ch1 < 1 || ch1 > chapters.length || ch2 < 1 || ch2 > chapters.length || ch2 < ch1) {
    console.log(`[말씀] 성경봉독 범위가 올바르지 않습니다: ${bookName} ${ch1}:${v1}-${ch2}:${v2}`);
    return;
  }

  // 절 모으기 (장을 넘어가는 본문도 지원)
  const picked = [];
  for (let c = ch1; c <= ch2; c++) {
    const verses = chapters[c - 1] ?? [];
    const from = c === ch1 ? v1 : 1;
    const to = c === ch2 ? Math.min(v2, verses.length) : verses.length;
    for (let v = from; v <= to; v++) {
      if (!verses[v - 1]) continue;
      // 여러 장에 걸치면 어느 장인지 표시
      picked.push({ verse: v, text: ch2 > ch1 ? `[${c}장] ${verses[v - 1]}` : verses[v - 1] });
    }
  }
  if (!picked.length) {
    console.log('[말씀] 성경봉독 본문 절을 찾지 못했습니다.');
    return;
  }
  const ref =
    ch2 > ch1
      ? `${bookName} ${ch1}:${v1}-${ch2}:${v2}`
      : v2 > v1
        ? `${bookName} ${ch1}:${v1}-${v2}`
        : `${bookName} ${ch1}:${v1}`;

  // 설교 제목·설교자도 있으면 함께 안내 (없어도 진행)
  let sermon = '';
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*설\s*교\s*$|설\s*교\s{2,}/.test(lines[i])) continue;
    const t = `${lines[i].replace(/.*설\s*교/, ' ')} ${lines[i + 1] ?? ''}`
      .replace(/\s+/g, ' ')
      .trim();
    if (t) sermon = t.slice(0, 60);
    break;
  }

  const docRef = db.doc(`verses/${date}`);
  const cur = await docRef.get();
  if (cur.exists && cur.get('source') !== 'auto') {
    console.log(`[말씀] ${date} ${ref}: 직접 등록된 말씀이 있어 유지`);
    return;
  }
  const first = picked[0].text.replace(/^\[\d+장\]\s*/, '');
  const hero = first.length > 90 ? `${first.slice(0, 90)}…` : first;
  await docRef.set({
    date,
    reference: ref,
    heroText: hero,
    passageTitle: `${ref} (주일 성경봉독)`,
    passage: picked,
    meditation:
      `오늘 주일예배 성경봉독은 ${ref}, 모두 ${picked.length}절입니다.` +
      (sermon ? `\n설교: ${sermon}` : '') +
      `\n\n예배 전에 본문을 소리 내어 한 번 읽어 보세요. ` +
      `읽으면서 마음에 머무는 구절이 있다면 그 앞에 잠시 멈추어 보세요. ` +
      `그 구절이 오늘 예배에서 하나님께서 나에게 건네시는 말씀입니다.`,
    application: [
      '예배 전에 본문 전체를 한 번 읽어 보세요.',
      '설교를 들으며 마음에 새겨진 구절을 주보 메모에 적어 보세요.',
      '오늘 받은 은혜를 한 사람과 나누어 보세요.',
    ],
    prayer:
      `오늘 주일예배로 나아가게 하시니 감사합니다. ${ref} 말씀을 통해 주시는 음성에 ` +
      `귀 기울이게 하시고, 들은 말씀이 한 주간 삶의 자리에서 열매 맺게 하옵소서. ` +
      `예수님의 이름으로 기도합니다. 아멘.`,
    imageUrl: null,
    source: 'auto',
  });
  console.log(`[말씀] 주일 성경봉독 등록: ${date}  ${ref} (${picked.length}절)`);
}

async function syncDawnVerses() {
  const lines = pdfText().split('\n');

  // 요일 토큰 줄 찾기 — "화(21일) 수(22일) …" (3개 이상)
  let dayLine = -1;
  let days = [];
  for (let i = 0; i < lines.length; i++) {
    const found = [...lines[i].matchAll(/([월화수목금토일])\((\d{1,2})일\)/g)].map((m) => ({
      dom: Number(m[2]),
      col: m.index + m[0].length / 2,
    }));
    if (found.length >= 3) {
      dayLine = i;
      days = found;
      break;
    }
  }
  if (dayLine < 0) {
    console.log('  → 새벽예배 요일표를 찾지 못해 매일 말씀 등록을 건너뜁니다.');
    return;
  }

  // 요일 줄 아래에서 본문 토큰 수집 — "이사야 34장", "이사야 34:1-20" 두 표기 모두.
  // 표 사이에 빈 줄이 들어가는 주보도 있어 여섯 줄까지 훑는다.
  const passages = [];
  for (let i = dayLine + 1; i <= Math.min(dayLine + 6, lines.length - 1); i++) {
    for (const m of lines[i].matchAll(/([가-힣]+(?:\d[가-힣]+)?)\s*(\d{1,3})\s*(?:장|:\s*\d)/g)) {
      passages.push({ book: m[1], chapter: Number(m[2]), col: m.index + m[0].length / 2 });
    }
    if (passages.length) break;
  }
  // 표 모양이 주보마다 조금씩 달라, 읽어들인 표를 항상 기록에 남긴다
  for (let i = dayLine; i <= Math.min(dayLine + 6, lines.length - 1); i++) {
    const t = lines[i].replace(/\s+/g, ' ').trim();
    if (t) console.log(`      | ${t.slice(0, 120)}`);
  }
  if (!passages.length) {
    console.log('  → 새벽예배 본문을 찾지 못해 매일 말씀 등록을 건너뜁니다.');
    return;
  }
  console.log(
    `      · 요일 ${days.map((d) => `${d.dom}일@${Math.round(d.col)}`).join(' ')} / ` +
      `본문 ${passages.map((p) => `${p.book}${p.chapter}@${Math.round(p.col)}`).join(' ')}`,
  );

  // 개역한글 본문 로드 (책이름 → 장별 절 배열)
  const { gunzipSync } = await import('node:zlib');
  const scriptDir = new URL('.', import.meta.url).pathname;
  const bible = JSON.parse(gunzipSync(readFileSync(join(scriptDir, 'data', 'krv.json.gz'))).toString());
  // 숫자·한글 표기 차이(요한1서↔요한일서 등) 허용
  const norm = (s) =>
    s.replace(/\s/g, '').replace(/1서/, '일서').replace(/2서/, '이서').replace(/3서/, '삼서');
  const findBook = (name) =>
    bible[name] ? name : (Object.keys(bible).find((k) => norm(k) === norm(name)) ?? null);

  // 주보 날짜(주일) 다음 1~7일 중 일(日)이 맞는 날짜로 환산
  const [by, bm, bd] = date.split('-').map(Number);
  const sunday = new Date(Date.UTC(by, bm - 1, bd));
  const domToDate = (dom) => {
    for (let add = 1; add <= 7; add++) {
      const d = new Date(sunday);
      d.setUTCDate(d.getUTCDate() + add);
      if (d.getUTCDate() === dom) return d.toISOString().slice(0, 10);
    }
    return null;
  };

  // 요일↔본문 짝짓기 — 표의 열 위치가 가장 가까운 짝부터 확정한다.
  // 요일마다 "가장 가까운 본문"을 고르면, 어떤 날이 '생명의 삶'처럼 성경 장이
  // 아닐 때 옆 칸 본문을 끌어와 하루씩 밀린다. 전체에서 가까운 순으로 확정하고
  // 허용 폭도 좁혀(≤10) 밀림을 막는다.
  const pairs = [];
  for (const day of days) {
    for (const p of passages) {
      const dist = Math.abs(p.col - day.col);
      if (dist <= 10) pairs.push({ day, p, dist });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist);
  const matched = new Map(); // day → passage
  for (const { day, p } of pairs) {
    if (matched.has(day) || p.used) continue;
    p.used = true;
    matched.set(day, p);
  }

  console.log('[말씀] 새벽예배 본문 등록:');
  let wrote = 0;
  const usedDates = new Set();
  // 본문이 없는 날(생명의 삶 등)은 전에 자동 등록해 둔 말씀이 남지 않도록 지운다
  const emptyDates = [];
  for (const day of days) {
    const best = matched.get(day);
    if (!best) {
      const d = domToDate(day.dom);
      if (d) emptyDates.push(d);
      continue;
    }
    const vDate = domToDate(day.dom);
    if (vDate && usedDates.has(vDate)) continue;
    if (vDate) usedDates.add(vDate);
    const bookName = findBook(best.book);
    if (!vDate || !bookName) {
      console.log(`  – ${day.dom}일 ${best.book} ${best.chapter}장: ${!vDate ? '날짜 계산 불가' : '책 이름 인식 불가'}`);
      continue;
    }
    const chapters = bible[bookName];
    if (best.chapter < 1 || best.chapter > chapters.length) {
      console.log(`  – ${bookName} ${best.chapter}장: 장 범위 밖`);
      continue;
    }

    // 목사님이 직접 올린 말씀(source 없음)은 덮어쓰지 않는다
    const ref = `${bookName} ${best.chapter}장`;
    const docRef = db.doc(`verses/${vDate}`);
    const cur = await docRef.get();
    if (cur.exists && cur.get('source') !== 'auto') {
      console.log(`  – ${vDate} ${ref}: 직접 등록된 말씀이 있어 유지`);
      continue;
    }
    const verses = chapters[best.chapter - 1];
    const hero = verses[0].length > 90 ? `${verses[0].slice(0, 90)}…` : verses[0];
    // 어떤 장르의 본문이 와도 자연스럽도록: 인용은 "이렇게 시작합니다" 소개로만,
    // 적용·기도는 인용 없이 구성한다 (역사·심판 본문의 기계적 인용 어색함 방지)
    const clip = (s, n = 60) =>
      s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s;
    const q1 = clip(verses[0]);
    await docRef.set({
      date: vDate,
      reference: ref,
      heroText: hero,
      passageTitle: `${ref} (새벽예배 본문)`,
      passage: verses.map((t, i) => ({ verse: i + 1, text: t })),
      meditation:
        `오늘 새벽예배 본문은 ${ref}, 전체 ${verses.length}절입니다.\n\n` +
        `본문은 이렇게 시작합니다.\n"${q1}" (1절)\n\n` +
        `처음부터 끝까지 천천히 읽어 내려가며, 오늘 나에게 주시는 한 구절을 찾아보세요. ` +
        `마음에 머무는 구절이 있다면 그 앞에 잠시 멈추어 보세요. ` +
        `그 한 구절이 오늘 하나님께서 나에게 건네시는 말씀입니다.`,
      application: [
        '본문에서 가장 마음에 닿은 구절을 골라 소리 내어 한 번 더 읽어 보세요.',
        '그 구절이 지금 나의 형편에 주는 의미를 생각하며, 오늘 실천할 한 가지를 정해 보세요.',
        '받은 은혜를 오늘 만나는 한 사람과 나누어 보세요.',
      ],
      prayer:
        `말씀으로 하루를 열게 하시니 감사합니다. 오늘 ${ref} 말씀을 읽으며 마음에 ` +
        `새긴 구절을 하루 동안 기억하게 하시고, 그 말씀이 저의 생각과 걸음을 인도하게 ` +
        `하옵소서. 읽는 것에서 그치지 않고 삶의 자리에서 열매 맺게 하옵소서. ` +
        `예수님의 이름으로 기도합니다. 아멘.`,
      imageUrl: null,
      source: 'auto',
    });
    console.log(`  ✓ ${vDate}  ${ref} (${verses.length}절)`);
    wrote++;
  }
  console.log(`  → 매일 말씀 ${wrote}건 등록`);

  // 새벽예배 본문이 성경 장이 아닌 날은 '생명의 삶' QT를 보는 날이다 —
  // 두란노 공지의 월별 본문표에서 그날 본문 범위를 가져와 등록한다.
  const pending = emptyDates.filter((d) => !usedDates.has(d));
  if (pending.length) await syncQtVerses(pending, bible, findBook);
}

/** 생명의 삶(두란노 QT) 본문표로 그날 말씀 등록 */
async function syncQtVerses(dates, bible, findBook) {
  const { fetchQtMonth } = await import('./qt-passages.mjs');
  console.log('[말씀] 생명의 삶 QT 본문 등록:');
  // 두란노 페이지는 EUC-KR
  const fetchText = async (url) => {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko,en' } });
    const buf = Buffer.from(await res.arrayBuffer());
    return new TextDecoder('euc-kr').decode(buf);
  };

  const months = new Map(); // "YYYY-M" → Map(일 → 본문)
  for (const d of dates) {
    const [y, m, dd] = d.split('-').map(Number);
    const key = `${y}-${m}`;
    if (!months.has(key)) {
      const { url, days } = await fetchQtMonth(y, m, fetchText);
      console.log(`  · ${y}년 ${m}월호 본문표: ${days.size}일치 ${url ?? '(글을 찾지 못함)'}`);
      months.set(key, days);
    }
    const p = months.get(key).get(dd);
    if (!p) {
      console.log(`  – ${d}: 본문표에 그날 본문이 없습니다`);
      await removeAutoVerse(d);
      continue;
    }
    const bookName = findBook(p.book);
    const chapters = bookName ? bible[bookName] : null;
    if (!chapters) {
      console.log(`  – ${d}: 책 이름 인식 불가 (${p.book})`);
      continue;
    }
    const picked = [];
    for (let c = p.ch1; c <= p.ch2; c++) {
      const verses = chapters[c - 1] ?? [];
      const from = c === p.ch1 ? p.v1 : 1;
      const to = c === p.ch2 ? Math.min(p.v2, verses.length) : verses.length;
      for (let v = from; v <= to; v++) {
        if (!verses[v - 1]) continue;
        picked.push({ verse: v, text: p.ch2 > p.ch1 ? `[${c}장] ${verses[v - 1]}` : verses[v - 1] });
      }
    }
    if (!picked.length) {
      console.log(`  – ${d}: 본문 절을 찾지 못했습니다`);
      continue;
    }
    const ref =
      p.ch2 > p.ch1
        ? `${bookName} ${p.ch1}:${p.v1}-${p.ch2}:${p.v2}`
        : p.v2 > p.v1
          ? `${bookName} ${p.ch1}:${p.v1}-${p.v2}`
          : `${bookName} ${p.ch1}:${p.v1}`;
    const docRef = db.doc(`verses/${d}`);
    const cur = await docRef.get();
    if (cur.exists && cur.get('source') !== 'auto') {
      console.log(`  – ${d} ${ref}: 직접 등록된 말씀이 있어 유지`);
      continue;
    }
    const first = picked[0].text.replace(/^\[\d+장\]\s*/, '');
    await docRef.set({
      date: d,
      reference: ref,
      heroText: first.length > 90 ? `${first.slice(0, 90)}…` : first,
      passageTitle: `${ref} (생명의 삶 본문)`,
      passage: picked,
      meditation:
        `오늘 새벽예배는 생명의 삶 본문으로 드립니다. 오늘 본문은 ${ref}, 모두 ${picked.length}절입니다.\n\n` +
        `천천히 소리 내어 읽으며, 마음에 머무는 한 구절을 찾아보세요. ` +
        `그 구절 앞에 잠시 멈추어 오늘 나에게 주시는 말씀으로 받아보세요.`,
      application: [
        '본문에서 가장 마음에 닿은 구절을 한 번 더 읽어 보세요.',
        '그 구절이 오늘 나의 형편에 주는 의미를 생각하며, 실천할 한 가지를 정해 보세요.',
        '받은 은혜를 오늘 만나는 한 사람과 나누어 보세요.',
      ],
      prayer:
        `말씀으로 하루를 열게 하시니 감사합니다. 오늘 ${ref} 말씀을 마음에 새기게 하시고, ` +
        `그 말씀이 하루의 생각과 걸음을 인도하게 하옵소서. ` +
        `예수님의 이름으로 기도합니다. 아멘.`,
      imageUrl: null,
      source: 'auto',
    });
    console.log(`  ✓ ${d}  ${ref} (${picked.length}절)`);
  }
}

/** 자동 등록해 둔 말씀 지우기 (직접 올린 말씀은 그대로 둔다) */
async function removeAutoVerse(d) {
  const ref = db.doc(`verses/${d}`);
  const cur = await ref.get();
  if (cur.exists && cur.get('source') === 'auto') {
    await ref.delete();
    console.log(`  – ${d}: 자동 등록분을 지웠습니다`);
  }
}

// 마지막 자동 확인 결과 — 관리자 화면 '자동 동기화 상태'에 표시된다
async function writeStatus(changed, note) {
  try {
    await db.doc('syncStatus/bulletin').set({
      at: FieldValue.serverTimestamp(),
      bulletinDate: date,
      changed,
      note,
    });
  } catch (e) {
    console.log(`  ! 상태 기록 실패(무해): ${e.message}`);
  }
}

// ── 3.7 설교 노트(괄호 채우기) 추출 ────────────────────────────
// 주보의 설교 개요에서 "( … )" 빈칸이 있는 문장들을 뽑아 앱 메모장에
// 깔아준다 — 교인은 괄호만 채우면 된다. 접는 주보라 페이지를 반쪽
// (면) 단위로 나눠 줄을 복원하고, 빈칸이 가장 많은 면을 고른다.
function extractNoteLines() {
  execFileSync('pdftohtml', ['-xml', '-q', join(dir, 'in.pdf'), join(dir, 'note')], { cwd: dir });
  const xml = readFileSync(join(dir, 'note.xml'), 'utf8');
  const pages = [
    ...xml.matchAll(
      /<page number="(\d+)"[^>]*height="([\d.]+)"[^>]*width="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g,
    ),
  ];
  const faces = [];
  for (const pm of pages) {
    const pageW = Number(pm[3]);
    const spans = [
      ...pm[4].matchAll(
        /<text top="([\d.]+)" left="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g,
      ),
    ].map((m) => ({
      top: Number(m[1]),
      left: Number(m[2]),
      w: Number(m[3]),
      s: unescapeHtml(m[5].replace(/<[^>]+>/g, '')),
    }));
    // 가로 2단(접는 주보)이면 반쪽씩, 아니면 페이지 전체를 한 면으로
    const halves = pageW > 700 ? [0, 1] : [null];
    for (const half of halves) {
      const hs =
        half === null
          ? spans
          : spans.filter((t) => (t.left + t.w / 2 < pageW / 2) === (half === 0));
      const byLine = new Map();
      for (const t of hs) {
        const k = Math.round(t.top / 8);
        if (!byLine.has(k)) byLine.set(k, []);
        byLine.get(k).push(t);
      }
      const lines = [...byLine.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, sp]) => {
          sp.sort((a, b) => a.left - b.left);
          let s = '';
          let prev = null;
          for (const t of sp) {
            if (prev != null && t.left - prev > 14) s += ' ¶ ';
            else if (s) s += ' ';
            s += t.s;
            prev = t.left + t.w;
          }
          return s;
        });
      faces.push(lines);
    }
  }
  // 괄호 빈칸 표준화: "( ¶ )", "(____)", "(   )" → "(____)"
  const normBlank = (s) =>
    s
      .replace(/\(\s*[¶_\s.·]*\s*\)/g, '(____)')
      .replace(/¶/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  let best = null;
  for (const lines of faces) {
    const nl = lines.map(normBlank);
    const idxs = nl.map((s, i) => (/\(____\)/.test(s) ? i : -1)).filter((i) => i >= 0);
    if (idxs.length && (!best || idxs.length > best.count)) {
      const block = nl.slice(idxs[0], idxs[idxs.length - 1] + 1).filter((s) => s);
      best = { count: idxs.length, block: block.slice(0, 30) };
    }
  }
  if (best) {
    console.log(`[설교노트] 괄호 채우기 ${best.count}칸 추출:`);
    for (const l of best.block) console.log(`    ${l}`);
  } else {
    console.log('[설교노트] 괄호 채우기 문장을 찾지 못했습니다.');
  }
  return best ? best.block : [];
}
let noteLines = [];
try {
  noteLines = extractNoteLines();
} catch (e) {
  console.log(`  ! 설교 노트 추출 실패(무해): ${e.message}`);
}

const existing = await db.doc(`bulletins/${date}`).get();
if (existing.exists && existing.get('pdfHash') === pdfHash) {
  console.log(`완료: ${date} 주보는 이미 최신입니다 (변경 없음).`);
  // 괄호 채우기 추출 결과가 새로우면 그것만 갱신
  if (
    noteLines.length &&
    JSON.stringify(existing.get('noteLines') ?? []) !== JSON.stringify(noteLines)
  ) {
    await db.doc(`bulletins/${date}`).set({ noteLines }, { merge: true });
    console.log('  → 설교 노트(괄호 채우기) 갱신');
  }
  await writeStatus(false, '이미 최신 (변경 없음)');
  process.exit(0);
}

// ── 4. PDF → 반쪽 페이지 JPEG ──────────────────────────────────
execFileSync('pdftoppm', ['-jpeg', '-r', '200', '-jpegopt', 'quality=90', join(dir, 'in.pdf'), join(dir, 'sheet')]);
const sheetFiles = readdirSync(dir).filter((f) => f.startsWith('sheet')).sort();
console.log(`[변환] ${sheetFiles.length}장 렌더링`);

const MAX_BYTES = 675_000; // base64 후 ~900KB (Firestore 1MB 한도 아래)
async function encode(img) {
  for (const q of [82, 70, 58, 45]) {
    const buf = await img.clone().jpeg({ quality: q }).toBuffer();
    if (buf.length <= MAX_BYTES) return buf;
  }
  throw new Error('페이지 이미지가 너무 큽니다.');
}

const halves = [];
for (const f of sheetFiles) {
  const img = sharp(readFileSync(join(dir, f)));
  const { width, height } = await img.metadata();
  if (width > height * 1.15) {
    const half = Math.floor(width / 2);
    for (const left of [0, width - half]) {
      const crop = sharp(await img.clone().extract({ left, top: 0, width: half, height }).toBuffer());
      halves.push({ buf: await encode(crop), w: half, h: height });
    }
  } else {
    halves.push({ buf: await encode(img), w: width, h: height });
  }
}
// 접는 주보(가로 2장 = [4면|1면][2면|3면]) → 읽는 순서로 재배열
const ordered =
  sheetFiles.length === 2 && halves.length === 4
    ? [halves[1], halves[2], halves[3], halves[0]]
    : halves;

// ── 5. Firestore 저장 ─────────────────────────────────────────
const oldPages = await db.collection(`bulletins/${date}/pages`).get();
for (const d of oldPages.docs) await d.ref.delete();
for (let i = 0; i < ordered.length; i++) {
  await db.doc(`bulletins/${date}/pages/${String(i).padStart(3, '0')}`).set({
    order: i,
    image: `data:image/jpeg;base64,${ordered[i].buf.toString('base64')}`,
    w: ordered[i].w,
    h: ordered[i].h,
  });
}
await db.doc(`bulletins/${date}`).set({
  date,
  pageCount: ordered.length,
  pdfHash,
  source: 'auto',
  noteLines,
  updatedAt: FieldValue.serverTimestamp(),
});
await writeStatus(true, `새 주보 ${ordered.length}면 등록`);
console.log(`완료: ${date} 주보 ${ordered.length}페이지 등록`);
