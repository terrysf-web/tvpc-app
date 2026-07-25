/**
 * 교회 홈페이지 사진 페이지(https://tvpc.church/wp/ko/photos/) → Firestore `photos`.
 *
 * GitHub Actions(.github/workflows/sync-photos.yml)가 매일 실행한다.
 * 사진 파일은 홈페이지에 그대로 두고 **주소만** 저장하므로 저장소 비용이 0이다.
 *
 * 탐색 순서 (되는 것만 쓴다 — 홈페이지 구조가 바뀌어도 한쪽이 살아 있게):
 *   1. 사진 페이지 HTML에서 사진 + 하위 갤러리 글 링크
 *   2. 워드프레스 REST — 사진 페이지의 자식 페이지·글 본문
 *   3. 워드프레스 미디어 라이브러리(wp/v2/media) — 최근 업로드 이미지
 *
 * 홈페이지에서 가져온 문서는 id가 web-ph- 로 시작 → 재실행 시 같은 사진은
 * 덮어쓰고(중복 없음), 홈페이지에서 내린 사진은 정리된다.
 *
 * 로컬 실행:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" node scripts/sync-photos.mjs
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();

const ORIGIN = 'https://tvpc.church';
const PHOTOS_PAGE = process.env.PHOTOS_URL || `${ORIGIN}/wp/ko/photos/`;
/** 너무 많이 담으면 앱 첫 로딩이 느려진다 — 최신순으로 이만큼만 */
const MAX_PHOTOS = Number(process.env.MAX_PHOTOS || 300);
/** 사진 페이지에서 따라 들어갈 하위 갤러리 글 수 */
const MAX_GALLERIES = Number(process.env.MAX_GALLERIES || 20);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// 사진이 회원에게만 보이는 경우를 위한 로그인 — 시크릿이 없으면 공개 사진만.
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
let siteLoginTried = false;
async function ensureSiteLogin() {
  if (siteLoginTried || !WEB_USER || !WEB_PASS) return;
  siteLoginTried = true;
  try {
    await jfetch(`${ORIGIN}/wp/wp-login.php`);
    await jfetch(`${ORIGIN}/wp/wp-login.php`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        log: WEB_USER,
        pwd: WEB_PASS,
        rememberme: 'forever',
        'wp-submit': 'Log In',
        redirect_to: `${ORIGIN}/wp/`,
        testcookie: '1',
      }).toString(),
    });
    const ok = [...jar.keys()].some((k) => k.startsWith('wordpress_logged_in'));
    console.log(ok ? '  ✓ 홈페이지 로그인' : '  ! 홈페이지 로그인 실패 — 공개 사진만 사용');
  } catch {
    /* 로그인 실패해도 공개 사진으로 계속 */
  }
}

async function tryFetch(url) {
  try {
    const res = await jfetch(url, { headers: { accept: '*/*' } });
    const body = await res.text();
    console.log(`  ${res.ok ? '✓' : '✗'} ${url} → HTTP ${res.status}, ${body.length}B`);
    return res.ok ? body : null;
  } catch (e) {
    console.log(`  ✗ ${url} → ${e.message}`);
    return null;
  }
}

const unescape = (s) =>
  (s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?38;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const ymd = (d) => d.toISOString().slice(0, 10);

/**
 * 사진이 아닌 이미지 걸러내기 — 로고·아이콘·버튼·플러그인 장식 등.
 * 교인 얼굴이 담긴 실제 사진만 남기는 것이 목적이다.
 */
const SKIP_PATTERNS =
  /(wp-includes|\/plugins\/|\/themes\/|logo|icon|favicon|avatar|gravatar|spacer|blank|button|banner|placeholder|emoji|captcha|loading|spinner|arrow|bullet)/i;

function isPhotoUrl(u) {
  if (!/^https?:\/\//i.test(u)) return false;
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return false;
  if (SKIP_PATTERNS.test(u)) return false;
  // 워드프레스 업로드 폴더의 사진만 (테마·플러그인 장식 제외)
  return /\/uploads?\//i.test(u) || /\/files?\//i.test(u);
}

/**
 * 워드프레스 축소본 주소 → 원본 주소.
 * "사진-1024x768.jpg" 처럼 크기가 붙은 파일명에서 크기를 떼면 원본이 된다.
 * 목록에는 축소본(가볍다), 확대해서 볼 때는 원본을 쓴다.
 */
function fullSize(u) {
  return u.replace(/-(\d{2,5})x(\d{2,5})(\.(?:jpe?g|png|webp))(\?|$)/i, '$3$4');
}

/** 축소본 크기(px) — 너무 작은 것(아이콘·썸네일 조각)은 사진으로 안 친다 */
function sizeOf(u) {
  const m = u.match(/-(\d{2,5})x(\d{2,5})\.(?:jpe?g|png|webp)(?:\?|$)/i);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/** HTML 본문에서 사진 주소 뽑기 — src, data-src(지연 로딩), srcset, 링크된 원본 */
function extractImages(html, base) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    if (!raw) return;
    let u;
    try {
      u = new URL(unescape(raw).trim(), base).href;
    } catch {
      return;
    }
    if (!isPhotoUrl(u)) return;
    const sz = sizeOf(u);
    // 150x150 같은 정사각 아이콘 크기는 목록용으로도 너무 거칠다
    if (sz && (sz.w < 300 || sz.h < 200)) return;
    const full = fullSize(u);
    if (seen.has(full)) return;
    seen.add(full);
    out.push({ imageUrl: full, thumbUrl: u !== full ? u : null });
  };

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src =
      tag.match(/\bdata-(?:large-file|full-url|orig-file)=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    push(src);
  }
  // 갤러리는 보통 원본을 <a href>로 감싼다 — 그쪽이 더 큰 사진이다
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+\.(?:jpe?g|png|webp))["']/gi)) {
    push(m[1]);
  }
  return out;
}

/** 페이지 제목 — <h1> 우선, 없으면 <title>에서 사이트 이름 앞부분 */
function pageTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i)?.[1];
  const t = h1 ? unescape(h1) : unescape(html.match(/<title>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? '');
  return t.split(/\s[–|-]\s/)[0].trim();
}

/** 본문에서 날짜 추출 — <time datetime>, 업로드 경로(/2026/03/), 한글 날짜 */
function pageDate(html, imageUrl) {
  const dt = html.match(/<time[^>]+datetime=["'](\d{4}-\d{2}-\d{2})/i)?.[1];
  if (dt) return dt;
  const ko = html.match(/(20\d{2})[.\-년\s]+(\d{1,2})[.\-월\s]+(\d{1,2})/);
  if (ko) return `${ko[1]}-${String(ko[2]).padStart(2, '0')}-${String(ko[3]).padStart(2, '0')}`;
  const up = imageUrl?.match(/\/uploads?\/(20\d{2})\/(\d{2})\//i);
  if (up) return `${up[1]}-${up[2]}-01`;
  return null;
}

// ──────────────────────────────────────────────────────────────
// 수집
// ──────────────────────────────────────────────────────────────
await ensureSiteLogin();

/** imageUrl(원본) → 사진 문서 */
const found = new Map();
function collect(items, { album, date, url }) {
  for (const it of items) {
    if (found.has(it.imageUrl)) continue;
    found.set(it.imageUrl, {
      imageUrl: it.imageUrl,
      thumbUrl: it.thumbUrl,
      album: album || '교회 사진',
      date: date || ymd(new Date()),
      url: url ?? null,
    });
  }
}

console.log(`사진 페이지 확인: ${PHOTOS_PAGE}`);
const rootHtml = await tryFetch(PHOTOS_PAGE);

if (rootHtml) {
  const rootTitle = pageTitle(rootHtml) || '교회 사진';
  const rootImages = extractImages(rootHtml, PHOTOS_PAGE);
  collect(rootImages, {
    album: rootTitle,
    date: pageDate(rootHtml, rootImages[0]?.imageUrl),
    url: PHOTOS_PAGE,
  });
  console.log(`  사진 페이지에서 ${rootImages.length}장`);

  // 하위 갤러리 글 — 사진 페이지 안의 같은 사이트 링크를 따라간다
  const links = new Set();
  for (const m of rootHtml.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) {
    let u;
    try {
      u = new URL(unescape(m[1]), PHOTOS_PAGE);
    } catch {
      continue;
    }
    if (u.hostname !== new URL(ORIGIN).hostname) continue;
    if (/\.(jpe?g|png|webp|pdf|zip)$/i.test(u.pathname)) continue;
    if (u.href.replace(/\/$/, '') === PHOTOS_PAGE.replace(/\/$/, '')) continue;
    // 사진 페이지 아래 글이거나, 갤러리·앨범처럼 보이는 주소만
    if (!/photo|gallery|album|사진/i.test(decodeURIComponent(u.href))) continue;
    links.add(u.href);
    if (links.size >= MAX_GALLERIES) break;
  }
  console.log(`  하위 갤러리 후보 ${links.size}개`);

  for (const link of links) {
    const html = await tryFetch(link);
    if (!html) continue;
    const imgs = extractImages(html, link);
    if (imgs.length === 0) continue;
    collect(imgs, {
      album: pageTitle(html) || rootTitle,
      date: pageDate(html, imgs[0]?.imageUrl),
      url: link,
    });
    console.log(`    ✓ ${pageTitle(html)} — ${imgs.length}장`);
  }
}

// 2. 워드프레스 REST — 사진 페이지의 자식 페이지·글 본문
if (found.size < MAX_PHOTOS) {
  console.log('워드프레스 REST 확인');
  const listRaw = await tryFetch(
    `${ORIGIN}/wp/wp-json/wp/v2/pages?per_page=30&_fields=title,link,date,content,parent&search=photo`,
  );
  let list = [];
  try {
    list = listRaw ? JSON.parse(listRaw) : [];
  } catch {
    list = [];
  }
  for (const page of Array.isArray(list) ? list : []) {
    const html = page?.content?.rendered;
    if (typeof html !== 'string') continue;
    const link = page.link ?? PHOTOS_PAGE;
    const imgs = extractImages(html, link);
    if (imgs.length === 0) continue;
    collect(imgs, {
      album: unescape(page?.title?.rendered) || '교회 사진',
      date: typeof page.date === 'string' ? page.date.slice(0, 10) : null,
      url: link,
    });
    console.log(`  ✓ ${unescape(page?.title?.rendered)} — ${imgs.length}장`);
  }
}

// 3. 미디어 라이브러리 — 위에서 아무것도 못 찾았을 때의 마지막 수단
if (found.size === 0) {
  console.log('미디어 라이브러리 확인 (최근 업로드)');
  const raw = await tryFetch(
    `${ORIGIN}/wp/wp-json/wp/v2/media?media_type=image&per_page=60&_fields=source_url,date,title,media_details`,
  );
  let media = [];
  try {
    media = raw ? JSON.parse(raw) : [];
  } catch {
    media = [];
  }
  for (const m of Array.isArray(media) ? media : []) {
    const src = m?.source_url;
    if (typeof src !== 'string' || !isPhotoUrl(src)) continue;
    const w = m?.media_details?.width ?? 0;
    const h = m?.media_details?.height ?? 0;
    if (w && h && (w < 500 || h < 300)) continue; // 장식용 작은 이미지 제외
    // 목록용 축소본은 미디어 정보에 있는 medium/large 크기를 쓴다
    const sizes = m?.media_details?.sizes ?? {};
    const thumb = sizes.medium_large?.source_url ?? sizes.medium?.source_url ?? null;
    collect([{ imageUrl: src, thumbUrl: thumb }], {
      album: unescape(m?.title?.rendered) || '교회 사진',
      date: typeof m.date === 'string' ? m.date.slice(0, 10) : null,
      url: PHOTOS_PAGE,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// 저장
// ──────────────────────────────────────────────────────────────
const photos = [...found.values()]
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, MAX_PHOTOS);

if (photos.length === 0) {
  console.log('가져온 사진이 없습니다 — 위 탐색 로그에서 소스 상태를 확인하세요.');
  console.log('기존 사진은 그대로 두고 종료합니다(홈페이지 일시 장애로 지워지지 않게).');
  process.exit(0);
}

const writtenIds = new Set();
let wrote = 0;
for (const p of photos) {
  const id = `web-ph-${hash(p.imageUrl)}`;
  writtenIds.add(id);
  await db.doc(`photos/${id}`).set(
    {
      imageUrl: p.imageUrl,
      thumbUrl: p.thumbUrl ?? null,
      album: p.album,
      caption: null,
      date: p.date,
      url: p.url,
    },
    { merge: true },
  );
  wrote++;
}

// 홈페이지에서 내려간 사진 정리 — 홈페이지가 원본이므로 매번 맞춘다
let removed = 0;
const old = await db.collection('photos').get();
for (const snap of old.docs) {
  if (!snap.id.startsWith('web-ph-')) continue; // 관리자가 직접 올린 사진은 보존
  if (!writtenIds.has(snap.id)) {
    await snap.ref.delete();
    removed++;
  }
}

await db.doc('syncStatus/photos').set({
  updatedAt: Date.now(),
  count: wrote,
  source: PHOTOS_PAGE,
});

const albums = new Set(photos.map((p) => p.album));
console.log(`완료: 사진 ${wrote}장 (묶음 ${albums.size}개) 동기화, 옛 사진 ${removed}장 정리`);
process.exit(0);
