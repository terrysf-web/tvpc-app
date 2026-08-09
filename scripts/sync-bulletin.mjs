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

// 이미지로만 올라갔던 지난 주보를 8/2 이후처럼 구조화된 형태(예배 순서·설교·괄호
// 채우기 등)로 다시 만들고 싶을 때: TARGET_BULLETIN_DATE=YYYY-MM-DD 로 지정하면
// "최신 글"이 아니라 그 날짜의 "M/D/YYYY 주보" 게시글을 목록에서 찾아 처리한다.
// 지정하지 않으면 기존과 동일하게 항상 최신 주보를 찾는다.
const TARGET_DATE = process.env.TARGET_BULLETIN_DATE?.trim() || null;
if (TARGET_DATE && !/^\d{4}-\d{2}-\d{2}$/.test(TARGET_DATE)) {
  console.error(`  ✗ TARGET_BULLETIN_DATE 형식이 올바르지 않습니다: "${TARGET_DATE}" (YYYY-MM-DD)`);
  process.exit(1);
}
if (TARGET_DATE) console.log(`[주보] 특정 날짜 지정: ${TARGET_DATE} 주보를 찾습니다.`);

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
    .replace(/&quot;|&#0?34;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

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
// TARGET_DATE가 있으면 목록의 "가장 최근" PDF 직링크를 그냥 집어오면 안 되므로,
// 이 지름길을 건너뛰고 아래 게시글 제목(날짜) 매칭 경로로 보낸다.
let pdfUrl = TARGET_DATE ? null : anchors.find((a) => /\.pdf(\?|$)/i.test(a.href))?.href ?? null;
let pdfLabel = TARGET_DATE ? '' : anchors.find((a) => /\.pdf(\?|$)/i.test(a.href))?.text ?? '';

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
  let candidates = dated.length
    ? dated
    : anchors.filter(
        (a) =>
          /uid=\d+|mod=document/.test(a.href) &&
          !/mod=(editor|remove)/.test(a.href) &&
          /주보/.test(a.text),
      );
  if (TARGET_DATE) {
    const targetKey = TARGET_DATE.replace(/-/g, '');
    candidates = dated.filter((d) => d.key === targetKey);
    if (!candidates.length) {
      console.error(
        `  ✗ ${TARGET_DATE} 날짜의 주보 게시글을 목록에서 찾지 못했습니다 ` +
          `(게시글 제목이 "M/D/YYYY 주보" 형식의 날짜를 포함해야 합니다).`,
      );
      dumpInteresting(anchors, listHtml);
      process.exit(1);
    }
  }
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
// TARGET_DATE로 지정했으면 추정하지 않고 그 날짜를 그대로 쓴다 (게시글 제목 매칭에서
// 이미 검증됨). 지정하지 않았을 때만 URL/제목에서 날짜를 추정한다.
const date = TARGET_DATE ?? bulletinDate();
const pdfHash = createHash('sha256').update(pdfBuf).digest('hex');
const dir = mkdtempSync(join(tmpdir(), 'jubo-'));
writeFileSync(join(dir, 'in.pdf'), pdfBuf);

// ── 3.5 주보의 새벽예배 본문표 → 매일 말씀(verses/{날짜}) 자동 등록 ──
// 주보에 "화(21일) 수(22일) …" / "이사야 34장 이사야 35장 …" 두 줄이 있어
// 각 요일의 본문을 개역개정 본문과 함께 등록한다. 목사님이 직접 올린 날은 건너뜀.
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

/** 개역개정 본문 로드 — 책이름 → 장별 절 배열 */
async function loadBible() {
  const { gunzipSync } = await import('node:zlib');
  const scriptDir = new URL('.', import.meta.url).pathname;
  return JSON.parse(gunzipSync(readFileSync(join(scriptDir, 'data', 'gae.json.gz'))).toString());
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
    translation: 'gae',
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

  // 개역개정 본문 로드 (책이름 → 장별 절 배열)
  const { gunzipSync } = await import('node:zlib');
  const scriptDir = new URL('.', import.meta.url).pathname;
  const bible = JSON.parse(gunzipSync(readFileSync(join(scriptDir, 'data', 'gae.json.gz'))).toString());
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
      translation: 'gae',
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
      translation: 'gae',
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

// ── 3.7 설교 노트(괄호 채우기 · 나눔 질문) 추출 ────────────────
// 주보의 설교 개요에서 "( … )" 빈칸이 있는 문장들과 "[나눔 질문]" 아래
// 번호 매긴 질문들을 뽑아 앱 메모장에 깔아준다. 접는 주보라 페이지를
// 반쪽(면) 단위로 나눠 줄을 복원한다.
function buildFaces() {
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
  return faces;
}

function extractNoteLines(faces) {
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

// "[나눔 질문]" 아래 "1. …" "2. …" 처럼 번호 매긴 문단을 뽑는다.
// 줄 복원 단계에서 한 질문이 여러 줄로 쪼개져 있으므로, 번호로 시작하는
// 줄을 새 질문으로 보고 그 다음 줄들은 앞 질문에 이어붙인다.
function extractShareQuestions(faces) {
  for (const lines of faces) {
    const startIdx = lines.findIndex((l) => /나눔\s*질문/.test(l));
    if (startIdx < 0) continue;
    const rest = lines.slice(startIdx + 1).filter((s) => s.trim());
    const qs = [];
    for (const line of rest) {
      if (/^\s*\d+\s*[.).]\s*/.test(line)) {
        qs.push(line.trim());
      } else if (qs.length) {
        qs[qs.length - 1] += ` ${line.trim()}`;
      }
    }
    const cleaned = qs
      .map((q) => q.replace(/^\s*\d+\s*[.).]\s*/, '').replace(/\s+/g, ' ').trim())
      .filter((q) => q.length > 3)
      .slice(0, 10);
    if (cleaned.length) {
      console.log(`[설교노트] 나눔 질문 ${cleaned.length}개 추출:`);
      for (const q of cleaned) console.log(`    ${q}`);
      return cleaned;
    }
  }
  console.log('[설교노트] 나눔 질문을 찾지 못했습니다.');
  return [];
}

// ── 3.8 예배 순서·설교·공지·헌금·예배위원·섬기는 사람들 추출 ──────
// 주보 면(각 반쪽) 텍스트에서 정해진 라벨을 찾아 그 아래 내용을 모은다.
// 주보 레이아웃이 조금씩 달라져도 버티도록 각 항목은 실패해도 나머지에
// 영향 없이 빈 값으로 남는다 — 앱 쪽에서는 값이 있는 카드만 보여준다.

/** ¶(면 재구성에서 표시한 열 경계)로만 나눈다 — 표(고정 열) 파싱용. 빈 칸도 자리가
 * 중요하므로 걸러내지 않는다. */
function splitPillar(raw) {
  return raw.split('¶').map((s) => s.trim());
}

const ORDER_LABELS = [
  '성도의 교제', '예배의 부름', '경배와 기도', '성찬식',
  '성경봉독', '설교', '결단의 찬양', '봉헌', '축도',
  // 야외예배 등 1부/2부 구분 없는 단일 예배 주보 — 항목 이름 자체가 다르다.
  // ('찬송 / 헌금'을 짧은 '찬송'보다 먼저 둬야 그 줄이 '찬송'으로 잘못 잘리지 않는다)
  '참회의 기도/신앙고백', '찬송 / 헌금', '어린이 설교', '교회소식 / 새가족환영', '기도', '찬송',
];
const VARY_LABELS = new Set(['성도의 교제', '경배와 기도']);
const SCRIPTURE_LIKE = /\d{1,3}\s*[:：\-–~]\s*\d{1,3}|\d{1,3}\s*장/;
const PREACHER_SUFFIX = /(목사|전도사|강도사|선교사|장로|집사|권사)\s*$/;
// '*'는 "일어서 주시기 바랍니다" 표시라 그대로 남긴다. '¶'는 원본 디자인의 장식
// 따옴표(“ ”)가 폰트 인식 오류로 깨져 나온 것이라 항상 제거한다.
const cleanText = (s) => s.replace(/¶/g, ' ').replace(/\s+/g, ' ').trim();

/** 1부/2부에서 서로 다른 항목의 두 칸(줄바꿈으로 이어붙임) — 마지막 두 ¶ 조각을 쓴다 */
function orderVaryCols(detailLines) {
  const c1 = [];
  const c2 = [];
  for (const raw of detailLines) {
    const pillars = raw.split('¶').map((s) => s.trim());
    if (pillars.length === 1) {
      if (pillars[0]) c1.push(pillars[0]);
      continue;
    }
    const a = pillars[pillars.length - 2];
    const b = pillars[pillars.length - 1];
    if (a) c1.push(a);
    if (b) c2.push(b);
  }
  if (!c1.length && c2.length) {
    const last = c2[c2.length - 1];
    const m = last.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (m.length >= 2) {
      c2[c2.length - 1] = m.slice(1).join(' ');
      c1.push(m[0]);
    }
  }
  return {
    service1: c1.map(cleanText).filter(Boolean).join('\n'),
    service2: c2.map(cleanText).filter(Boolean).join('\n'),
  };
}

/** 1면 — 예배 순서(1부/2부 다른 부분은 두 칸) + 설교 제목/본문/설교자 */
function extractOrderAndSermon(lines) {
  const raw = [];
  for (const line of lines) {
    // 야외예배 주보는 pdftohtml 스팬 사이 공백이 두 칸 이상으로 나오기도 해
    // 라벨 매칭 전에 연속 공백을 하나로 줄인다(정상 주보엔 영향 없음).
    const t = line.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (raw.length && /^\*\s*표는/.test(t)) break;
    // 접두어만 보면 '찬송'이 '찬송가'까지 집어삼키므로, 라벨 바로 뒤가 공백·'*'·끝
    // 중 하나일 때만(=단어 경계) 라벨로 인정한다.
    const label = ORDER_LABELS.find(
      (l) => t.startsWith(l) && (t.length === l.length || ' *'.includes(t[l.length])),
    );
    if (label) raw.push({ name: label, detailLines: [t.slice(label.length)] });
    else if (raw.length) raw[raw.length - 1].detailLines.push(t);
  }
  if (!raw.length) return { order: [], sermon: null };

  const scriptureItem = raw.find((r) => r.name === '성경봉독');
  const sermonItem = raw.find((r) => r.name === '설교');
  let scripture = '';
  let preacher = '';
  const titleParts = [];
  if (scriptureItem) {
    for (const l of scriptureItem.detailLines) {
      if (!l) continue;
      if (!scripture && SCRIPTURE_LIKE.test(l)) scripture = cleanText(l.replace(/\([^)]*\)/g, ''));
      else titleParts.push(l);
    }
  }
  if (sermonItem) {
    const rest = [];
    for (const l of sermonItem.detailLines) {
      if (!l) continue;
      if (!preacher && PREACHER_SUFFIX.test(l)) preacher = cleanText(l);
      else rest.push(l);
    }
    titleParts.push(...rest);
  }
  const title = cleanText(titleParts.join(' '));

  const order = raw.map((item) => {
    if (item.name === '성경봉독') return { name: item.name, shared: scripture };
    if (item.name === '설교') return { name: item.name, shared: preacher };
    if (VARY_LABELS.has(item.name)) return { name: item.name, ...orderVaryCols(item.detailLines) };
    // 라벨 바로 뒤에 붙어 있던 '*'가 조각으로 혼자 떨어져 나오면(예: "* · 인도자")
    // 맨 앞이 아니라 맨 뒤에 붙여 "인도자*"처럼 자연스럽게 보이게 한다.
    const pieces = item.detailLines
      .flatMap((l) => l.split('¶'))
      .map((s) => s.trim())
      .filter(Boolean);
    const hasStar = pieces.some((p) => p === '*');
    const shared = cleanText(pieces.filter((p) => p !== '*').join(' · ')) + (hasStar ? '*' : '');
    return { name: item.name, shared };
  });

  return { order, sermon: title || preacher || scripture ? { title, scripture, preacher } : null };
}

// 새벽예배 칸은 "책이름 N장" 아니면 QT 교재를 보는 "생명의 삶" 둘 중 하나뿐이다
// (syncDawnVerses 쪽 주석 참고) — 칸 사이 공백이 몇 칸인지로 나누면 그 주 PDF의
// 여백이 좁을 때(특히 '생명의 삶'이 연달아 나올 때) 옆 칸과 붙어버리므로,
// 이 두 형태 자체를 패턴으로 찾아 나눈다.
const DAWN_CELL = /\S+\s+\d+장|생명의\s*삶/g;

/**
 * 1면 — 예배 순서 아래 "새벽예배 / 금요성령집회" 본문표. 요일 칸(화(4일) 등) 5개는
 * 새벽예배, 마지막 한 칸은 금요성령집회 — 본문 줄은 새벽예배 쪽은 여러 칸
 * 띄어쓰기로, 금요성령집회 쪽만 ¶로 나뉘어 있다.
 */
function extractDawnReadings(lines) {
  const hdrIdx = lines.findIndex((l) => /^새벽예배/.test(l.trim()));
  if (hdrIdx < 0 || hdrIdx + 2 >= lines.length) return { dawn: [], friday: null };
  const days = splitPillar(lines[hdrIdx + 1].trim()).filter(Boolean);
  const passageLine = lines[hdrIdx + 2].trim();
  const pillarParts = passageLine.split('¶').map((s) => s.trim());
  const fridayPassage = pillarParts.length > 1 ? pillarParts.pop() : '';
  const dawnText = pillarParts.join(' ');
  const matched = [...dawnText.matchAll(DAWN_CELL)].map((m) => m[0].replace(/\s+/g, ' ').trim());
  // 어느 칸도 "책 N장"/"생명의 삶" 형태가 아니면(예: 새 문구) 기존 방식으로 대체
  const dawnPassages = matched.length
    ? matched
    : dawnText.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  const dawn = [];
  const dawnCount = Math.max(0, days.length - 1);
  for (let i = 0; i < Math.min(dawnCount, dawnPassages.length); i++) {
    dawn.push({ day: days[i], passage: dawnPassages[i] });
  }
  const friday =
    fridayPassage && days.length ? { day: days[days.length - 1], passage: fridayPassage } : null;
  return { dawn, friday };
}

const HAS_HANGUL = /[가-힣]/;
const HYMN_HEADER = /^찬송가\s*(\d+)\s*장\s*\[([^\]]+)\]/;
// "책이름 [English] 장:절" — 대괄호 안이 영문 책이름인 줄만 성경 본문 시작으로 본다
const READING_HEADER = /^([가-힣A-Za-z0-9() ]+?)\s*\[([A-Za-z][^\]]*)\]\s*(\d+[:.]\d+(?:[-–]\d+)?)/;

/**
 * 1면 왼쪽 — 찬송가 가사·성경 본문 전체(있는 만큼만). 야외예배처럼 예배 순서와
 * 별도로 가사·본문이 통째로 인쇄된 주보에만 있다 — 없으면 조용히 빈 배열.
 * 언어는 줄에 한글이 있는지로 판정한다(한글 없으면 영어로 본다).
 * orderFace·noticesFace는 "책이름 [영문] 장:절" 같은 참조 한 줄이 섞여 들어와
 * 뒤따르는 무관한 줄까지 본문으로 삼켜버리므로 미리 제외해서 받는다.
 */
function extractHymnsAndScriptures(faces, excludeFaces) {
  const hymns = new Map(); // 장 번호 → { number, titleKo, titleEn, lyricsKo:[], lyricsEn:[] }
  const scriptures = new Map(); // "책이름 장:절" → { reference, textKo:[], textEn:[] }
  const seen = new Set(); // 인쇄용으로 양면 중복된 페이지(영어 가사 삽지 등) 걸러내기

  for (const f of faces) {
    if (excludeFaces.includes(f)) continue;
    const sig = f.join('\n');
    if (seen.has(sig)) continue;
    seen.add(sig);

    let cur = null; // { kind: 'hymn'|'scripture', key }
    for (const raw of f) {
      const t = raw.replace(/\s{2,}/g, ' ').trim();
      if (!t) continue; // 문단 중간의 빈 span 줄 — cur는 끊지 않는다

      const hm = t.match(HYMN_HEADER);
      if (hm) {
        const number = hm[1];
        const title = hm[2].trim();
        const lang = HAS_HANGUL.test(title) ? 'ko' : 'en';
        if (!hymns.has(number)) {
          hymns.set(number, { number, titleKo: '', titleEn: '', lyricsKo: [], lyricsEn: [] });
        }
        hymns.get(number)[lang === 'ko' ? 'titleKo' : 'titleEn'] = title;
        cur = { kind: 'hymn', key: number };
        continue;
      }

      const rm = t.match(READING_HEADER);
      if (rm) {
        const korBook = rm[1].trim();
        const ref = rm[3].replace('.', ':');
        const key = `${korBook} ${ref}`;
        if (!scriptures.has(key)) scriptures.set(key, { reference: key, textKo: [], textEn: [] });
        cur = { kind: 'scripture', key };
        continue;
      }

      if (!cur) continue;
      const lang = HAS_HANGUL.test(t) ? 'ko' : 'en';
      if (cur.kind === 'hymn') hymns.get(cur.key)[lang === 'ko' ? 'lyricsKo' : 'lyricsEn'].push(t);
      else scriptures.get(cur.key)[lang === 'ko' ? 'textKo' : 'textEn'].push(t);
    }
  }

  // Firestore(Admin SDK)는 undefined 값을 못 받으므로 없는 필드는 null로 채운다
  return {
    hymns: [...hymns.values()]
      .map((h) => ({
        number: h.number,
        titleKo: h.titleKo || null,
        titleEn: h.titleEn || null,
        lyricsKo: h.lyricsKo.join('\n') || null,
        lyricsEn: h.lyricsEn.join('\n') || null,
      }))
      .filter((h) => h.lyricsKo || h.lyricsEn),
    scriptures: [...scriptures.values()]
      .map((r) => ({
        reference: r.reference,
        textKo: r.textKo.join(' ').trim() || null,
        textEn: r.textEn.join(' ').trim() || null,
      }))
      .filter((r) => r.textKo || r.textEn),
  };
}

/** 2면 — 교회 소식(번호 매긴 공지) + 그 아래 "교우 동정"(번호 없이 [태그] 본문 형식) —
 * 교우 동정도 화면에서는 그냥 교회 소식 목록 맨 아래에 이어 붙인다(번호는 화면에서
 * 다시 매기므로 원본 번호 유무는 상관없다). */
function extractNotices(lines) {
  const notices = [];
  let cur = null;
  let inTail = false; // "교우 동정" 제목을 지난 뒤
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (/^교우\s*동정$/.test(t)) {
      inTail = true;
      cur = null;
      continue;
    }
    // "N. [제목] 본문…" — 본문이 같은 줄에 있을 수도, 다음 줄로 넘어갈 수도 있다
    const numbered = t.match(/^(\d{1,2})\s*[.．]\s*\[([^\]]+)\]\s*(.*)$/);
    if (numbered) {
      cur = { title: numbered[2].trim(), body: numbered[3].trim() };
      notices.push(cur);
      continue;
    }
    // 교우 동정 구간엔 번호가 없다 — "[태그] 본문…" 형식만으로 새 항목 시작
    if (inTail) {
      const tagged = t.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (tagged) {
        cur = { title: tagged[1].trim(), body: tagged[2].trim() };
        notices.push(cur);
        continue;
      }
    }
    if (cur) cur.body = `${cur.body} ${t}`.trim();
  }
  return notices
    .map((n) => ({ title: n.title, body: n.body.replace(/¶/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((n) => n.title && n.body)
    .slice(0, 20);
}

/** 3면 위 — 지난주일 헌금 표 */
function extractOffering(lines) {
  const start = lines.findIndex((l) => /지난주일\s*헌금/.test(l));
  if (start < 0) return null;
  let columns = null;
  const rows = [];
  let total = '';
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/예배위원\s*안내/.test(t)) break;
    const cols = splitPillar(t);
    const label = cols[0].replace(/\s+/g, '');
    if (!label) continue;
    if (!columns) {
      if (label === '구분') columns = cols.slice(1).map((c) => c.replace(/\s+/g, ''));
      continue;
    }
    if (label === '합계') {
      // 합계 줄은 "지난주일 헌금" 표의 마지막 줄 — 다음 줄에 숫자만 있으면
      // 그게 합계 값이고(줄바꿈으로 따로 찍힘), 표는 여기서 끝난다.
      total = (cols[1] || lines[i + 1] || '').trim();
      break;
    }
    rows.push({ label, values: cols.slice(1).map((v) => v || '–') });
  }
  if (!columns || !rows.length) return null;
  return { columns, rows, total };
}

/** 예배위원 표 한 구간(주일/금요) 안에서, 담당별 값 줄을 모은다 — 라벨 줄이
 * 없는 값 줄(칸이 두 줄에 걸친 경우)은 직전까지 확정된 담당에 붙인다. */
function collectDutyRows(lines, startIdx, endIdx, dutyOrder) {
  const marks = [];
  for (let i = startIdx; i < endIdx; i++) {
    const cols = splitPillar(lines[i].trim());
    const name = cols[0].replace(/\s+/g, '');
    const pos = dutyOrder.indexOf(name);
    if (pos === marks.length) marks.push({ idx: i, ownVals: cols.slice(1) });
  }
  const chunks = dutyOrder.map(() => []);
  if (!marks.length) return chunks;
  for (let d = 0; d < marks.length; d++) {
    if (marks[d].ownVals.some(Boolean)) chunks[d].push(marks[d].ownVals);
    const nextIdx = d + 1 < marks.length ? marks[d + 1].idx : endIdx;
    const nextOwnEmpty = d + 1 < marks.length ? !marks[d + 1].ownVals.some(Boolean) : false;
    for (let i = marks[d].idx + 1; i < nextIdx; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      const owner = nextOwnEmpty ? d + 1 : d;
      chunks[Math.min(owner, dutyOrder.length - 1)].push(splitPillar(t));
    }
  }
  return chunks;
}

/** 3면 아래 — 예배위원 안내(주일/금요기도 로테이션 표) */
function extractDuty(lines) {
  const secStart = lines.findIndex((l) => /예배위원\s*안내/.test(l));
  if (secStart < 0) return [];
  const DUTY_ORDER = ['기도', '헌금', '안내', '친교'];
  const sectionEnd = (() => {
    const idx = lines.findIndex((l, i) => i > secStart && /설교\s*메모|나눔\s*질문/.test(l));
    return idx >= 0 ? idx : lines.length;
  })();
  const findHeader = (word, from) =>
    lines.findIndex((l, i) => {
      if (i <= from || i >= sectionEnd) return false;
      const cols = splitPillar(l.trim());
      return cols[0].replace(/\s+/g, '') === word && cols.length > 1 && /\d/.test(cols[1]);
    });
  const sundayHdr = findHeader('주일', secStart);
  const fridayHdr = findHeader('금요', secStart);

  const buildTable = (hdrIdx, endIdx, title) => {
    if (hdrIdx < 0) return null;
    const columns = splitPillar(lines[hdrIdx].trim()).slice(1);
    const chunks = collectDutyRows(lines, hdrIdx + 1, endIdx, DUTY_ORDER);
    const rows = DUTY_ORDER.map((name, d) => ({
      label: name,
      values: columns.map((_, c) => chunks[d].map((r) => r[c]).filter(Boolean).join('\n')),
    })).filter((r) => r.values.some(Boolean));
    return rows.length ? { title, columns, rows } : null;
  };

  const tables = [];
  const sundayEnd = fridayHdr >= 0 ? fridayHdr : sectionEnd;
  const sunday = buildTable(sundayHdr, sundayEnd, '주일');
  if (sunday) tables.push(sunday);
  const friday = buildTable(fridayHdr, sectionEnd, '금요기도');
  if (friday) tables.push(friday);
  return tables;
}

/** 4면 — 섬기는 사람들 */
function extractStaff(lines) {
  const start = lines.findIndex((l) => /섬기는\s*사람들/.test(l));
  if (start < 0) return [];
  const ROLES = ['담임목사', '원로목사', '협동목사', '부목사', '교역자', '시무장로', '시무안수집사', '안수집사'];
  const staff = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/온라인\s*바로가기|📍/.test(t)) break;
    const cols = splitPillar(t);
    if (!cols.length) continue;
    const norm = cols[0].replace(/\s+/g, '');
    const role = ROLES.find((r) => r === norm);
    if (role) {
      cur = { role, names: cols.slice(1).join(' ') };
      staff.push(cur);
    } else if (cur) {
      cur.names = `${cur.names} ${cols.join(' ')}`.trim();
    }
  }
  return staff.map((s) => ({ role: s.role, names: s.names.replace(/\s*,\s*/g, ', ').trim() }));
}

/** 텍스트로 찾은 면들 중 특정 표식이 있는 면을 고른다 */
function findFaceByMarker(faces, test) {
  return faces.find((f) => f.some((l) => test.test(l))) ?? [];
}
function findOrderFace(faces) {
  let best = null;
  let bestCount = 0;
  for (const f of faces) {
    const count = ORDER_LABELS.filter((l) => f.some((line) => line.trim().startsWith(l))).length;
    if (count > bestCount) {
      bestCount = count;
      best = f;
    }
  }
  return bestCount >= 3 ? best : [];
}

let noteLines = [];
let shareQuestions = [];
let orderOfWorship = [];
let sermonInfo = null;
let notices = [];
let offering = null;
let duty = [];
let staff = [];
let dawnReadings = [];
let fridayReading = null;
let hymns = [];
let scriptures = [];
try {
  const faces = buildFaces();
  noteLines = extractNoteLines(faces);
  shareQuestions = extractShareQuestions(faces);

  let orderFace = [];
  let noticesFace = [];
  try {
    orderFace = findOrderFace(faces);
    const r = extractOrderAndSermon(orderFace);
    orderOfWorship = r.order;
    sermonInfo = r.sermon;
    if (orderOfWorship.length) console.log(`[주보] 예배 순서 ${orderOfWorship.length}개 항목 추출`);
    const dr = extractDawnReadings(orderFace);
    dawnReadings = dr.dawn;
    fridayReading = dr.friday;
    if (dawnReadings.length) console.log(`[주보] 새벽예배 본문 ${dawnReadings.length}일 추출`);
  } catch (e) {
    console.log(`  ! 예배 순서 추출 실패(무해): ${e.message}`);
  }
  try {
    noticesFace = faces.find(
      (f) => f.filter((l) => /^\d{1,2}\s*[.．]\s*\[/.test(l.trim())).length >= 2,
    ) ?? [];
    notices = extractNotices(noticesFace);
    if (notices.length) console.log(`[주보] 교회 소식 ${notices.length}건 추출`);
  } catch (e) {
    console.log(`  ! 교회 소식 추출 실패(무해): ${e.message}`);
  }
  try {
    const hr = extractHymnsAndScriptures(faces, [orderFace, noticesFace]);
    hymns = hr.hymns;
    scriptures = hr.scriptures;
    if (hymns.length) console.log(`[주보] 찬송가 가사 ${hymns.length}곡 추출`);
    if (scriptures.length) console.log(`[주보] 성경 본문 ${scriptures.length}건 추출`);
  } catch (e) {
    console.log(`  ! 찬송가/성경 본문 추출 실패(무해): ${e.message}`);
  }
  try {
    const financeFace = findFaceByMarker(faces, /지난주일\s*헌금/);
    offering = extractOffering(financeFace);
    duty = extractDuty(financeFace);
    if (offering) console.log('[주보] 지난주일 헌금 표 추출');
    if (duty.length) console.log(`[주보] 예배위원 안내 ${duty.length}개 표 추출`);
  } catch (e) {
    console.log(`  ! 헌금/예배위원 추출 실패(무해): ${e.message}`);
  }
  try {
    const staffFace = findFaceByMarker(faces, /섬기는\s*사람들/);
    staff = extractStaff(staffFace);
    if (staff.length) console.log(`[주보] 섬기는 사람들 ${staff.length}건 추출`);
  } catch (e) {
    console.log(`  ! 섬기는 사람들 추출 실패(무해): ${e.message}`);
  }
} catch (e) {
  console.log(`  ! 설교 노트 추출 실패(무해): ${e.message}`);
}

/**
 * 주보의 "교회 소식"을 news 컬렉션(소식 탭 · 공지)에도 반영한다.
 * 홈페이지의 별도 소식 게시판은 관리자가 깜빡 잊고 안 올리면 그대로 방치되지만,
 * 주보는 매주 반드시 새로 만들어지는 문서라 이쪽을 기준으로 삼으면 소식 탭도
 * 늘 최신을 유지한다. 주(週)마다 카드 한 장 — 주보 안의 번호 매긴 소식을
 * 그대로 옮겨 담는다. 문서 id를 주보 날짜로 고정해 재실행해도 덮어쓰기만 한다.
 */
async function syncNoticesToNews() {
  if (!notices.length) return;
  const col = db.collection('news');
  // 예전에 공지 하나당 문서를 따로 만들던 방식의 잔재가 있으면 정리하고 한 장으로 합친다
  const old = await col.where('bulletinDate', '==', date).get();
  const batch = db.batch();
  for (const d of old.docs) batch.delete(d.ref);
  const [yr, mo, d0] = date.split('-').map(Number);
  const body = notices.map((n, i) => `${i + 1}. ${n.title}\n${n.body}`).join('\n\n');
  batch.set(col.doc(`bulletin-${date}`), {
    category: 'notice',
    // 기존(홈페이지 게시판 스크레이핑) 방식이 쓰던 표기와 그대로 맞춘다 —
    // "교회 소식 · " 접두어가 있어야 소식 탭에서 배너 썸네일도 자동으로 붙는다.
    title: `교회 소식 · ${yr}년 ${mo}월 ${d0}일`,
    date,
    body,
    imageUrl: null,
    // 주보 전체가 아니라 이 소식만 보여주는 전용 화면으로 연결한다
    url: `/notices/${date}`,
    alert: false,
    bulletinDate: date,
  });
  await batch.commit();
  console.log(`[소식] 주보 교회소식 ${notices.length}건 → news 컬렉션 카드 1건으로 반영`);
}

const existing = await db.doc(`bulletins/${date}`).get();
if (existing.exists && existing.get('pdfHash') === pdfHash) {
  console.log(`완료: ${date} 주보는 이미 최신입니다 (변경 없음).`);
  // 추출 결과가 기존 값과 다르면(로직 개선 등) 이미지는 그대로 두고 텍스트만 갱신
  const patch = {};
  const patchIfChanged = (key, val) => {
    if (val == null) return;
    if (Array.isArray(val) && !val.length) return;
    if (JSON.stringify(existing.get(key) ?? null) !== JSON.stringify(val)) patch[key] = val;
  };
  patchIfChanged('noteLines', noteLines);
  patchIfChanged('shareQuestions', shareQuestions);
  patchIfChanged('order', orderOfWorship);
  patchIfChanged('sermon', sermonInfo);
  patchIfChanged('notices', notices);
  patchIfChanged('offering', offering);
  patchIfChanged('duty', duty);
  patchIfChanged('staff', staff);
  patchIfChanged('dawnReadings', dawnReadings);
  patchIfChanged('fridayReading', fridayReading);
  patchIfChanged('hymns', hymns);
  patchIfChanged('scriptures', scriptures);
  if (Object.keys(patch).length) {
    await db.doc(`bulletins/${date}`).set(patch, { merge: true });
    console.log(`  → 텍스트 내용 갱신: ${Object.keys(patch).join(', ')}`);
  }
  await syncNoticesToNews();
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
  shareQuestions,
  order: orderOfWorship,
  sermon: sermonInfo,
  notices,
  offering,
  duty,
  staff,
  dawnReadings,
  fridayReading,
  hymns,
  scriptures,
  updatedAt: FieldValue.serverTimestamp(),
});
await syncNoticesToNews();
await writeStatus(true, `새 주보 ${ordered.length}면 등록`);
console.log(`완료: ${date} 주보 ${ordered.length}페이지 등록`);
