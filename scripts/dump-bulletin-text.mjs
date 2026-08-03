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

console.log('\n\n========== pdftotext -layout ==========');
execFileSync('pdftotext', ['-layout', join(dir, 'in.pdf'), join(dir, 'out.txt')]);
console.log(readFileSync(join(dir, 'out.txt'), 'utf8'));

console.log('\n\n========== pdftohtml -xml 면(face) 단위 재구성 ==========');
execFileSync('pdftohtml', ['-xml', '-q', join(dir, 'in.pdf'), join(dir, 'note')], { cwd: dir });
const xml = readFileSync(join(dir, 'note.xml'), 'utf8');
const unescapeHtml2 = (s) =>
  s
    .replace(/&amp;|&#0?38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;|&#0?34;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const pages = [
  ...xml.matchAll(
    /<page number="(\d+)"[^>]*height="([\d.]+)"[^>]*width="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g,
  ),
];
let faceIdx = 0;
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
    s: unescapeHtml2(m[5].replace(/<[^>]+>/g, '')),
  }));
  const halves = pageW > 700 ? [0, 1] : [null];
  for (const half of halves) {
    const hs =
      half === null ? spans : spans.filter((t) => (t.left + t.w / 2 < pageW / 2) === (half === 0));
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
    console.log(`\n---- 면 ${faceIdx} (원본 페이지 ${pm[1]}) ----`);
    for (const l of lines) if (l.trim()) console.log(l);
    faceIdx++;
  }
}
console.log(`\n날짜 추정: ${date}`);
