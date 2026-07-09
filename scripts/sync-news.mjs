/**
 * 교회 홈페이지(tvpc.church) → Firestore `news`/`events` 자동 동기화.
 *
 * GitHub Actions(.github/workflows/sync-news.yml)가 매일 실행한다.
 * - 소식: XE 게시판 RSS (교회 소식 게시판)
 * - 일정: 워드프레스 일정(The Events Calendar) iCal/RSS
 * 여러 후보 주소를 순서대로 시도하고, 성공한 소스만 가져온다.
 * 홈페이지에서 가져온 문서는 id가 web- 으로 시작 → 관리자 화면에서 직접
 * 등록한 문서와 섞이지 않고, 재실행 시 같은 글은 덮어쓴다(중복 없음).
 *
 * 로컬 실행:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" node scripts/sync-news.mjs
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

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const MAX_NEWS = Number(process.env.MAX_NEWS || 12);
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 8);

async function tryFetch(url) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'ko,en', accept: '*/*' },
      redirect: 'follow',
    });
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();

/** RSS 2.0 <item> 파싱 */
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const title = unescape(b.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const link = unescape(b.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
    const pub = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    if (title) items.push({ title, link, date: pub ? new Date(pub) : null });
  }
  return items;
}

/** XE 게시판 목록 HTML 파싱 — 행(tr) 단위로 제목 링크 + 날짜 추출 */
function parseXeBoard(html, origin) {
  const items = [];
  const seen = new Set();
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const a = row.match(/<a\s+href="([^"]*(?:Bulletin\/\d+|document_srl=\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const href = a[1].startsWith('http') ? a[1] : origin + (a[1].startsWith('/') ? '' : '/') + a[1];
    const title = unescape(a[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (title.length < 2 || seen.has(href)) continue;
    seen.add(href);
    const dm = row.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    const date = dm ? new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])) : null;
    items.push({ title, link: href, date });
  }
  return items;
}

/** iCal VEVENT 파싱 (줄바꿈 접기 해제 포함) */
function parseIcal(ics) {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '');
  const events = [];
  const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let m;
  while ((m = re.exec(unfolded))) {
    const b = m[1];
    const get = (k) => b.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, 'm'))?.[1]?.trim();
    const dt = get('DTSTART');
    const summary = unescape((get('SUMMARY') || '').replace(/\\,/g, ',').replace(/\\n/g, ' '));
    const location = unescape((get('LOCATION') || '').replace(/\\,/g, ',')).split(',')[0];
    const uid = get('UID') || summary + dt;
    if (!dt || !summary) continue;
    // DTSTART: 20260714T200000 / 20260714 (하루 종일)
    const dm = dt.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
    if (!dm) continue;
    const [, y, mo, da, hh, mi] = dm;
    const start = new Date(Number(y), Number(mo) - 1, Number(da), Number(hh ?? 12), Number(mi ?? 0));
    events.push({ uid, summary, location, start, allDay: !hh });
  }
  return events;
}

const KDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function timeLabel(d) {
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${pad(d.getMinutes())}`;
}

const isEventLike = (t) =>
  /행사|수련회|집회|캠프|성경학교|바자|세미나|콘서트|찬양의 밤|초청|잔치|축제|야유회|체육대회/.test(t);

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

// ── 1. 소식 (XE 게시판 RSS) ────────────────────────────────────
console.log('[소식] RSS 소스 탐색:');
// 주의: pleasantonkorean.com(옛 도메인)은 스팸 사이트로 넘어가 절대 사용 금지
// 참고: /xe/ 게시판은 현재 서버 오류(PHP 미실행)로 응답 불가 — 복구되면 다시 시도됨
const newsSources = [
  'https://tvpc.church/xe/index.php?mid=Bulletin&act=rss',
];

/** 워드프레스 목록 페이지(주보 등) HTML 파싱 — <article> 블록별 제목 링크 + 날짜 */
function parseWpList(html, origin) {
  const items = [];
  const seen = new Set();
  for (const block of html.split(/<article[\s>]/).slice(1)) {
    // 제목 링크: h1~h3 .entry-title 안의 앵커 우선, 없으면 텍스트 있는 첫 앵커
    let a =
      block.match(/<h\d[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) ||
      block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?[가-힣A-Za-z0-9][\s\S]*?)<\/a>/);
    if (!a) continue;
    let href = a[1];
    if (href.startsWith('/')) href = origin + href;
    if (!href.startsWith('http')) continue;
    const title = unescape(a[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (title.length < 3 || seen.has(href)) continue;
    seen.add(href);
    const dm =
      block.match(/datetime="(\d{4})-(\d{2})-(\d{2})/) ||
      block.match(/(\d{4})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/);
    const date = dm ? new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])) : null;
    items.push({ title, link: href, date });
  }
  return items;
}
let newsItems = [];

// 1순위: 주보/공지 페이지(워드프레스) HTML
for (const url of [
  'https://tvpc.church/wp/ko/anouncement/',
  'https://tvpc.church/wp/ko/announcement/',
]) {
  const html = await tryFetch(url);
  if (!html) continue;
  const items = parseWpList(html, 'https://tvpc.church');
  if (items.length) {
    newsItems = items;
    console.log(`  → ${url} 에서 ${items.length}건 파싱 성공`);
    break;
  }
  const arts = (html.match(/<article[\s>]/g) || []).length;
  console.log(`  → 게시글을 찾지 못함 (article ${arts}개). 앞부분: ${html.slice(0, 300).replace(/\s+/g, ' ')}`);
}

// 2순위: 워드프레스 REST API
if (newsItems.length === 0) {
  const body = await tryFetch(
    'https://tvpc.church/wp/wp-json/wp/v2/posts?per_page=12&_fields=date,link,title',
  );
  if (body) {
    try {
      const posts = JSON.parse(body);
      newsItems = posts.map((p) => ({
        title: unescape((p.title?.rendered ?? '').replace(/<[^>]+>/g, ' ')).trim(),
        link: p.link,
        date: p.date ? new Date(p.date) : null,
      })).filter((p) => p.title);
      if (newsItems.length) console.log(`  → WP REST API에서 ${newsItems.length}건 파싱 성공`);
    } catch {
      console.log(`  → REST 응답이 JSON 아님. 앞부분: ${body.slice(0, 150).replace(/\s+/g, ' ')}`);
    }
  }
}

// 3순위: XE 게시판 RSS (복구 시 자동 재개)
if (newsItems.length === 0) for (const url of newsSources) {
  const body = await tryFetch(url);
  if (!body) continue;
  const items = parseRss(body);
  if (items.length) {
    newsItems = items;
    console.log(`  → ${url} 에서 ${items.length}건 파싱 성공`);
    break;
  }
  console.log(`  → 응답은 있으나 RSS item 없음`);
}

// RSS가 없으면 게시판 목록 HTML을 직접 파싱
if (newsItems.length === 0) {
  console.log('[소식] RSS 실패 — 게시판 HTML 파싱 시도:');
  for (const url of ['https://tvpc.church/xe/Bulletin', 'https://tvpc.church/xe/?mid=Bulletin']) {
    const html = await tryFetch(url);
    if (!html) continue;
    const items = parseXeBoard(html, 'https://tvpc.church');
    if (items.length) {
      newsItems = items;
      console.log(`  → ${url} 에서 ${items.length}건 파싱 성공`);
      break;
    }
    const rows = (html.match(/<tr[\s>]/g) || []).length;
    console.log(`  → 게시글을 찾지 못함 (tr ${rows}개). 앞부분: ${html.slice(0, 300).replace(/\s+/g, ' ')}`);
  }
}

let newsWrote = 0;
for (const it of newsItems.slice(0, MAX_NEWS)) {
  const date = it.date && !isNaN(it.date) ? ymd(it.date) : ymd(new Date());
  // 주보 글 제목이 날짜뿐이면 알아보기 쉽게 "주보" 접두어
  if (/^\d{4}년\s*\d{1,2}월\s*\d{1,2}일$/.test(it.title)) {
    it.title = `주보 · ${it.title}`;
  }
  await db.doc(`news/web-${hash(it.link || it.title)}`).set(
    {
      title: it.title,
      category: isEventLike(it.title) ? 'event' : 'notice',
      date,
      url: it.link || null,
      imageUrl: null,
    },
    { merge: true },
  );
  console.log(`  ✓ ${date}  ${it.title}`);
  newsWrote++;
}

// ── 2. 일정 (워드프레스 The Events Calendar) ───────────────────
console.log('[일정] iCal/RSS 소스 탐색:');
const icalSources = [
  'https://tvpc.church/wp/events/?ical=1',
  'https://tvpc.church/wp/?post_type=tribe_events&ical=1',
];
let calEvents = [];
for (const url of icalSources) {
  const body = await tryFetch(url);
  if (!body) continue;
  if (body.includes('BEGIN:VCALENDAR')) {
    calEvents = parseIcal(body);
    console.log(`  → ${url} 에서 ${calEvents.length}건 파싱`);
    break;
  }
  console.log(`  → iCal 형식 아님. 앞부분: ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
}

const now = new Date();
now.setHours(0, 0, 0, 0);
const upcoming = calEvents
  .filter((e) => e.start >= now)
  .sort((a, b) => a.start - b.start)
  .slice(0, MAX_EVENTS);

let eventsWrote = 0;
for (const e of upcoming) {
  const d = e.start;
  await db.doc(`events/web-${hash(e.uid)}`).set(
    {
      dateLabel: `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${KDAYS[d.getDay()]}`,
      title: e.summary,
      detail: [e.allDay ? null : timeLabel(d), e.location || null].filter(Boolean).join(' · '),
      imageUrl: null,
      sortKey: ymd(d),
    },
    { merge: true },
  );
  console.log(`  ✓ ${ymd(d)}  ${e.summary}`);
  eventsWrote++;
}

// 지나간 web- 일정 정리
const oldDocs = await db.collection('events').get();
for (const snap of oldDocs.docs) {
  if (!snap.id.startsWith('web-')) continue;
  const sk = snap.get('sortKey');
  if (sk && sk < ymd(now)) {
    await snap.ref.delete();
    console.log(`  – 지난 일정 삭제: ${snap.get('title')}`);
  }
}

console.log(`완료: 소식 ${newsWrote}건, 일정 ${eventsWrote}건 동기화`);
if (newsWrote === 0 && eventsWrote === 0) {
  console.log('가져온 항목이 없습니다 — 위 탐색 로그에서 소스 상태를 확인하세요.');
}
process.exit(0);
