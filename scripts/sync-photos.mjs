/**
 * 교회 사진 동기화 — 홈페이지 '나눔 › 교회 사진' 게시판(KBoard)의 글을
 * Firestore photos 컬렉션에 저장한다. 앱의 홈 › 교회 사진에서 보인다.
 *
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" node scripts/sync-photos.mjs
 *
 * 게시판 이미지가 회원 전용인 경우를 위해 TVPC_WEB_USER/PASS 로 로그인한다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();

const LIST_URL = 'https://tvpc.church/wp/ko/photos/';
const MAX_POSTS = Number(process.env.MAX_PHOTOS || 24);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const WEB_USER = process.env.TVPC_WEB_USER;
const WEB_PASS = process.env.TVPC_WEB_PASS;
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
async function ensureSiteLogin() {
  if (!WEB_USER || !WEB_PASS) return;
  try {
    await jfetch('https://tvpc.church/wp/wp-login.php');
    await jfetch('https://tvpc.church/wp/wp-login.php', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        log: WEB_USER,
        pwd: WEB_PASS,
        rememberme: 'forever',
        'wp-submit': 'Log In',
        redirect_to: 'https://tvpc.church/wp/',
        testcookie: '1',
      }).toString(),
    });
    const ok = [...jar.keys()].some((k) => k.startsWith('wordpress_logged_in'));
    console.log(ok ? '  ✓ 홈페이지 로그인' : '  ! 홈페이지 로그인 실패 — 공개 내용만 사용');
  } catch {
    /* 로그인 실패해도 공개 내용으로 계속 */
  }
}

const unescape = (s) =>
  (s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?38;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .trim();

const stripTags = (s) => unescape(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** 이미지 주소 정리 — 상대경로 보정, 썸네일 파라미터 제거 */
function absUrl(src, base) {
  try {
    const u = new URL(unescape(src), base);
    return u.href;
  } catch {
    return null;
  }
}

async function getHtml(url) {
  const res = await jfetch(url, { method: 'GET' });
  const body = await res.text();
  console.log(`  ${res.ok ? '✓' : '✗'} ${url} → HTTP ${res.status}, ${body.length}B`);
  return res.ok ? body : null;
}

console.log('교회 사진 게시판 확인 중…');
await ensureSiteLogin();

const listHtml = await getHtml(LIST_URL);
if (!listHtml) {
  console.error('사진 게시판을 열 수 없습니다.');
  process.exit(1);
}

// KBoard 글 링크 — ?mod=document&uid=1234 형태
const uids = [];
for (const m of listHtml.matchAll(/[?&]uid=(\d+)/g)) {
  const uid = m[1];
  if (!uids.includes(uid)) uids.push(uid);
}
console.log(`  글 링크 ${uids.length}개 발견`);
if (uids.length === 0) {
  // 목록 구조가 바뀐 경우 진단용으로 주변 마크업을 남긴다
  const i = listHtml.search(/kboard-list|kboard-latest|kboard-gallery/);
  console.log('  ! 글 링크를 찾지 못했습니다. 목록 마크업 일부:');
  console.log(listHtml.slice(Math.max(0, i), Math.max(0, i) + 1200));
  process.exit(1);
}

let saved = 0;
for (const uid of uids.slice(0, MAX_POSTS)) {
  const url = `${LIST_URL}?mod=document&uid=${uid}`;
  const html = await getHtml(url);
  if (!html) continue;

  // 제목 — KBoard 문서 제목 우선, 없으면 og:title
  const title =
    stripTags(
      html.match(/class=["'][^"']*kboard-title[^"']*["'][^>]*>([\s\S]{0,300}?)<\//)?.[1] ??
        html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/)?.[1] ??
        '',
    ).replace(/\s*[-|–]\s*트라이밸리.*$/, '') || `교회 사진 ${uid}`;

  // 날짜 — 문서 정보의 YYYY-MM-DD 또는 YYYY.MM.DD
  const dm =
    html.match(/(20\d{2})[-.](\d{1,2})[-.](\d{1,2})/) ??
    html.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  const date = dm
    ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  // 본문 영역의 이미지들
  const bodyPart =
    html.match(
      /class=["'][^"']*(?:content-view|kboard-content|document-content)[^"']*["']([\s\S]{0,120000}?)(?:<\/article|kboard-document-action|kboard-comments)/,
    )?.[1] ?? html;
  const images = [];
  for (const m of bodyPart.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/g)) {
    const src = absUrl(m[1], url);
    // 아이콘·이모티콘·플러그인 장식 이미지는 제외
    if (
      src &&
      !images.includes(src) &&
      /\/uploads\//.test(src) &&
      !/(?:icon|emoji|blank|spacer|logo)/i.test(src)
    ) {
      images.push(src);
    }
  }

  const doc = {
    title,
    date,
    url,
    imageUrl: images[0] ?? null,
    images: images.slice(0, 40),
    updatedAt: Date.now(),
  };
  await db.doc(`photos/p-${uid}`).set(doc, { merge: true });
  saved++;
  console.log(`  · ${date} ${title} — 사진 ${images.length}장`);
}

await db.doc('syncStatus/photos').set({
  at: new Date(),
  count: saved,
  note: `${saved}개 글 동기화`,
});

console.log(`완료: ${saved}개 저장`);
process.exit(0);
