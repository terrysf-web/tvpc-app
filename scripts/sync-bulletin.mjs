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
  // 게시글 후보: 본문 목록의 글 링크(메뉴 제외) — uid/문서 파라미터나 날짜가 있는 것
  const post = anchors.find((a) => {
    const href = abs(a.href);
    if (href === listUrl || href === `${listUrl}#` || a.href.startsWith('#')) return false;
    if (/uid=\d+|mod=document|document_srl|wr_id=/.test(a.href)) return true;
    return (
      /jubo/i.test(href) &&
      /(20\d{2}[-./년\s]*\d{1,2}[-./월\s]*\d{1,2}|\d{8}|주보)/.test(a.text) &&
      a.text !== '주보팀'
    );
  });
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
    postAnchors.find(
      (a) =>
        /download|attach|kboard_file|action=file/i.test(a.href) &&
        /pdf|주보|\d{8}|20\d{2}/i.test(`${a.text} ${a.href}`),
    ) ??
    // 본문에 링크 대신 <embed>/<iframe>으로 넣는 경우
    (() => {
      const m =
        postHtml.match(/<(?:embed|iframe|object)[^>]+(?:src|data)="([^"]+\.pdf[^"]*)"/i) ??
        postHtml.match(/(?:src|data|href)="([^"]+\.pdf[^"]*)"/i);
      return m ? { href: unescapeHtml(m[1]), text: '' } : null;
    })();
  if (!cand) {
    console.error('  ✗ 게시글에서 PDF 링크를 찾지 못했습니다.');
    dumpInteresting(postAnchors, postHtml);
    process.exit(1);
  }
  pdfUrl = cand.href;
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
  const m =
    hay.match(/(20\d{2})[-._/]?(\d{2})[-._/]?(\d{2})/) ??
    hay.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m) {
    const [y, mo, d] = [m[1], m[2].padStart(2, '0'), m[3].padStart(2, '0')];
    return `${y}-${mo}-${d}`;
  }
  const la = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  la.setDate(la.getDate() + ((7 - la.getDay()) % 7));
  return `${la.getFullYear()}-${String(la.getMonth() + 1).padStart(2, '0')}-${String(la.getDate()).padStart(2, '0')}`;
}
const date = bulletinDate();
const pdfHash = createHash('sha256').update(pdfBuf).digest('hex');

const existing = await db.doc(`bulletins/${date}`).get();
if (existing.exists && existing.get('pdfHash') === pdfHash) {
  console.log(`완료: ${date} 주보는 이미 최신입니다 (변경 없음).`);
  process.exit(0);
}

// ── 4. PDF → 반쪽 페이지 JPEG ──────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'jubo-'));
writeFileSync(join(dir, 'in.pdf'), pdfBuf);
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
