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

// 게시판 본문(썸네일 이미지)이 회원에게만 보이는 경우를 위한 로그인 —
// 시크릿이 없으면 로그인 없이 공개 이미지만 쓴다.
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
    console.log(ok ? '  ✓ 홈페이지 로그인 (썸네일용)' : '  ! 홈페이지 로그인 실패 — 공개 이미지만 사용');
  } catch {
    /* 로그인 실패해도 계속 */
  }
}

const MAX_NEWS = Number(process.env.MAX_NEWS || 12);
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 120);
/** 소식 탭 "행사" 카드로 함께 노출할 일정 수 (반복 모임까지 다 올리면 소식이 넘침) */
const MAX_EVENT_NEWS = Number(process.env.MAX_EVENT_NEWS || 6);

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
    .replace(/&#0?38;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
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
    const raw = unescape(a[1]);
    const href = raw.startsWith('http') ? raw : origin + (raw.startsWith('/') ? '' : '/') + raw;
    const title = unescape(a[2].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
      // 게시판 "New"/"Hot" 배지가 제목 텍스트에 딸려 들어오는 것 제거
      .replace(/^(?:new|hot)\s+/i, '')
      .replace(/\s+(?:new|hot)$/i, '');
    if (title.length < 2 || seen.has(href)) continue;
    seen.add(href);
    const dm = row.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    const date = dm ? new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])) : null;
    items.push({ title, link: href, date });
  }
  return items;
}

/** iCal 날짜 문자열 → { date, allDay } (시간 없으면 정오) */
function icalDate(s) {
  const m = (s || '').match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, da, hh, mi] = m;
  return {
    date: new Date(Number(y), Number(mo) - 1, Number(da), Number(hh ?? 12), Number(mi ?? 0)),
    allDay: !hh,
  };
}

const ICAL_DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * 반복 일정(RRULE) 전개 — WEEKLY/MONTHLY/YEARLY를 오늘~horizon 사이
 * 발생일로 펼친다 (교회 달력의 매주 모임·월례회 대응, 근사 구현).
 */
function expandRrule(rule, first, exdates, horizon) {
  const freq = rule.match(/FREQ=(\w+)/)?.[1];
  if (!freq || freq === 'DAILY') return [first];
  const interval = Number(rule.match(/INTERVAL=(\d+)/)?.[1] || 1);
  const until = icalDate(rule.match(/UNTIL=([\dTZ]+)/)?.[1])?.date;
  const byday = (rule.match(/BYDAY=([^;]+)/)?.[1] || '')
    .split(',')
    .map((d) => ICAL_DOW[d.slice(-2)])
    .filter((n) => n !== undefined);
  const days = byday.length ? byday : [first.getDay()];

  const out = [];
  const startScan = new Date(Math.max(first.getTime(), Date.now() - 86400e3));
  const end = until && until < horizon ? until : horizon;
  const weekMs = 7 * 86400e3;
  for (let t = startScan.getTime(); t <= end.getTime() && out.length < 40; t += 86400e3) {
    const d = new Date(t);
    d.setHours(first.getHours(), first.getMinutes(), 0, 0);
    let hit = false;
    if (freq === 'WEEKLY') {
      const weeks = Math.floor((t - first.getTime()) / weekMs);
      hit = days.includes(d.getDay()) && weeks % interval === 0;
    } else if (freq === 'MONTHLY') {
      const months =
        (d.getFullYear() - first.getFullYear()) * 12 + d.getMonth() - first.getMonth();
      hit = d.getDate() === first.getDate() && months % interval === 0;
    } else if (freq === 'YEARLY') {
      hit = d.getDate() === first.getDate() && d.getMonth() === first.getMonth();
    }
    if (hit && !exdates.has(ymd(d))) out.push(d);
  }
  return out;
}

/** iCal VEVENT 파싱 (줄바꿈 접기 해제 + 반복 일정 전개) */
function parseIcal(ics) {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '');
  const events = [];
  const horizon = new Date(Date.now() + 120 * 86400e3);
  const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let m;
  while ((m = re.exec(unfolded))) {
    const b = m[1];
    const get = (k) => b.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, 'm'))?.[1]?.trim();
    const dt = get('DTSTART');
    const summary = unescape((get('SUMMARY') || '').replace(/\\,/g, ',').replace(/\\n/g, ' '));
    const location = unescape((get('LOCATION') || '').replace(/\\,/g, ',')).split(',')[0];
    const uid = get('UID') || summary + dt;
    const url = get('URL') || null;
    if (!dt || !summary) continue;
    const parsed = icalDate(dt);
    if (!parsed) continue;

    const exdates = new Set();
    for (const ex of b.match(/^EXDATE[^:\n]*:(.*)$/gm) || []) {
      for (const v of ex.split(':')[1].split(',')) {
        const e = icalDate(v);
        if (e) exdates.add(ymd(e.date));
      }
    }
    const rrule = get('RRULE');
    const starts = rrule ? expandRrule(rrule, parsed.date, exdates, horizon) : [parsed.date];
    for (const start of starts) {
      events.push({
        uid: `${uid}@${ymd(start)}`,
        summary,
        location,
        start,
        allDay: parsed.allDay,
        url,
      });
    }
  }
  return events;
}

/**
 * 달력 페이지(Simple Calendar 플러그인) 그리드 파싱 — 날짜별 <ul class="events">
 * 블록에서 일정 제목·설명을 추출한다. 구글 캘린더 공개 ICS가 막혀 있어
 * 서버 렌더링된 이 그리드가 전체 일정의 소스다.
 */
function parseCalendarGrid(html) {
  const events = [];
  const re = /<ul class="events" aria-labelledby="[^"]*?(\d{8})">([\s\S]*?)<\/ul>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, d8, block] = m;
    const start = new Date(
      Number(d8.slice(0, 4)),
      Number(d8.slice(4, 6)) - 1,
      Number(d8.slice(6, 8)),
      12,
      0,
    );
    for (const li of block.split(/<li[\s>]/).slice(1)) {
      // class 속성이 뒤에 오는 경우도 잡는다 — <span tabindex="0" ... class="title confirmed">
      const t = li.match(/<span[^>]*class="title[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      if (!t) continue;
      const summary = unescape(t[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!summary) continue;
      const desc = li.match(/<div class="eventdesc">([\s\S]*?)<\/div>/);
      const detail = desc
        ? unescape(desc[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
        : '';
      const tm = li.match(/class="event-time[^"]*"[^>]*>([^<]+)</);
      if (tm) {
        const hm = tm[1].match(/(\d{1,2}):(\d{2})/);
        if (hm) start.setHours(Number(hm[1]) + (/오후|PM/i.test(tm[1]) && Number(hm[1]) < 12 ? 12 : 0), Number(hm[2]));
      }
      events.push({
        uid: `grid-${d8}-${summary}`,
        summary,
        location: '',
        start: new Date(start),
        allDay: !tm,
        url: null,
        detail,
      });
    }
  }
  return events;
}

/** 달력 페이지에서 ICS 구독 링크 자동 발견 (구독 버튼·구글 캘린더 embed) */
function findIcsLinks(html) {
  const out = new Set();
  let m;
  const re =
    /["'](webcal:\/\/[^"']+|https?:\/\/[^"']+?(?:\.ics[^"']*|[?&](?:ical|outlook-ical)=1[^"']*))["']/gi;
  while ((m = re.exec(html))) {
    out.add(unescape(m[1]).replace(/^webcal:\/\//, 'https://'));
  }
  const g = /calendar\.google\.com\/calendar\/(?:embed|u\/\d+\/embed)\?[^"']*?src=([^&"']+)/gi;
  while ((m = g.exec(html))) {
    const id = encodeURIComponent(decodeURIComponent(m[1]));
    out.add(`https://calendar.google.com/calendar/ical/${id}/public/basic.ics`);
  }
  return [...out];
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

/** 글 페이지의 대표 이미지(og:image) — 카드 썸네일용. 실패해도 무시 */
const ogImageCache = new Map();
async function fetchOgImage(url) {
  if (!url || !url.includes('tvpc.church')) return null;
  if (ogImageCache.has(url)) return ogImageCache.get(url);
  let img = null;
  try {
    await ensureSiteLogin();
    const res = await jfetch(url);
    if (res.ok) {
      const html = await res.text();
      const m =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/);
      let cand = m ? m[1] : null;
      // og:image가 없으면(주보 게시판 등) 본문 영역의 첫 이미지를 쓴다 —
      // 교회소식 배너처럼 글 머리에 넣는 그림이 카드 썸네일이 된다
      if (!cand) {
        const area = html.match(
          /class=["'][^"']*(?:content-view|kboard-content|document-content)[^"']*["'][\s\S]{0,20000}?<img[^>]+src=["']([^"']+)["']/,
        );
        cand = area ? area[1] : null;
      }
      if (!cand) {
        // 지연 로딩(data-src)·배경 이미지까지 포함해 업로드 이미지를 찾는다
        for (const m2 of html.matchAll(
          /<img[^>]+(?:data-src|src)=["']([^"']+)["']|background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/g,
        )) {
          const s = m2[1] || m2[2] || '';
          if (s.includes('/wp-content/uploads/') && !/logo|icon|favicon|emoji|avatar/i.test(s)) {
            cand = s;
            break;
          }
        }
      }
      if (!cand) console.log(`    (썸네일 이미지 없음: ${url})`);
      if (cand) {
        img = unescape(cand).replace(/&amp;/g, '&');
        if (img.startsWith('/')) img = 'https://tvpc.church' + img;
        if (!/^https?:\/\//.test(img)) img = null;
      }
    }
  } catch {
    /* 썸네일은 없어도 됨 */
  }
  ogImageCache.set(url, img);
  return img;
}

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
    let href = unescape(a[1]);
    if (href.startsWith('/')) href = origin + href;
    if (!href.startsWith('http')) continue;
    const title = unescape(a[2].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
      // 게시판 "New"/"Hot" 배지가 제목 텍스트에 딸려 들어오는 것 제거
      .replace(/^(?:new|hot)\s+/i, '')
      .replace(/\s+(?:new|hot)$/i, '');
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

// 엔티티가 깨진 링크(&#038;)로 저장된 옛 문서 정리
const badNews = await db.collection('news').get();
for (const snap of badNews.docs) {
  if (snap.id.startsWith('web-') && String(snap.get('url') ?? '').includes('#038;')) {
    await snap.ref.delete();
    console.log(`  – 깨진 링크 문서 삭제: ${snap.get('title')}`);
  }
  // 옛 표기 정리 — 주보 게시글은 교회 소식(광고)이므로 제목을 맞춘다
  const t = String(snap.get('title') ?? '');
  if (t.startsWith('주보 · ')) {
    await snap.ref.set({ title: t.replace(/^주보 · /, '교회 소식 · ') }, { merge: true });
    console.log(`  ~ 제목 변경: ${t} → 교회 소식 표기`);
  }
  // 썸네일이 비어 있는 기존 문서는 게시글에서 다시 찾아 채운다
  if (snap.id.startsWith('web-') && !snap.get('imageUrl') && snap.get('url')) {
    const im = await fetchOgImage(String(snap.get('url')));
    if (im) {
      await snap.ref.set({ imageUrl: im }, { merge: true });
      console.log(`  ~ 썸네일 보충: ${t}`);
    }
  }
}

let newsWrote = 0;
for (const it of newsItems.slice(0, MAX_NEWS)) {
  const date = it.date && !isNaN(it.date) ? ymd(it.date) : ymd(new Date());
  // 주보 게시글은 사실상 교회 소식(광고)이라 제목도 그렇게 붙인다
  if (/^\d{4}년\s*\d{1,2}월\s*\d{1,2}일$/.test(it.title)) {
    it.title = `교회 소식 · ${it.title}`;
  } else if (it.title.startsWith('주보 · ')) {
    it.title = it.title.replace(/^주보 · /, '교회 소식 · ');
  }
  const imageUrl = await fetchOgImage(it.link);
  await db.doc(`news/web-${hash(it.link || it.title)}`).set(
    {
      title: it.title,
      category: isEventLike(it.title) ? 'event' : 'notice',
      date,
      url: it.link || null,
      // 일시적으로 못 찾은 경우 기존 썸네일을 지우지 않는다
      ...(imageUrl ? { imageUrl } : {}),
    },
    { merge: true },
  );
  console.log(`  ✓ ${date}  ${it.title}${imageUrl ? ' [썸네일]' : ''}\n      링크: ${it.link}`);
  newsWrote++;
}

// 교회 소식 카드 배너 통일 — 최신 글의 배너를 지난 글에도 적용한다.
// 홈페이지에서 최신 글 이미지만 바꾸면 앱의 지난 카드까지 새 배너로 보인다.
try {
  const allNews = await db.collection('news').get();
  const notices = allNews.docs
    .filter((d) => String(d.get('title') ?? '').startsWith('교회 소식 · '))
    .sort((a, b) => String(b.get('date') ?? '').localeCompare(String(a.get('date') ?? '')));
  const bannerUrl = notices.length ? notices[0].get('imageUrl') : null;
  if (bannerUrl) {
    for (const d of notices.slice(1)) {
      if (d.get('imageUrl') !== bannerUrl) {
        await d.ref.set({ imageUrl: bannerUrl }, { merge: true });
        console.log(`  ~ 배너 통일: ${d.get('title')}`);
      }
    }
  }
} catch (e) {
  console.log(`  ! 배너 통일 건너뜀: ${e.message}`);
}

// ── 2. 일정 ────────────────────────────────────────────────────
// 달력 페이지(/wp/ko/calendar/)의 "달력 구독" 링크가 전체 일정 피드 —
// 페이지에서 ICS 주소를 자동 발견하고, 알려진 소스와 함께 전부 병합한다.
console.log('[일정] 달력 페이지 수집:');
const calEvents = [];
// 같은 일정이 여러 소스에 있을 수 있어 날짜+제목으로 중복 제거
const seenKeys = new Set();
const addEvent = (e) => {
  const key = `${ymd(e.start)}|${e.summary}`;
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  calEvents.push(e);
  return true;
};

// 1순위: 달력 페이지 그리드 (구글 캘린더가 서버 렌더링됨 — 전체 일정)
const icalSources = new Set([
  'https://tvpc.church/wp/events/?ical=1',
  'https://tvpc.church/wp/?post_type=tribe_events&ical=1',
]);
for (const page of ['https://tvpc.church/wp/ko/calendar/', 'https://tvpc.church/wp/calendar/']) {
  const html = await tryFetch(page);
  if (!html) continue;
  const gridEvents = parseCalendarGrid(html);
  let added = 0;
  for (const e of gridEvents) if (addEvent(e)) added++;
  console.log(`  → 달력 그리드에서 ${added}건 파싱`);
  for (const u of findIcsLinks(html)) icalSources.add(u);
  if (added > 0) break;
}

// 2순위: iCal 피드(행사 포스트·구독 링크) 병합
console.log('[일정] iCal 소스 수집:');
for (const url of icalSources) {
  const body = await tryFetch(url);
  if (!body) continue;
  if (!body.includes('BEGIN:VCALENDAR')) {
    console.log(`  → iCal 형식 아님. 앞부분: ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
    continue;
  }
  let added = 0;
  for (const e of parseIcal(body)) if (addEvent(e)) added++;
  console.log(`  → ${url} 에서 ${added}건 병합`);
}

const now = new Date();
now.setHours(0, 0, 0, 0);
// 오늘 이후 일정만 — 지난 일정은 목록·달력에 남기지 않는다
const upcoming = calEvents
  .filter((e) => e.start >= now)
  .sort((a, b) => a.start - b.start)
  .slice(0, MAX_EVENTS);

// ── 행사 페이지(The Events Calendar) 매칭 ─────────────────────
// 홈페이지 /wp/events/ 의 행사에는 포스터와 개별 페이지가 있다.
// 공개 REST에서 제목으로 매칭해 일정·행사 카드에 링크와 포스터를 붙인다.
const tribeMap = new Map();
const normTitle = (s) =>
  String(s).replace(/\([^)]*\)/g, '').replace(/[\s·.\-]/g, '').toLowerCase();
{
  const from = new Date(now);
  from.setDate(from.getDate() - 60);
  const body = await tryFetch(
    `https://tvpc.church/wp/wp-json/tribe/events/v1/events?per_page=50&start_date=${ymd(from)}`,
  );
  if (body) {
    try {
      for (const ev of JSON.parse(body).events ?? []) {
        const title = unescape(String(ev.title ?? '').replace(/<[^>]+>/g, '')).trim();
        if (!title) continue;
        const entry = {
          title,
          url: ev.url || null,
          image: (ev.image && (ev.image.sizes?.large?.url || ev.image.url)) || null,
          start: String(ev.start_date ?? '').slice(0, 10),
          end: String(ev.end_date ?? ev.start_date ?? '').slice(0, 10),
        };
        tribeMap.set(normTitle(title), entry);
        // 괄호 별칭도 색인 — "여름 성경 학교 (VBS)" ↔ 달력의 "VBS"
        for (const m of title.matchAll(/\(([^)]+)\)/g)) {
          const alias = normTitle(m[1]);
          if (alias && !tribeMap.has(alias)) tribeMap.set(alias, entry);
        }
      }
      console.log(`[행사] 행사 페이지(REST)에서 ${tribeMap.size}건 — 포스터·링크 매칭 준비`);
    } catch {
      console.log('[행사] REST 응답이 JSON이 아님 — 매칭 생략');
    }
  }
}
const tribeFor = (summary) => {
  const key = normTitle(summary);
  if (!key) return null;
  if (tribeMap.has(key)) return tribeMap.get(key);
  for (const [k, v] of tribeMap) if (k.includes(key) || key.includes(k)) return v;
  return null;
};

// 같은 행사 중복 제거 — 소스 달력에 같은 행사가 두 이름("여름 성경 학교
// (VBS)"와 "VBS")으로 있거나, 여러 날짜에 걸친 행사가 날마다 등장한다.
// 행사 페이지가 같으면 같은 행사로 보고, 같은 날에는 긴 제목 하나만 남긴다.
const dedupeKeyOf = (e) => tribeFor(e.summary)?.url ?? normTitle(e.summary);
const byDay = new Map();
for (const e of upcoming) {
  const k = `${ymd(e.start)}|${dedupeKeyOf(e)}`;
  const cur = byDay.get(k);
  if (!cur || e.summary.length > cur.summary.length) byDay.set(k, e);
}
const deduped = [...byDay.values()].sort((a, b) => a.start - b.start);

let eventsWrote = 0;
const writtenEventIds = new Set();
for (const e of deduped) {
  const d = e.start;
  writtenEventIds.add(`web-${hash(e.uid)}`);
  const tribe = tribeFor(e.summary);
  const url = e.url || tribe?.url || null;
  const imageUrl = tribe?.image ?? (await fetchOgImage(url));
  await db.doc(`events/web-${hash(e.uid)}`).set(
    {
      dateLabel: `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${KDAYS[d.getDay()]}`,
      title: e.summary,
      detail: [e.allDay ? null : timeLabel(d), e.location || null, e.detail || null]
        .filter(Boolean)
        .join(' · '),
      imageUrl,
      url,
      sortKey: ymd(d),
    },
    { merge: true },
  );
  console.log(`  ✓ ${ymd(d)}  ${e.summary}${imageUrl ? ' [포스터]' : ''}${url ? `\n      링크: ${url}` : ''}`);
  eventsWrote++;
}

// ── 소식 탭 "행사" 카드 — 홈페이지 행사 페이지(/wp/events/)의 행사만 ──
// 정기 일정(금요예배 등)은 달력에만 두고, 포스터가 있는 공식 행사만 카드로.
{
  const todayY = ymd(now);
  const seenUrls = new Set();
  const upcomingTribe = [...tribeMap.values()]
    .filter((t) => t.url && (t.end || t.start) >= todayY && !seenUrls.has(t.url) && seenUrls.add(t.url))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, MAX_EVENT_NEWS);
  for (const t of upcomingTribe) {
    const id = `web-ev-${hash(t.url)}`;
    writtenEventIds.add(id);
    await db.doc(`news/${id}`).set(
      {
        title: t.title,
        category: 'event',
        date: t.start,
        url: t.url,
        imageUrl: t.image ?? null,
      },
      { merge: true },
    );
    console.log(`  ✓ 행사 카드: ${t.start}  ${t.title}`);
  }
}

// web- 일정 정리 — 지나갔거나 이번 동기화 결과에 없는 문서 삭제
// (홈페이지 피드가 원본이므로 매번 새로 쓰고, 옛 형식·취소된 일정을 남기지 않는다)
if (eventsWrote > 0) {
  const oldDocs = await db.collection('events').get();
  for (const snap of oldDocs.docs) {
    if (!snap.id.startsWith('web-')) continue;
    if (!writtenEventIds.has(snap.id)) {
      await snap.ref.delete();
      console.log(`  – 옛/지난 일정 삭제: ${snap.get('title')}`);
    }
  }
  // 소식 탭의 행사 카드도 같은 기준으로 정리
  const oldEvNews = await db.collection('news').get();
  for (const snap of oldEvNews.docs) {
    if (!snap.id.startsWith('web-ev-')) continue;
    if (!writtenEventIds.has(snap.id)) {
      await snap.ref.delete();
      console.log(`  – 옛 행사 카드 삭제: ${snap.get('title')}`);
    }
  }
}

console.log(`완료: 소식 ${newsWrote}건, 일정 ${eventsWrote}건 동기화`);
if (newsWrote === 0 && eventsWrote === 0) {
  console.log('가져온 항목이 없습니다 — 위 탐색 로그에서 소스 상태를 확인하세요.');
}
process.exit(0);
