/**
 * 유튜브에서 재생목록을 읽어 오는 공용 코드.
 *
 * sync-sermons(동기화)와 check-playlist(확인)가 같은 길로 읽어야, 확인해서
 * 본 것과 실제로 올라가는 것이 어긋나지 않는다.
 */
export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export async function fetchText(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko,en' } });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      // 유튜브 쪽 일시적 오류 대비. 너무 빨리 많이 물어보면 429로 막는데,
      // 그때는 짧게 쉬어서는 소용이 없어 넉넉히 기다렸다 다시 묻는다.
      if (i < attempts - 1) {
        const tooMany = /HTTP 429/.test(e.message);
        const wait = tooMany ? 8000 * (i + 1) : 2000 * (i + 1);
        console.log(`  ! 요청 실패, 재시도 ${i + 1}/${attempts - 1} (${Math.round(wait / 1000)}초 뒤): ${e.message}`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

/**
 * 재생목록 전체를 차례대로 읽는다 — 재생목록 페이지는 처음 100개만 담고
 * 나머지는 "더 보기" 토큰으로 이어지므로, 토큰이 끊길 때까지 따라간다.
 * 반환: [{ id, title, seconds }] (재생목록에 놓인 차례 그대로)
 */
export async function fetchPlaylist(listId) {
  // 페이지는 API 키 획득용 — 목록 자체는 내부 browse API로 받는다
  const html = await fetchText(`https://www.youtube.com/playlist?list=${listId}&hl=ko`);
  const km = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const apiKey = km ? km[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
  const tm = html.match(/<title>([^<]*)<\/title>/);
  const name = tm ? tm[1].replace(/\s*-\s*YouTube\s*$/, '').trim() : '';

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
        title: (v.title?.runs || []).map((r) => r.text).join('') || v.title?.simpleText || '',
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

  // ① 재생목록 페이지에 박혀 있는 자료를 먼저 읽는다. browse API는 목록에
  //    따라 빈 응답을 주기도 하는데(설교 말씀 목록이 그랬다), 페이지 쪽은
  //    사람이 보는 그대로라 더 확실하다.
  const blob = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (blob) {
    try {
      walk(JSON.parse(blob[1]));
    } catch {
      /* 페이지에서 못 읽으면 아래 browse로 */
    }
  }
  const fromPage = videos.length;

  // ② 나머지는 browse API로 이어 받는다
  const first = await browse({ browseId: `VL${listId}` });
  if (first) walk(first);
  if (videos.length === 0) {
    console.log(`  ! ${listId}: 페이지·browse 둘 다 영상 0개`);
    if (first) {
      console.log(`    browse 최상위 키: ${Object.keys(first).join(', ')}`);
      // 유튜브가 이유를 알려 주는 자리들 — 비공개·삭제 등
      const texts = [];
      const collect = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(collect);
        if (typeof n.simpleText === 'string') texts.push(n.simpleText);
        if (Array.isArray(n.runs)) texts.push(n.runs.map((r) => r.text).join(''));
        for (const k in n) collect(n[k]);
      };
      collect(first.alerts ?? null);
      collect(first.contents ?? null);
      const uniq = [...new Set(texts.filter((t) => t && t.length < 120))].slice(0, 12);
      for (const t of uniq) console.log(`    · ${t}`);
    }
  } else if (fromPage && videos.length === fromPage) {
    console.log(`  (페이지에서 ${fromPage}개 읽음)`);
  }

  let guard = 0;
  while (continuation && guard++ < 80) {
    const token = continuation;
    continuation = null;
    const j = await browse({ continuation: token });
    if (!j) break;
    walk(j);
  }
  return { name, videos };
}

/**
 * 채널 "동영상" 탭 전체 목록.
 *
 * 지금까지는 RSS(최근 15개)만 봐서, 그보다 오래된 설교는 유튜브로
 * 들어올 길이 없었다. 그래서 홈페이지 날짜를 그대로 받아썼고, 4/19
 * 주일설교가 4/21로 들어가는 일이 생겼다. 채널 목록을 통째로 읽으면
 * 모든 설교가 유튜브 제목([MM/DD/YYYY])으로 들어온다.
 */
export async function fetchChannelVideos(channelId) {
  const html = await fetchText(`https://www.youtube.com/channel/${channelId}/videos?hl=ko`);
  const apiKey =
    html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ??
    'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

  const videos = [];
  const seen = new Set();
  let continuation = null;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const v = node.videoRenderer || node.gridVideoRenderer || node.playlistVideoRenderer;
    if (v?.videoId && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      videos.push({
        id: v.videoId,
        title: (v.title?.runs || []).map((r) => r.text).join('') || v.title?.simpleText || '',
        seconds: Number(v.lengthSeconds || 0),
      });
    }
    const tok =
      node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
      node.nextContinuationData?.continuation;
    if (tok) continuation = tok;
    for (const k in node) walk(node[k]);
  };

  const blob = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (blob) {
    try {
      walk(JSON.parse(blob[1]));
    } catch {
      /* 아래 browse로 */
    }
  }

  const browse = async (body) => {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240401.00.00', hl: 'ko', gl: 'US' } },
        ...body,
      }),
    });
    return res.ok ? res.json() : null;
  };

  let guard = 0;
  while (continuation && guard++ < 80) {
    const token = continuation;
    continuation = null;
    const j = await browse({ continuation: token });
    if (!j) break;
    walk(j);
  }
  return videos;
}
