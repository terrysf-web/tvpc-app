/**
 * 유튜브 채널(@tri-valley) → Firestore `sermons` 자동 동기화.
 *
 * GitHub Actions(.github/workflows/sync-sermons.yml)가 매일 실행한다.
 * 유튜브 RSS 피드를 읽으므로 API 키가 필요 없고, Firestore 쓰기는
 * FIREBASE_SERVICE_ACCOUNT 시크릿(서비스 계정 JSON)으로 인증한다.
 *
 * 로컬 실행:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" node scripts/sync-sermons.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const CHANNEL_HANDLE = process.env.CHANNEL_HANDLE || '@tri-valley';
const MAX_VIDEOS = Number(process.env.MAX_VIDEOS || 15);
const PREACHER_DEFAULT = process.env.PREACHER_DEFAULT || '허성영 담임목사';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
const serviceAccount = JSON.parse(saRaw);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchText(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko,en' } });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      // 유튜브 쪽 일시적 오류(레이트리밋 등) 대비 — 마지막 시도가 아니면 잠깐 쉬었다 재시도
      if (i < attempts - 1) {
        console.log(`  ! 요청 실패, 재시도 ${i + 1}/${attempts - 1}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/** @handle 페이지에서 채널 ID(UC...) 추출 */
async function resolveChannelId(handle) {
  const html = await fetchText(`https://www.youtube.com/${handle}`);
  const m =
    html.match(/"channelId":"(UC[\w-]+)"/) ||
    html.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (!m) throw new Error('채널 ID를 찾지 못했습니다.');
  return m[1];
}

/**
 * 채널 전체 업로드 목록 (백필용) — 업로드 재생목록 페이지의 ytInitialData를
 * 파싱하고, continuation 토큰으로 끝까지 페이지를 넘긴다. API 키 불필요.
 */
/** HTML에서 ytInitialData JSON을 중괄호 짝 맞춰 정확히 추출 */
function extractInitialData(html) {
  const idx = html.indexOf('ytInitialData');
  if (idx < 0) return null;
  const start = html.indexOf('{', idx);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

async function fetchAllUploads(channelId) {
  const listId = 'UU' + channelId.slice(2);
  // 페이지는 API 키 획득용으로만 사용 (목록은 내부 browse API로 조회)
  const html = await fetchText(`https://www.youtube.com/playlist?list=${listId}&hl=ko`);
  const km = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey = km ? km[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
  console.log(`  API 키 ${km ? '추출' : '기본값 사용'}`);

  const videos = [];
  const seen = new Set();
  let continuation = null;

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    const v = node.playlistVideoRenderer || node.videoRenderer || node.gridVideoRenderer;
    if (v?.videoId && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      videos.push({
        id: v.videoId,
        title:
          (v.title?.runs || []).map((r) => r.text).join('') || v.title?.simpleText || '',
        seconds: Number(v.lengthSeconds || 0),
      });
    }
    const tok =
      node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
      node.nextContinuationData?.continuation;
    if (tok) continuation = tok;
    for (const k in node) walk(node[k]);
  };

  const browse = async (body) => {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20240401.00.00', hl: 'ko', gl: 'US' },
        },
        ...body,
      }),
    });
    if (!res.ok) {
      console.log(`  ! browse API HTTP ${res.status}`);
      return null;
    }
    return res.json();
  };

  const first = await browse({ browseId: `VL${listId}` });
  if (first) walk(first);
  console.log(`  재생목록 browse: ${videos.length}개 발견`);
  if (first && videos.length === 0) {
    console.log(`  ! 응답 최상위 키: ${Object.keys(first).join(', ')}`);
    console.log(`  ! 응답 앞부분: ${JSON.stringify(first).slice(0, 500)}`);
  }

  // 대안: 채널 "동영상" 탭 browse (params = Videos 탭 식별자)
  if (videos.length === 0) {
    const vt = await browse({ browseId: channelId, params: 'EgZ2aWRlb3PyBgQKAjoA' });
    if (vt) walk(vt);
    console.log(`  동영상 탭 browse: ${videos.length}개 발견`);
    if (vt && videos.length === 0) {
      console.log(`  ! 응답 앞부분: ${JSON.stringify(vt).slice(0, 500)}`);
    }
  }

  let guard = 0;
  while (continuation && guard++ < 80) {
    const token = continuation;
    continuation = null;
    const j = await browse({ continuation: token });
    if (!j) break;
    walk(j);
    console.log(`  …목록 로딩 중 (${videos.length}개)`);
  }
  return videos;
}

/** 영상 업로드 날짜 — 시청 페이지에서 추출 */
async function fetchUploadDate(id) {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${id}&hl=ko`);
    const m =
      html.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/) ||
      html.match(/itemprop="datePublished" content="(\d{4}-\d{2}-\d{2})/) ||
      html.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** RSS 피드 파싱 — 의존성 없이 정규식으로 entry 추출 */
function parseFeed(xml) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = block
      .match(/<title>([^<]*)<\/title>/)?.[1]
      ?.replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const published = block.match(/<published>([^<]+)<\/published>/)?.[1];
    if (id && title && published) entries.push({ id, title, published });
  }
  return entries;
}

/**
 * 영상 제목 파싱·분류.
 * 채널 제목 관례:
 *   "[07/05/2026] 주님은 언제나 선하시다 (시편 23:6)"  → 설교 (날짜·구절 분리)
 *   "[말씀 팟캐스트] 선택"                              → 팟캐스트
 *   "…찬양/워십/찬송가…"                                → 찬양
 *   "…선교영상…"                                       → 기타
 */
function parseVideo(rawTitle, published) {
  let title = rawTitle.trim();
  let category = 'sermon';
  let date = published.slice(0, 10);
  let scripture = '';
  let speaker = '';

  if (/\[?\s*말씀\s*팟캐스트\s*\]?/.test(title)) {
    category = 'podcast';
    title = title.replace(/^\[?\s*말씀\s*팟캐스트\s*\]?\s*/, '').trim();
  } else if (/찬양|워십|찬송가|특송|성가|연주|반주|soloist|instrumental|hymn|worship|praise/i.test(title)) {
    category = 'praise';
  } else if (/선교영상|광고|안내영상|스케치|하이라이트/.test(title)) {
    category = 'etc';
  }

  // 날짜 프리픽스 [MM/DD/YYYY]
  const dm = title.match(/^\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]\s*/);
  if (dm) {
    date = `${dm[3]}-${dm[1].padStart(2, '0')}-${dm[2].padStart(2, '0')}`;
    title = title.slice(dm[0].length).trim();
  }

  // 팟캐스트는 발표자 이름이 제목 맨 앞 대괄호에 "[우연희, 원승환]"처럼
  // 그대로 글자로 들어 있다 — 예전엔 썸네일 그림을 OCR로 읽었지만, 제목에
  // 이미 정확한 이름이 있으니 그걸 쓴다(OCR은 오독 위험도 있고 이중 표시라
  // 이제 안 쓴다). 화면에도 두 번 안 겹치게 이 대괄호는 제목에서 지운다.
  if (category === 'podcast') {
    const speakerMatch = title.match(/^\[([^\]]+)\]\s*/);
    if (speakerMatch) {
      speaker = applyNameFixes(speakerMatch[1].replace(/\s*,\s*/g, ' · ').trim());
      title = title.slice(speakerMatch[0].length).trim();
    }
  }

  // 성경구절 접미 "(시편 23:6)" — 숫자가 포함된 괄호만
  const sm = title.match(/\(([^()]*\d[^()]*)\)\s*$/);
  if (sm) {
    scripture = sm[1].trim();
    title = title.slice(0, sm.index).trim();
  }

  return { title, category, date, scripture, speaker };
}

/* ---------------- 교회 홈페이지(/wp/sermons/) 정식 설교 정보 ---------------- */

const WEB_SERMONS_URL = process.env.WEB_SERMONS_URL || 'https://tvpc.church/wp/sermons/';
const WEB_SERMON_PAGES = Number(process.env.WEB_SERMON_PAGES || 3);

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Advanced Sermons 아카이브 HTML에서 설교 카드 파싱.
 * 카드 구조: <li class='sermon-archive-single'> 안에
 *   썸네일 링크(개별 설교 URL) · preached-date("2026년 7월 19일") ·
 *   sermon-title h2 · "Speaker: <a>허성영</a>" ·
 *   본문 구절(<p><p>사도행전 11:19-30</p></p> 뒤 "Sermon Grid View Scripture" 주석)
 */
function parseSermonArchive(html) {
  const items = [];
  for (const part of html.split(/<li class=['"]sermon-archive-single['"]/).slice(1)) {
    const end = part.indexOf('</li>');
    const block = end >= 0 ? part.slice(0, end) : part;
    const url = block.match(/href="(https?:\/\/[^"?#]+\/sermons\/[^"?#]+)"/)?.[1];
    const image = block.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
    const dm = block.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    const date = dm
      ? `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`
      : null;
    const title = decodeEntities(
      block
        .match(/<h2>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/)?.[1]
        ?.replace(/<[^>]+>/g, ''),
    );
    const speaker = decodeEntities(block.match(/Speaker:\s*<a[^>]*>([^<]+)<\/a>/)?.[1]);
    const scripture = decodeEntities(
      (
        block.match(/<p>\s*<p>([\s\S]*?)<\/p>/)?.[1] ??
        block.match(/>([^<>]{2,60})<\/p>\s*<\/p>[\s\S]{0,80}?Sermon Grid View Scripture/)?.[1] ??
        ''
      ).replace(/<[^>]+>/g, ''),
    );
    if (url && date && title) items.push({ url, date, title, speaker, scripture, image });
  }
  return items;
}

/**
 * 홈페이지 설교 정보를 Firestore에 병합.
 * 매칭은 ① 같은 날짜 → ② 제목 근사 일치(±10일) 순서.
 * (홈페이지의 "설교 날짜"가 실제 주일이 아니라 게시일인 항목이 있어서
 *  제목 매칭이 꼭 필요하다. 예: 화요일 날짜로 등록된 주일설교)
 * 매칭된 유튜브 문서에는 제목·본문·설교자·이미지를 정식 값으로 덮고
 * (날짜는 유튜브 제목의 실제 예배일 유지), 영상이 없는 설교만
 * web-{날짜}-{해시} 문서로 만든다.
 * (유튜브 파싱 값을 항상 웹사이트 값으로 덮도록 유튜브 동기화 뒤에 실행)
 */
async function syncWebSermons() {
  const webItems = [];
  const seenUrls = new Set();
  for (let p = 1; p <= WEB_SERMON_PAGES; p++) {
    const url =
      p === 1 ? WEB_SERMONS_URL : `${WEB_SERMONS_URL.replace(/\/+$/, '')}/page/${p}/`;
    let html;
    try {
      html = await fetchText(url);
    } catch {
      break; // 다음 페이지 없음
    }
    const items = parseSermonArchive(html).filter((i) => !seenUrls.has(i.url));
    if (items.length === 0) break;
    for (const i of items) seenUrls.add(i.url);
    webItems.push(...items);
  }
  console.log(`홈페이지 설교 ${webItems.length}건 파싱 (${WEB_SERMONS_URL})`);
  if (webItems.length === 0) return;

  // 제목 비교용 정규화 — [부활절 연합예배] 같은 라벨·괄호·기호·공백 제거
  const normTitle = (s) =>
    (s || '')
      .toLowerCase()
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/[^0-9a-z가-힣]/g, '');
  const dayDiff = (a, b) =>
    Math.abs(new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000;

  const snap = await db.collection('sermons').get();
  const docs = snap.docs
    .filter((d) => (d.get('category') ?? 'sermon') === 'sermon')
    .map((d) => ({
      ref: d.ref,
      id: d.id,
      title: d.get('title') || '',
      date: d.get('date') || '',
      service: d.get('service') || '',
      youtubeId: d.get('youtubeId') || null,
    }));

  // 개별 설교 페이지의 유튜브 임베드(sermon-youtube-player iframe)에서 영상 ID 추출
  const extractYoutubeId = async (url) => {
    try {
      const page = await fetchText(url);
      return (
        page.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/)?.[1] ??
        page.match(/youtu\.be\/([\w-]{11})/)?.[1] ??
        page.match(/youtube\.com\/watch\?v=([\w-]{11})/)?.[1] ??
        null
      );
    } catch {
      return null;
    }
  };

  for (const w of webItems) {
    const preacher = w.speaker
      ? PREACHER_DEFAULT.includes(w.speaker)
        ? PREACHER_DEFAULT
        : w.speaker
      : PREACHER_DEFAULT;
    const info = {
      title: w.title,
      scripture: w.scripture || '',
      preacher,
      series: w.scripture ? w.scripture.replace(/\s*\d.*$/, '').trim() : '주일예배',
      imageUrl: w.image || null,
      sermonUrl: w.url,
    };
    const nw = normTitle(w.title);

    // ① 같은 날짜의 영상 문서 (주일예배 우선) ② 제목 근사 일치(±10일)
    const videoDocs = docs.filter((d) => !d.id.startsWith('web-'));
    let targets = videoDocs.filter((d) => d.date === w.date);
    if (targets.some((d) => d.service === '주일예배')) {
      targets = targets.filter((d) => d.service === '주일예배');
    }
    if (targets.length === 0 && nw.length >= 4) {
      targets = videoDocs.filter((d) => {
        const nd = normTitle(d.title);
        if (!nd || !w.date || !d.date) return false;
        return (nd === nw || nd.includes(nw) || nw.includes(nd)) && dayDiff(d.date, w.date) <= 10;
      });
    }

    if (targets.length > 0) {
      // 날짜는 유튜브 제목의 실제 예배일이 더 정확하므로 유지
      for (const d of targets) await d.ref.set(info, { merge: true });
      // 같은 설교를 웹 전용 문서로 만들어 둔 게 있으면 중복 제거
      for (const d of docs.filter(
        (x) => x.id.startsWith('web-') && (x.date === w.date || normTitle(x.title) === nw),
      )) {
        await d.ref.delete().catch(() => {});
      }
      console.log(
        `  ✓ ${w.date}  ${w.title} (${w.scripture || '본문 없음'}) — ${targets.length}개 영상 문서 보강`,
      );
    } else {
      // 같은 날짜에 설교가 두 건일 수 있어(부활절·성금요일) URL 해시로 ID 구분
      const id = `web-${w.date}-${createHash('md5').update(w.url).digest('hex').slice(0, 6)}`;
      // 예전 형식(web-{날짜})으로 만든 문서는 새 ID로 대체
      const legacy = db.doc(`sermons/web-${w.date}`);
      if ((await legacy.get()).exists) await legacy.delete();

      // 개별 페이지에 임베드된 유튜브 영상 ID — 채널 목록에 없는 설교도
      // 앱에서 직접 재생되게 한다 (이미 확보한 ID는 페이지 재요청 생략)
      const youtubeId =
        docs.find((x) => x.id === id)?.youtubeId ?? (await extractYoutubeId(w.url));

      // 그 영상의 유튜브 문서가 이미 있으면 새로 만들지 않고 그쪽에 병합
      const ytDoc = youtubeId ? docs.find((x) => x.id === `yt-${youtubeId}`) : null;
      if (ytDoc) {
        await ytDoc.ref.set({ ...info, date: w.date }, { merge: true });
        console.log(`  ✓ ${w.date}  ${w.title} — 기존 영상 문서(yt-${youtubeId})에 병합`);
        continue;
      }

      await db.doc(`sermons/${id}`).set(
        {
          category: 'sermon',
          subtitle: '주일예배',
          service: '주일예배',
          duration: '',
          youtubeId,
          date: w.date,
          ...info,
        },
        { merge: true },
      );
      console.log(
        `  + ${w.date}  ${w.title} (${w.scripture || '본문 없음'})${youtubeId ? ` — 영상 ${youtubeId}` : ' — 영상 없음'}`,
      );
    }
  }
}

/** 제목 키워드로 예배 종류 분류 */
function classify(title) {
  if (/금요|성령집회/.test(title)) return '금요성령집회';
  if (/수요/.test(title)) return '수요예배';
  if (/새벽/.test(title)) return '새벽기도회';
  return '주일예배';
}

// OCR이 특정 이름을 계속 같은 식으로 잘못 읽는 경우 사람이 확인해서
// 바로잡은 목록 — 새로 인식할 때도, 이미 저장된(잘못된) 값을 다시 볼
// 때도 똑같이 적용한다.
const OCR_NAME_FIXES = {
  원송환: '원승환',
  원숭환: '원승환',
};
function applyNameFixes(s) {
  let out = s;
  for (const [wrong, right] of Object.entries(OCR_NAME_FIXES)) out = out.split(wrong).join(right);
  return out;
}

const BACKFILL = process.env.BACKFILL === 'true';

const channelId = await resolveChannelId(CHANNEL_HANDLE);
console.log(`채널 ID: ${channelId}${BACKFILL ? ' (전체 백필 모드)' : ''}`);

let videos;
if (BACKFILL) {
  // yt-dlp로 채널 전체 영상 목록 (유튜브 구조 변화에 가장 견고)
  const ytdlp = (args) =>
    execFileSync('yt-dlp', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  console.log('yt-dlp로 채널 전체 목록 조회 중…');
  const flat = ytdlp([
    '--flat-playlist',
    '--print', '%(id)s\t%(title)s\t%(duration)s',
    `https://www.youtube.com/channel/${channelId}/videos`,
  ]);
  const all = flat
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, title, duration] = line.split('\t');
      return { id, title: title || '', seconds: Number(duration) || 0 };
    })
    .filter((v) => v.id && !/#?shorts/i.test(v.title) && (v.seconds === 0 || v.seconds >= 60));
  console.log(`전체 업로드 ${all.length}개 (쇼츠 제외)`);

  // 기존 문서의 날짜는 보존 (RSS로 받은 정확한 날짜를 보간값으로 덮지 않기 위해)
  const existingDates = new Map();
  for (const snap of (await db.collection('sermons').select('date').get()).docs) {
    existingDates.set(snap.id, snap.get('date') || null);
  }
  const fresh = all.filter((v) => !existingDates.has(`yt-${v.id}`));
  console.log(`신규 ${fresh.length}개 — 업로드 날짜 확인 중…`);

  // 날짜 출처 우선순위: 제목 [MM/DD/YYYY] → RSS 피드(최근 15개) → 시청 페이지 HTML.
  // 개별 영상 yt-dlp 조회는 봇 확인("Sign in to confirm…")에 막혀 쓰지 않는다.
  const rssDates = new Map();
  try {
    const xml = await fetchText(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    );
    for (const e of parseFeed(xml)) rssDates.set(e.id, e.published.slice(0, 10));
  } catch {
    /* RSS 실패해도 다른 출처로 진행 */
  }

  const titleDate = (t) => {
    const m = t.match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
  };

  const dates = new Map();
  let fromHtml = 0;
  for (const v of fresh) {
    const d = titleDate(v.title) || rssDates.get(v.id) || (await fetchUploadDate(v.id));
    if (d) {
      dates.set(v.id, d);
      if (!titleDate(v.title) && !rssDates.has(v.id)) fromHtml += 1;
    }
  }
  console.log(
    `  날짜 확보 ${dates.size}/${fresh.length} (제목·RSS·페이지 ${fromHtml}건 포함)`,
  );

  // 남은 영상은 목록 순서(최신순)를 이용해 이웃 영상 날짜로 보간 — 정렬 유지 목적
  let interpolated = 0;
  let lastKnown = null;
  const firstKnown = fresh.map((v) => dates.get(v.id)).find(Boolean) || null;
  for (const v of fresh) {
    if (dates.has(v.id)) {
      lastKnown = dates.get(v.id);
    } else {
      const guess = lastKnown || firstKnown;
      if (guess) {
        dates.set(v.id, guess);
        interpolated += 1;
      }
    }
  }
  if (interpolated > 0) console.log(`  날짜 미상 ${interpolated}개는 이웃 영상 날짜로 보간`);

  // 기존 문서도 다시 써서 제목·분류 개선이 전체에 반영되게 한다 (날짜는 기존 값 우선)
  videos = all
    .map((v) => ({
      id: v.id,
      title: v.title,
      published: existingDates.get(`yt-${v.id}`) || dates.get(v.id) || null,
    }))
    .filter((v) => v.published);
  const missed = all.length - videos.length;
  if (missed > 0) console.log(`  ! 날짜를 정할 수 없는 ${missed}개 건너뜀`);
} else {
  let entries;
  try {
    const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    entries = parseFeed(xml);
  } catch (e) {
    // RSS 피드가 계속 막히면(유튜브 쪽 차단·점검 등) 업로드 목록 스캔으로 대체.
    // 날짜는 제목의 [MM/DD/YYYY] 우선, 없으면 시청 페이지에서 읽는다(RSS와 다른 엔드포인트라 독립적).
    console.log(`  ! RSS 피드 실패, 업로드 목록으로 대체: ${e.message}`);
    const uploads = await fetchAllUploads(channelId);
    entries = [];
    for (const v of uploads) {
      if (entries.length >= MAX_VIDEOS) break;
      const m = v.title.match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
      const published = m
        ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
        : await fetchUploadDate(v.id);
      if (published) entries.push({ id: v.id, title: v.title, published });
    }
  }
  videos = entries
    .filter((v) => !/#?shorts/i.test(v.title))
    .slice(0, MAX_VIDEOS);
}

if (videos.length === 0) console.log('가져올 영상이 없습니다.');

const LABEL = { sermon: '설교', podcast: '팟캐스트', praise: '찬양', etc: '기타' };

let wrote = 0;
for (const v of videos) {
  const p = parseVideo(v.title, v.published);
  const service = p.category === 'sermon' ? classify(v.title) : LABEL[p.category];
  // 팟캐스트는 담임목사님이 아니라 매회 다른 성도가 발표한다 — 이름은
  // 제목 맨 앞 대괄호에서 그대로 읽는다(더 이상 썸네일을 OCR로 읽지 않음).
  const preacher = p.category === 'sermon' ? PREACHER_DEFAULT : p.speaker;
  await db.doc(`sermons/yt-${v.id}`).set(
    {
      category: p.category,
      title: p.title,
      subtitle: service,
      preacher,
      scripture: p.scripture,
      date: p.date,
      service,
      duration: '',
      series: p.scripture ? p.scripture.replace(/\s*\d.*$/, '') : service,
      youtubeId: v.id,
      imageUrl: null,
    },
    { merge: true },
  );
  console.log(`  ✓ [${LABEL[p.category]}] ${p.date}  ${p.title}${p.scripture ? ` (${p.scripture})` : ''}`);
  wrote++;
}

// 실제 영상이 들어왔으면 샘플 데이터(sermon-1..5)는 제거
if (wrote > 0) {
  for (let i = 1; i <= 5; i++) {
    const ref = db.doc(`sermons/sermon-${i}`);
    if ((await ref.get()).exists) {
      await ref.delete();
      console.log(`  – 샘플 삭제: sermon-${i}`);
    }
  }
}

// 홈페이지 정식 설교 정보(제목·본문·설교자·이미지)로 보강 — 항상 마지막에 실행
try {
  await syncWebSermons();
} catch (e) {
  console.log(`! 홈페이지 설교 동기화 실패 (영상 동기화는 완료): ${e.message}`);
}

console.log(`완료: ${wrote}개 영상 동기화`);
process.exit(0);
