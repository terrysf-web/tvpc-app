/**
 * 은혜안에 찬양팀 유튜브 채널(@EUNHYEANEWORSHIP) → Firestore `praiseVideos`
 * 자동 동기화. 교회 미디어 > "찬양" 탭에 표시된다.
 *
 * scripts/sync-sermons.mjs와 같은 방식(유튜브 RSS 피드, API 키 불필요) —
 * 이 채널은 찬양팀 전용이라 채널 전체를 그대로 가져온다(재생목록을 따로
 * 안 골라도 됨).
 *
 * 영상 제목이 "260828 [금요찬양]"처럼 "YYMMDD [태그]" 형식이라, 날짜는
 * 제목 앞부분에서 우선 읽고(정확함), 없으면 업로드일(RSS published)로
 * 대신한다.
 *
 * GitHub Actions(.github/workflows/sync-praise.yml)가 주기적으로 실행한다.
 *
 * 로컬 실행:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" node scripts/sync-praise.mjs
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const CHANNEL_HANDLE = process.env.PRAISE_CHANNEL_HANDLE || '@EUNHYEANEWORSHIP';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
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
    html.match(/<meta itemprop="channelId" content="(UC[\w-]+)">/);
  if (!m) throw new Error(`채널 ID를 못 찾음: ${handle}`);
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

/**
 * 영상 제목 파싱 — "260828 [금요찬양]" → 날짜 2026-08-28, 표시 제목 "금요찬양".
 * 날짜 프리픽스가 없으면 업로드일(RSS published)을 그대로 쓴다.
 */
function parseVideo(rawTitle, published) {
  let title = rawTitle.trim();
  let date = published.slice(0, 10);

  const dm = title.match(/^(\d{2})(\d{2})(\d{2})\s*/);
  if (dm) {
    date = `20${dm[1]}-${dm[2]}-${dm[3]}`;
    title = title.slice(dm[0].length).trim();
  }
  // 대괄호 태그는 배지처럼 보이지 말고 그냥 글자로 — "[금요찬양]" → "금요찬양"
  title = title.replace(/^\[([^\]]+)\]\s*/, '$1 ').trim();

  return { title: title || rawTitle.trim(), date };
}

async function main() {
  console.log(`[찬양] 채널 ${CHANNEL_HANDLE} 확인 중...`);
  const channelId = await resolveChannelId(CHANNEL_HANDLE);
  console.log(`  ✓ 채널 ID: ${channelId}`);

  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const entries = parseFeed(xml);
  console.log(`  ✓ RSS ${entries.length}건 확인`);

  let added = 0;
  let updated = 0;
  for (const e of entries) {
    const { title, date } = parseVideo(e.title, e.published);
    const ref = db.doc(`praiseVideos/${e.id}`);
    const existing = await ref.get();
    const payload = {
      title,
      date,
      youtubeId: e.id,
      updatedAt: Date.now(),
    };
    if (existing.exists) {
      // 이미 있으면 제목·날짜만 갱신(수동으로 고친 값이 없으므로 그냥 덮어써도 안전)
      await ref.set(payload, { merge: true });
      updated++;
    } else {
      await ref.set({ ...payload, createdAt: Date.now() });
      added++;
      console.log(`  + ${date}  ${title}`);
    }
  }
  console.log(`완료: 새 영상 ${added}건, 기존 갱신 ${updated}건 (전체 ${entries.length}건)`);
}

main().catch((e) => {
  console.error('동기화 실패:', e);
  process.exit(1);
});
