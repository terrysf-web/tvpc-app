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

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko,en' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
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
  console.log(`  첫 페이지에서 ${videos.length}개 발견`);

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

  if (/\[?\s*말씀\s*팟캐스트\s*\]?/.test(title)) {
    category = 'podcast';
    title = title.replace(/^\[?\s*말씀\s*팟캐스트\s*\]?\s*/, '').trim();
  } else if (/찬양|워십|찬송가|특송|성가|hymn|worship|praise/i.test(title)) {
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

  // 성경구절 접미 "(시편 23:6)" — 숫자가 포함된 괄호만
  const sm = title.match(/\(([^()]*\d[^()]*)\)\s*$/);
  if (sm) {
    scripture = sm[1].trim();
    title = title.slice(0, sm.index).trim();
  }

  return { title, category, date, scripture };
}

/** 제목 키워드로 예배 종류 분류 */
function classify(title) {
  if (/금요|성령집회/.test(title)) return '금요성령집회';
  if (/수요/.test(title)) return '수요예배';
  if (/새벽/.test(title)) return '새벽기도회';
  return '주일예배';
}

const BACKFILL = process.env.BACKFILL === 'true';

const channelId = await resolveChannelId(CHANNEL_HANDLE);
console.log(`채널 ID: ${channelId}${BACKFILL ? ' (전체 백필 모드)' : ''}`);

let videos;
if (BACKFILL) {
  // 채널 전체 업로드 — 이미 저장된 영상은 건너뛰고, 새 영상만 날짜를 조회
  const all = (await fetchAllUploads(channelId)).filter(
    (v) => !/#?shorts/i.test(v.title) && (v.seconds === 0 || v.seconds >= 60),
  );
  console.log(`전체 업로드 ${all.length}개 (쇼츠 제외)`);
  const existing = new Set();
  for (const snap of (await db.collection('sermons').select().get()).docs) {
    existing.add(snap.id);
  }
  const fresh = all.filter((v) => !existing.has(`yt-${v.id}`));
  console.log(`신규 ${fresh.length}개 — 업로드 날짜 조회 중…`);
  videos = [];
  for (let i = 0; i < fresh.length; i++) {
    const v = fresh[i];
    const date = await fetchUploadDate(v.id);
    if (!date) {
      console.log(`  ! 날짜 조회 실패, 건너뜀: ${v.title}`);
      continue;
    }
    videos.push({ id: v.id, title: v.title, published: date });
    if ((i + 1) % 25 === 0) console.log(`  …날짜 조회 ${i + 1}/${fresh.length}`);
  }
} else {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  videos = parseFeed(xml)
    .filter((v) => !/#?shorts/i.test(v.title))
    .slice(0, MAX_VIDEOS);
}

if (videos.length === 0) {
  console.log('가져올 영상이 없습니다.');
  process.exit(0);
}

const LABEL = { sermon: '설교', podcast: '팟캐스트', praise: '찬양', etc: '기타' };

let wrote = 0;
for (const v of videos) {
  const p = parseVideo(v.title, v.published);
  const service = p.category === 'sermon' ? classify(v.title) : LABEL[p.category];
  await db.doc(`sermons/yt-${v.id}`).set(
    {
      category: p.category,
      title: p.title,
      subtitle: service,
      preacher: p.category === 'sermon' || p.category === 'podcast' ? PREACHER_DEFAULT : '',
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

console.log(`완료: ${wrote}개 영상 동기화`);
process.exit(0);
