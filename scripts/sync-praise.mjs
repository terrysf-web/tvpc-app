/**
 * 은혜안에 찬양팀 유튜브 채널(@EUNHYEANEWORSHIP) → Firestore `praiseVideos`
 * 자동 동기화. 교회 미디어 > "찬양" 탭에 표시된다.
 *
 * scripts/sync-sermons.mjs와 같은 방식(유튜브 RSS 피드, API 키 불필요).
 *
 * 실제로 확인해보니 이 팀은 매주 영상을 채널에 바로 공개 업로드하는 게
 * 아니라("채널 전체 동기화, 재생목록 안 골라도 됨"이라 짐작했던 것과 달리),
 * 매주 "260906[금요찬양]"처럼 "YYMMDD[태그]" 이름의 재생목록을 새로 만들고
 * 그 안에 그 주 영상들을 넣는 방식을 쓴다 — 이런 영상은 채널 목록(RSS)에
 * 안 잡힌다(일부 비공개 목록 전용으로 올림). 그래서:
 *
 * 1) 채널 전체 업로드 RSS도 계속 확인하고(직접 공개 업로드하는 영상 대비),
 * 2) 채널의 "재생목록" 탭을 함께 훑어서 "YYMMDD[태그]" 이름 패턴에 맞는
 *    주간 재생목록을 찾아, 그 재생목록 전용 RSS(?playlist_id=)로 그 안의
 *    영상들도 가져온다 — 이 방식으로 새 재생목록이 생겨도 사람이 링크를
 *    알려줄 필요 없이 자동으로 찾는다.
 *
 * 날짜는 재생목록 이름(YYMMDD)이 실제 예배 날짜라 이걸 우선 쓰고, 채널
 * 업로드 RSS로만 잡힌 영상은 제목에 같은 형식이 있으면 그걸, 없으면
 * 업로드일을 쓴다.
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

/** @handle 페이지에서 채널 ID(UC...) 추출 — 페이지 구조가 바뀔 수 있어 여러 패턴을 시도 */
async function resolveChannelId(handle) {
  const html = await fetchText(`https://www.youtube.com/${handle}`);
  const m =
    html.match(/"channelId":"(UC[\w-]+)"/) ||
    html.match(/<meta itemprop="channelId" content="(UC[\w-]+)">/) ||
    html.match(/"externalId":"(UC[\w-]+)"/) ||
    html.match(/"browseId":"(UC[\w-]+)"/) ||
    html.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (!m) {
    console.error(`  (디버그) 응답 길이 ${html.length}자, 앞부분: ${html.slice(0, 300)}`);
    throw new Error(`채널 ID를 못 찾음: ${handle}`);
  }
  return m[1];
}

/**
 * 채널의 "재생목록" 탭에서 "YYMMDD[태그]" 이름 패턴의 주간 재생목록을 찾는다.
 * ytInitialData의 정확한 JSON 구조에 기대지 않고, playlistId와 그 근처(500자
 * 이내)에 있는 날짜+태그 텍스트를 짝지어 찾는 방식이라 유튜브 페이지 구조가
 * 조금 바뀌어도 잘 안 깨진다.
 */
async function findWeeklyPlaylists(handle) {
  const html = await fetchText(`https://www.youtube.com/${handle}/playlists`);
  const seen = new Set();
  const idRe = /"playlistId":"(PL[\w-]+)"/g;
  const ids = [];
  let m;
  while ((m = idRe.exec(html))) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push({ playlistId: m[1], index: m.index });
    }
  }

  const weekly = [];
  const weeklySeen = new Set();
  for (const { playlistId, index } of ids) {
    // 앞뒤로 넉넉히 봐야 한다 — 제목 텍스트가 playlistId보다 앞에 나오는 경우도 있다
    const window = html.slice(Math.max(0, index - 300), index + 600);
    const tm = window.match(/(\d{2})(\d{2})(\d{2})\s*\[([^\]]+)\]/);
    if (tm && !weeklySeen.has(playlistId)) {
      weeklySeen.add(playlistId);
      weekly.push({
        playlistId,
        date: `20${tm[1]}-${tm[2]}-${tm[3]}`,
        tag: tm[4].trim(),
      });
    }
  }

  if (weekly.length === 0) {
    console.log(`  (디버그) 재생목록 ID ${ids.length}개 발견, "YYMMDD[태그]" 패턴 매치 0개`);
    if (ids.length > 0) {
      const { index } = ids[0];
      console.log(`  (디버그) 첫 재생목록 주변: ${html.slice(Math.max(0, index - 200), index + 400)}`);
    }
  }
  return weekly;
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
 * 날짜 프리픽스가 없으면 fallbackDate(재생목록 날짜 또는 업로드일)를 쓴다.
 */
function parseVideo(rawTitle, fallbackDate) {
  let title = rawTitle.trim();
  let date = fallbackDate;

  const dm = title.match(/^(\d{2})(\d{2})(\d{2})\s*/);
  if (dm) {
    date = `20${dm[1]}-${dm[2]}-${dm[3]}`;
    title = title.slice(dm[0].length).trim();
  }
  // 대괄호 태그는 배지처럼 보이지 말고 그냥 글자로 — "[금요찬양]" → "금요찬양"
  title = title.replace(/^\[([^\]]+)\]\s*/, '$1 ').trim();

  return { title: title || rawTitle.trim(), date };
}

async function saveVideo(id, title, date) {
  const ref = db.doc(`praiseVideos/${id}`);
  const existing = await ref.get();
  const payload = { title, date, youtubeId: id, updatedAt: Date.now() };
  if (existing.exists) {
    // 이미 있으면 제목·날짜만 갱신(수동으로 고친 값이 없으므로 그냥 덮어써도 안전)
    await ref.set(payload, { merge: true });
    return 'updated';
  }
  await ref.set({ ...payload, createdAt: Date.now() });
  console.log(`  + ${date}  ${title}`);
  return 'added';
}

async function main() {
  console.log(`[찬양] 채널 ${CHANNEL_HANDLE} 확인 중...`);
  const channelId = await resolveChannelId(CHANNEL_HANDLE);
  console.log(`  ✓ 채널 ID: ${channelId}`);

  let added = 0;
  let updated = 0;
  const seenIds = new Set();

  // 1) 채널 전체 업로드 RSS — 직접 공개 업로드된 영상
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const channelEntries = parseFeed(xml);
  console.log(`  ✓ 채널 업로드 RSS ${channelEntries.length}건 확인`);
  for (const e of channelEntries) {
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    const { title, date } = parseVideo(e.title, e.published.slice(0, 10));
    const r = await saveVideo(e.id, title, date);
    if (r === 'added') added++;
    else updated++;
  }

  // 2) 주간 재생목록("YYMMDD[태그]") — 재생목록에만 올라간(비공개 목록 전용) 영상
  let weeklyPlaylists = [];
  try {
    weeklyPlaylists = await findWeeklyPlaylists(CHANNEL_HANDLE);
    console.log(`  ✓ 주간 재생목록 ${weeklyPlaylists.length}개 확인`);
  } catch (e) {
    console.log(`  ! 재생목록 탭 확인 실패(건너뜀): ${e.message}`);
  }

  for (const pl of weeklyPlaylists) {
    try {
      const plXml = await fetchText(
        `https://www.youtube.com/feeds/videos.xml?playlist_id=${pl.playlistId}`,
      );
      const plEntries = parseFeed(plXml);
      console.log(`  · ${pl.date} [${pl.tag}] 재생목록 영상 ${plEntries.length}건`);
      for (const e of plEntries) {
        if (seenIds.has(e.id)) continue;
        seenIds.add(e.id);
        // 개별 영상 제목에 날짜가 없으면(대부분 이 경우) 재생목록 날짜를 그대로 쓴다
        const { title, date } = parseVideo(e.title, pl.date);
        const r = await saveVideo(e.id, title, date);
        if (r === 'added') added++;
        else updated++;
      }
    } catch (e) {
      console.log(`  ! 재생목록 ${pl.playlistId} 확인 실패(건너뜀): ${e.message}`);
    }
  }

  console.log(`완료: 새 영상 ${added}건, 기존 갱신 ${updated}건 (전체 ${seenIds.size}건)`);
}

main().catch((e) => {
  console.error('동기화 실패:', e);
  process.exit(1);
});
