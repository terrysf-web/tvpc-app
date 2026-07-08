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

/** 제목 키워드로 예배 종류 분류 */
function classify(title) {
  if (/금요|성령집회/.test(title)) return '금요성령집회';
  if (/수요/.test(title)) return '수요예배';
  if (/새벽/.test(title)) return '새벽기도회';
  if (/찬양|특송|성가/.test(title)) return '찬양';
  return '주일예배';
}

const channelId = await resolveChannelId(CHANNEL_HANDLE);
console.log(`채널 ID: ${channelId}`);

const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
const videos = parseFeed(xml)
  .filter((v) => !/#?shorts/i.test(v.title))
  .slice(0, MAX_VIDEOS);

if (videos.length === 0) {
  console.log('가져올 영상이 없습니다.');
  process.exit(0);
}

let wrote = 0;
for (const v of videos) {
  const service = classify(v.title);
  await db.doc(`sermons/yt-${v.id}`).set(
    {
      title: v.title,
      subtitle: service,
      preacher: PREACHER_DEFAULT,
      scripture: '',
      date: v.published.slice(0, 10),
      service,
      duration: '',
      series: service,
      youtubeId: v.id,
      imageUrl: null,
    },
    { merge: true },
  );
  console.log(`  ✓ ${v.published.slice(0, 10)}  ${v.title}`);
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
