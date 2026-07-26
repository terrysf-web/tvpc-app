/**
 * 교회 사진 동기화 — 홈페이지 '나눔 › 교회 사진'(NextGEN 갤러리)의 앨범을
 * Firestore photos 컬렉션에 저장한다. 앱 홈 › 교회 사진에서 앨범 카드로 보인다.
 *
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" node scripts/sync-photos.mjs
 *
 * 사진 페이지의 앨범 목록 마크업(ngg-album-compact)에서 제목·표지·사진 수를 읽고,
 * 각 앨범 페이지를 열어 사진 주소들을 모은다.
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

const SITE = 'https://tvpc.church';
const PAGE_URL = `${SITE}/wp/ko/photos/`;
const MAX_ALBUMS = Number(process.env.MAX_PHOTO_ALBUMS || 24);
/** 앨범 안 사진 목록까지 가져올 앨범 수 (나머지는 표지만) */
const DETAIL_ALBUMS = Number(process.env.PHOTO_DETAIL_ALBUMS || 12);

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
    await jfetch(`${SITE}/wp/wp-login.php`);
    await jfetch(`${SITE}/wp/wp-login.php`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        log: WEB_USER,
        pwd: WEB_PASS,
        rememberme: 'forever',
        'wp-submit': 'Log In',
        redirect_to: `${SITE}/wp/`,
        testcookie: '1',
      }).toString(),
    });
    const ok = [...jar.keys()].some((k) => k.startsWith('wordpress_logged_in'));
    console.log(ok ? '  ✓ 홈페이지 로그인' : '  ! 홈페이지 로그인 실패 — 공개 사진만 사용');
  } catch {
    /* 로그인 실패해도 공개 사진으로 계속 */
  }
}

async function getText(url) {
  try {
    const res = await jfetch(url, { method: 'GET' });
    const body = await res.text();
    console.log(`  ${res.ok ? '✓' : '✗'} ${url.slice(0, 110)} → HTTP ${res.status}, ${body.length}B`);
    return res.ok ? body : null;
  } catch (e) {
    console.log(`  ✗ ${url.slice(0, 110)} → ${e.message}`);
    return null;
  }
}

const unescape = (s) =>
  (s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "2026년 5월 24일 주일 예배" → 2026-05-24 */
function dateFromTitle(title, fallback) {
  const m = title.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  const m2 = title.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, '0')}-${String(m2[3]).padStart(2, '0')}`;
  const y = title.match(/(20\d{2})/);
  return y ? `${y[1]}-01-01` : fallback;
}

/**
 * NextGEN 썸네일 주소에서 원본 주소를 만든다.
 * .../gallery/<폴더>/cache/260524_TVPC-15.jpg-nggid0447-ngg0dyn-....jpg
 *   → .../gallery/<폴더>/260524_TVPC-15.jpg
 */
function originalFromCache(src) {
  const m = src.match(/^(.*\/gallery\/[^/]+)\/cache\/(.+?\.(?:jpe?g|png|gif|webp))(?:-nggid|-ngg0dyn)/i);
  return m ? `${m[1]}/${m[2]}` : src;
}

/** 갤러리 폴더 이름 — 문서 ID로 쓰기 좋은 ASCII */
function folderOf(src) {
  return src.match(/\/gallery\/([^/]+)\//)?.[1] ?? null;
}

console.log('교회 사진(NextGEN 갤러리) 확인 중…');
await ensureSiteLogin();

const listHtml = await getText(PAGE_URL);
if (!listHtml) {
  console.error('사진 페이지를 열 수 없습니다.');
  process.exit(1);
}

// 앨범 카드 블록 단위로 자른다
const blocks = listHtml.split('ngg-album-compact').slice(1);
console.log(`  앨범 블록 ${blocks.length}개`);

const albums = [];
const seen = new Set();
for (const block of blocks) {
  const chunk = block.slice(0, 3000);
  const title = unescape(chunk.match(/<a[^>]+title=['"]([^'"]+)['"]/)?.[1] ?? '');
  const href = unescape(chunk.match(/<a[^>]+href=['"]([^'"]+)['"]/)?.[1] ?? '');
  const thumb = unescape(chunk.match(/<img[^>]+src=["']([^"']+)["']/)?.[1] ?? '');
  const count = Number(chunk.match(/image-counter[\s\S]{0,120}?<strong>(\d+)<\/strong>/)?.[1] ?? 0);
  if (!title || !thumb) continue;
  const folder = folderOf(thumb);
  if (!folder || seen.has(folder)) continue;
  seen.add(folder);
  albums.push({ title, href: href || PAGE_URL, cover: originalFromCache(thumb), folder, count });
}
console.log(`  앨범 ${albums.length}개 인식`);
if (albums.length === 0) {
  const i = listHtml.indexOf('ngg-album');
  console.log('  ! 앨범을 찾지 못했습니다. 마크업 일부:');
  console.log(listHtml.slice(Math.max(0, i), Math.max(0, i) + 1200));
  process.exit(1);
}

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
let saved = 0;

for (const [idx, a] of albums.slice(0, MAX_ALBUMS).entries()) {
  // 최근 앨범은 안의 사진 목록까지 가져온다 (앱에서 장수 표시·미리보기용)
  let images = [];
  if (idx < DETAIL_ALBUMS) {
    const albumHtml = await getText(a.href);
    if (albumHtml) {
      const set = new Set();
      for (const m of albumHtml.matchAll(/https?:\/\/[^"'\s]*\/gallery\/[^"'\s]+\.(?:jpe?g|png|gif|webp)/gi)) {
        const src = originalFromCache(unescape(m[0]));
        // 다른 앨범의 사진(관련 갤러리 등)은 제외
        if (folderOf(src) === a.folder && !/\/(?:thumbs|dynamic)\//i.test(src)) set.add(src);
      }
      images = [...set].sort();
    }
  }

  const doc = {
    title: a.title,
    date: dateFromTitle(a.title, today),
    url: a.href,
    imageUrl: a.cover,
    images: images.slice(0, 60),
    photoCount: a.count || images.length,
    source: 'nextgen',
    updatedAt: Date.now(),
  };
  const id = `g-${a.folder}`.slice(0, 120).replace(/[^\w.-]/g, '_');
  await db.doc(`photos/${id}`).set(doc, { merge: true });
  saved++;
  console.log(`  · ${doc.date} ${doc.title} — ${doc.photoCount}장`);
}

await db.doc('syncStatus/photos').set({
  at: new Date(),
  count: saved,
  note: `앨범 ${saved}개 동기화`,
});

console.log(`완료: 앨범 ${saved}개 저장`);
process.exit(0);
