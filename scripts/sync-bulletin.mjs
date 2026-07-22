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

// ── 1. 로그인 ──────────────────────────────────────────────────
console.log('[주보] 홈페이지 로그인:');
await jfetch(`${ORIGIN}/wp/wp-login.php`); // 테스트 쿠키 수령
const login = await jfetch(`${ORIGIN}/wp/wp-login.php`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    log: WEB_USER,
    pwd: WEB_PASS,
    rememberme: 'forever',
    'wp-submit': 'Log In',
    redirect_to: `${ORIGIN}/wp/jubo/`,
    testcookie: '1',
  }).toString(),
});
const loggedIn = [...jar.keys()].some((k) => k.startsWith('wordpress_logged_in'));
if (!loggedIn) {
  console.error(`  ✗ 로그인 실패 (HTTP ${login.status}) — 아이디/비밀번호를 확인해 주세요.`);
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

if (!pdfUrl) {
  // 게시글 후보: KBoard 글 링크(?mod=document&uid=) 중 "M/D/YYYY 주보" 제목의 최신 날짜.
  const dated = [];
  for (const a of anchors) {
    if (!/uid=\d+/.test(a.href) || /mod=(editor|remove)/.test(a.href)) continue;
    const m =
      a.text.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/) ??
      a.text.match(/(20\d{2})[-.년\s]*(\d{1,2})[-.월\s]*(\d{1,2})/);
    if (!m || !/주보/.test(a.text)) continue;
    const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[1], m[2]];
    dated.push({ ...a, key: `${y}${mo.padStart(2, '0')}${d.padStart(2, '0')}` });
  }
  dated.sort((x, y) => y.key.localeCompare(x.key));
  const post =
    dated[0] ??
    anchors.find(
      (a) =>
        /uid=\d+|mod=document/.test(a.href) &&
        !/mod=(editor|remove)/.test(a.href) &&
        /주보/.test(a.text),
    );
  if (!post) {
    console.error('  ✗ 주보 게시글 링크를 찾지 못했습니다.');
    dumpInteresting(anchors, listHtml);
    process.exit(1);
  }
  const postUrl = abs(post.href);
  pdfLabel = post.text;
  console.log(`  → 최신 게시글: "${post.text}" ${postUrl}`);
  const postHtml = await (await jfetch(postUrl)).text();
  const postAnchors = [];
  for (const m of postHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    postAnchors.push({
      href: unescapeHtml(m[1]),
      text: unescapeHtml(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
    });
  }
  const cand =
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
    })();
  if (!cand) {
    console.error('  ✗ 게시글에서 PDF 링크를 찾지 못했습니다.');
    dumpInteresting(postAnchors, postHtml);
    // ".pdf" 주변 마크업을 보여 구조 파악
    const idx = postHtml.search(/\.pdf/i);
    if (idx >= 0) {
      console.error('  ".pdf" 주변 마크업:');
      console.error('  ' + postHtml.slice(Math.max(0, idx - 700), idx + 300).replace(/\s+/g, ' '));
    }
    process.exit(1);
  }
  pdfUrl = cand.href.startsWith('?') ? `${postUrl.split('?')[0]}${cand.href}` : cand.href;
  if (!pdfLabel) pdfLabel = cand.text;
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
try {
  await syncDawnVerses();
} catch (e) {
  console.log(`  ! 새벽예배 본문 등록 실패(주보 등록은 계속): ${e.message}`);
}

async function syncDawnVerses() {
  execFileSync('pdftotext', ['-layout', join(dir, 'in.pdf'), join(dir, 'out.txt')]);
  const text = readFileSync(join(dir, 'out.txt'), 'utf8');
  const lines = text.split('\n');

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

  // 요일 줄 아래 3줄 안에서 "이사야 34장" 형태의 본문 토큰 수집
  const passages = [];
  for (let i = dayLine + 1; i <= Math.min(dayLine + 3, lines.length - 1); i++) {
    for (const m of lines[i].matchAll(/([가-힣]+)\s*(\d{1,3})장/g)) {
      passages.push({ book: m[1], chapter: Number(m[2]), col: m.index + m[0].length / 2 });
    }
    if (passages.length) break;
  }
  if (!passages.length) {
    console.log('  → 새벽예배 본문을 찾지 못해 매일 말씀 등록을 건너뜁니다.');
    return;
  }

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

  console.log('[말씀] 새벽예배 본문 등록:');
  let wrote = 0;
  const usedDates = new Set();
  for (const day of days) {
    // 같은 열(column)의 본문 찾기 — 표 열 위치가 가장 가까운 토큰.
    // 한 본문은 한 요일에만 쓴다(금요집회 열의 중복 "금(n일)"이 옆 열을 뺏지 않도록).
    let best = null;
    for (const p of passages) {
      if (p.used) continue;
      const dist = Math.abs(p.col - day.col);
      if (dist <= 14 && (!best || dist < Math.abs(best.col - day.col))) best = p;
    }
    if (!best) continue;
    best.used = true;
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
    // 본문 구절을 인용해 묵상·적용·기도 가이드를 자연스럽게 구성
    const clip = (s, n = 60) =>
      s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s;
    const q1 = clip(verses[0]);
    const midIdx = Math.min(verses.length - 1, Math.floor(verses.length / 2));
    const qMid = clip(verses[midIdx]);
    await docRef.set({
      date: vDate,
      reference: ref,
      heroText: hero,
      passageTitle: `${ref} (새벽예배 본문)`,
      passage: verses.map((t, i) => ({ verse: i + 1, text: t })),
      meditation:
        `오늘 새벽예배 본문은 ${ref}(전체 ${verses.length}절)입니다.\n\n` +
        `"${q1}" (1절)\n\n` +
        `본문을 처음부터 끝까지 천천히 읽어 내려가며, 오늘 나에게 주시는 한 구절을 찾아보세요. ` +
        `마음에 머무는 구절이 있다면 그 앞에 잠시 멈추어 보세요. ` +
        `그 한 구절이 오늘 하나님께서 나에게 건네시는 말씀입니다.`,
      application: [
        `1절 "${q1}" — 이 말씀을 오늘의 첫 마음으로 삼아 보세요.`,
        `${midIdx + 1}절 "${qMid}" — 지금 나의 형편에서 이 말씀이 갖는 의미를 생각해 보세요.`,
        '본문에서 받은 은혜 한 가지를 오늘 만나는 한 사람과 나누어 보세요.',
      ],
      prayer:
        `말씀으로 하루를 열게 하시니 감사합니다. ` +
        `${ref}의 말씀, 특히 "${q1}"라는 말씀을 마음에 새깁니다. ` +
        `이 말씀이 오늘 저의 생각과 걸음을 인도하게 하시고, 읽는 것에서 그치지 않고 ` +
        `삶의 자리에서 열매 맺게 하옵소서. 예수님의 이름으로 기도합니다. 아멘.`,
      imageUrl: null,
      source: 'auto',
    });
    console.log(`  ✓ ${vDate}  ${ref} (${verses.length}절)`);
    wrote++;
  }
  console.log(`  → 매일 말씀 ${wrote}건 등록`);
}

const existing = await db.doc(`bulletins/${date}`).get();
if (existing.exists && existing.get('pdfHash') === pdfHash) {
  console.log(`완료: ${date} 주보는 이미 최신입니다 (변경 없음).`);
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
  updatedAt: FieldValue.serverTimestamp(),
});
console.log(`완료: ${date} 주보 ${ordered.length}페이지 등록`);
