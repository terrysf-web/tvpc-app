/**
 * 은혜안에 찬양팀 유튜브 채널(@EUNHYEANEWORSHIP) → Firestore `praiseVideos`
 * 자동 동기화. 교회 미디어 > "찬양" 탭에 표시된다.
 *
 * scripts/sync-sermons.mjs와 같은 방식(유튜브 RSS 피드, API 키 불필요).
 *
 * 이 채널은 두 가지 콘텐츠가 섞여 있다:
 *
 * 1) 채널에 직접 공개 업로드하는 영상 — 찬양팀이 실제로 찍은 실황
 *    (예: "나의 갈 길 다 가도록 [은혜안에 워십 LIVE]"). 채널 업로드
 *    RSS로 잡아서 개별 영상으로 저장, 앱 안 재생기(/watch)로 바로 재생.
 *
 * 2) 매주 "20260904 [금요찬양]"처럼 "YYYYMMDD [태그]"(예전엔 YYMMDD도
 *    씀 — 둘 다 지원) 이름으로 새로 만드는 재생목록 — 그 주 예배에서
 *    부를 곡들의 "세트리스트"라, 안에 들어있는 영상은 찬양팀이 만든 게
 *    아니라 다른 팀·가수의 원곡/커버 영상이다(어노인팅, Feast Family,
 *    마커스워십 등). 이건 개별 영상을 우리 영상인 것처럼 보여주면 안
 *    되고, 재생목록 카드 하나로만 보여준 뒤 누르면 유튜브에서 그
 *    재생목록을 그대로 재생하게 한다.
 *
 * 재생목록은 채널의 "재생목록" 탭을 훑어서 "YYYYMMDD [태그]"(또는
 * YYMMDD[태그]) 이름 패턴에 맞는 것을 자동으로 찾는다 — 매주 새로
 * 생겨도 사람이 링크를 알려줄 필요가 없다.
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

  // 제목("YYMMDD[태그]" 또는 "YYYYMMDD [태그]") 위치를 모두 찾은 뒤, 각
  // 제목에 가장 가까운 playlistId를 짝지어준다 — JSON 구조상 둘 사이
  // 거리가 꽤 멀 수 있어 "근처"보다 "가장 가까운 것"으로 찾는 게 더
  // 안정적이다. 연도는 2자리(YY)·4자리(YYYY) 둘 다 받는다.
  const titleRe = /(\d{4}|\d{2})(\d{2})(\d{2})\s*\[([^\]]+)\]/g;
  const titles = [];
  let tm;
  while ((tm = titleRe.exec(html))) {
    const year = tm[1].length === 4 ? tm[1] : `20${tm[1]}`;
    titles.push({
      index: tm.index,
      date: `${year}-${tm[2]}-${tm[3]}`,
      tag: tm[4].trim(),
      // 유튜브에 있는 재생목록 제목 그대로(파싱해서 자르지 않고) 표시용으로 쓴다
      rawTitle: decodeEntities(tm[0].trim()),
    });
  }

  const weekly = [];
  const usedIds = new Set();
  for (const t of titles) {
    let best = null;
    let bestDist = Infinity;
    for (const { playlistId, index } of ids) {
      if (usedIds.has(playlistId)) continue;
      const dist = Math.abs(index - t.index);
      if (dist < bestDist) {
        bestDist = dist;
        best = playlistId;
      }
    }
    // 너무 멀면(5000자 이상) 관계없는 텍스트로 보고 건너뜀
    if (best && bestDist < 5000) {
      usedIds.add(best);
      weekly.push({ playlistId: best, date: t.date, tag: t.tag, rawTitle: t.rawTitle });
    }
  }

  if (weekly.length === 0) {
    console.log(
      `  (디버그) 재생목록 ID ${ids.length}개, "YYMMDD[태그]" 텍스트 ${titles.length}개 발견 — 매치 0개`,
    );
    if (titles.length > 0) {
      const t = titles[0];
      console.log(
        `  (디버그) 첫 제목("${t.date} ${t.tag}") 주변: ${html.slice(Math.max(0, t.index - 250), t.index + 100)}`,
      );
    }
    if (ids.length > 0) {
      console.log(`  (디버그) 재생목록 ID 위치들: ${ids.map((x) => x.index).join(', ')}`);
    }
  }
  return weekly;
}

/** HTML에서 흔히 나오는 이스케이프만 풀어준다(제목에 &, 따옴표 등 있을 때) */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
 * 영상 제목 파싱 — "260828 [금요찬양]" 또는 "20260828 [금요찬양]" →
 * 날짜 2026-08-28, 표시 제목 "금요찬양". 날짜 프리픽스가 없으면
 * fallbackDate(재생목록 날짜 또는 업로드일)를 쓴다.
 */
function parseVideo(rawTitle, fallbackDate) {
  let title = rawTitle.trim();
  let date = fallbackDate;

  const dm = title.match(/^(\d{4}|\d{2})(\d{2})(\d{2})\s*/);
  if (dm) {
    const year = dm[1].length === 4 ? dm[1] : `20${dm[1]}`;
    date = `${year}-${dm[2]}-${dm[3]}`;
    title = title.slice(dm[0].length).trim();
  }
  // 대괄호 태그는 배지처럼 보이지 말고 그냥 글자로 — "[금요찬양]" → "금요찬양"
  title = title.replace(/^\[([^\]]+)\]\s*/, '$1 ').trim();

  return { title: title || rawTitle.trim(), date };
}

/** 개별 영상(채널 직접 업로드) 저장 */
async function saveVideo(id, title, date) {
  const ref = db.doc(`praiseVideos/${id}`);
  const existing = await ref.get();
  const payload = { title, date, youtubeId: id, playlistId: null, updatedAt: Date.now() };
  if (existing.exists) {
    // 이미 있으면 제목·날짜만 갱신(수동으로 고친 값이 없으므로 그냥 덮어써도 안전)
    await ref.set(payload, { merge: true });
    return 'updated';
  }
  await ref.set({ ...payload, createdAt: Date.now() });
  console.log(`  + ${date}  ${title}`);
  return 'added';
}

/**
 * 주간 재생목록 저장 — 안의 영상들을 낱개로 안 보여주고 재생목록 카드
 * 하나로만 저장한다(썸네일은 첫 영상 것을 빌려온다). 예전 버전이
 * 실수로 낱개 영상으로 저장해뒀던 문서가 있으면 여기서 지운다.
 */
async function saveWeeklyPlaylist(pl, entries) {
  const thumbId = entries[0]?.id ?? null;
  const ref = db.doc(`praiseVideos/${pl.playlistId}`);
  const existing = await ref.get();
  const payload = {
    // 파싱해서 자른 태그가 아니라 유튜브 재생목록 제목을 그대로 쓴다
    title: pl.rawTitle || pl.tag,
    date: pl.date,
    youtubeId: thumbId,
    playlistId: pl.playlistId,
    updatedAt: Date.now(),
  };
  let result;
  if (existing.exists) {
    await ref.set(payload, { merge: true });
    result = 'updated';
  } else {
    await ref.set({ ...payload, createdAt: Date.now() });
    console.log(`  + ${pl.date} [${pl.tag}] (재생목록, 영상 ${entries.length}개)`);
    result = 'added';
  }

  // 예전 버전이 이 재생목록 안 영상들을 낱개 문서로 잘못 저장해뒀으면 정리
  for (const e of entries) {
    if (e.id === pl.playlistId) continue;
    const strayRef = db.doc(`praiseVideos/${e.id}`);
    const stray = await strayRef.get();
    if (stray.exists && !stray.data().playlistId) {
      await strayRef.delete();
      console.log(`  - (정리) 낱개로 잘못 저장된 문서 삭제: ${e.id}`);
    }
  }

  return result;
}

async function main() {
  console.log(`[찬양] 채널 ${CHANNEL_HANDLE} 확인 중...`);
  const channelId = await resolveChannelId(CHANNEL_HANDLE);
  console.log(`  ✓ 채널 ID: ${channelId}`);

  let added = 0;
  let updated = 0;

  // 1) 채널 전체 업로드 RSS — 직접 공개 업로드된 영상(찬양팀 실황)
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const channelEntries = parseFeed(xml);
  console.log(`  ✓ 채널 업로드 RSS ${channelEntries.length}건 확인`);
  for (const e of channelEntries) {
    const { title, date } = parseVideo(e.title, e.published.slice(0, 10));
    const r = await saveVideo(e.id, title, date);
    if (r === 'added') added++;
    else updated++;
  }

  // 2) 주간 재생목록("YYMMDD[태그]") — 그 주 세트리스트(다른 팀 원곡 포함일 수
  //    있어 낱개 영상이 아니라 재생목록 카드 하나로만 저장)
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
      const r = await saveWeeklyPlaylist(pl, plEntries);
      if (r === 'added') added++;
      else updated++;
    } catch (e) {
      console.log(`  ! 재생목록 ${pl.playlistId} 확인 실패(건너뜀): ${e.message}`);
    }
  }

  console.log(`완료: 새로 등록 ${added}건, 기존 갱신 ${updated}건`);
}

main().catch((e) => {
  console.error('동기화 실패:', e);
  process.exit(1);
});
