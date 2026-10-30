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
import { fetchPlaylist } from './lib/youtube.mjs';

const CHANNEL_HANDLE = process.env.CHANNEL_HANDLE || '@tri-valley';
// 교회가 직접 고른 "교회 영상" 재생목록 — 앱 "교회 미디어 > 영상" 탭이
// 그대로 이 목록을 보여준다. 교회에서 목록에 넣고 빼는 것이 곧 앱에
// 올리고 내리는 일이 된다.
const CHURCH_VIDEOS_LIST =
  process.env.CHURCH_VIDEOS_LIST || 'PLbDbHDX38DM3TPI_tDcWtAr8GYkizgbeZ';
/** 저장된 날짜를 믿지 않고 유튜브에서 다시 읽는다(날짜 바로잡기용) */
const REFRESH_CHURCH_DATES = process.env.REFRESH_CHURCH_DATES === '1';
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
/** "2023. 9. 24." → "2023-09-24" (유튜브 한글 페이지 날짜 표기) */
function fromKoreanDate(text) {
  const m = String(text).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}

/**
 * 영상 업로드 날짜 — 시청 페이지에서 읽는다.
 *
 * 유튜브가 표기를 바꿔서, 예전 모양("uploadDate":"2023-09-24")은 이제
 * 아무 페이지에도 없다. 한글 페이지(hl=ko)에서는 사람이 읽는 글자로만
 * 들어 있다 — "publishDate":{"simpleText":"2023. 9. 24."}. 그래서 날짜를
 * 못 읽는 줄도 모르고 오늘 날짜로 채우고 있었다(교회 영상 38개 중 14개).
 * 옛 모양도 그대로 두고 한글 표기를 덧붙인다.
 */
async function fetchUploadDate(id) {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${id}&hl=ko`);
    const iso =
      html.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/) ||
      html.match(/itemprop="datePublished" content="(\d{4}-\d{2}-\d{2})/) ||
      html.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const ko =
      html.match(/"publishDate":\{"simpleText":"([^"]+)"/) ||
      html.match(/"dateText":\{"simpleText":"([^"]+)"/);
    return ko ? fromKoreanDate(ko[1]) : null;
  } catch {
    return null;
  }
}

/**
 * 볼 내용이 있는 영상인가.
 *
 * 예배를 유튜브로 생중계하다 보면, 방송을 걸어 두기만 하고 실제로는
 * 나가지 않은 빈 방송이 채널에 남는다. 제목은 멀쩡한 설교 제목이라
 * 목록에서는 똑같이 보이는데 눌러도 아무것도 안 나온다. 실제로
 * 2026-10-10 새벽집회가 그래서 같은 제목으로 두 개가 올라왔다 —
 * 하나는 934회 본 진짜 녹화, 하나는 0분짜리 빈 방송.
 *
 * 유튜브는 그런 영상의 날짜 자리에 "현재 실시간 스트림 상태: 오프라인"을
 * 적고 길이를 0으로 둔다. 그 두 가지로 가린다. 페이지를 못 받으면
 * 괜찮은 것으로 본다 — 확인이 안 됐다고 멀쩡한 설교를 빼면 안 된다.
 */
async function isPlayable(id) {
  let html;
  try {
    html = await fetchText(`https://www.youtube.com/watch?v=${id}&hl=ko`, 2);
  } catch {
    return { ok: true };
  }
  const dateText =
    html.match(/"dateText":\{"simpleText":"([^"]+)"/)?.[1] ??
    html.match(/"publishDate":\{"simpleText":"([^"]+)"/)?.[1] ??
    '';
  if (/실시간 스트림 상태|[Ll]ive stream offline/.test(dateText))
    return { ok: false, why: dateText };
  if (html.match(/"lengthSeconds":"0"/)) return { ok: false, why: '길이 0초' };
  return { ok: true };
}

/**
 * 영상의 실제 예배 날짜.
 *
 * 교회가 제목 앞에 [MM/DD/YYYY]로 예배일을 적어 두므로 그게 가장 정확하다.
 * 없으면 올린(생중계 시작) 날짜를 쓴다.
 */
async function fetchVideoDate(id) {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${id}&hl=ko`, 2);
    const t = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/)?.[1] ?? '';
    const m = t.match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const iso =
      html.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/) ||
      html.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const ko =
      html.match(/"publishDate":\{"simpleText":"([^"]+)"/) ||
      html.match(/"dateText":\{"simpleText":"([^"]+)"/);
    return ko ? fromKoreanDate(ko[1]) : null;
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

  // 팟캐스트는 발표자 이름이 제목 맨 앞에 "| 우연희, 원승환]"처럼(여는
  // 괄호가 아니라 세로줄 "|"로 시작해 "]"로 닫힌다 — 실제 제목으로 확인함)
  // 그대로 글자로 들어 있다. 예전엔 썸네일 그림을 OCR로 읽었지만, 제목에
  // 이미 정확한 이름이 있으니 그걸 쓴다(OCR은 오독 위험도 있고 이중 표시라
  // 이제 안 쓴다). 화면에도 두 번 안 겹치게 이 부분은 제목에서 지운다.
  if (category === 'podcast') {
    const speakerMatch = title.match(/^[\[|｜\s]+([가-힣][가-힣,·ㆍ\s]*[가-힣])\]\s*/);
    if (speakerMatch) {
      speaker = applyNameFixes(speakerMatch[1].replace(/\s*,\s*/g, ' · ').trim());
      title = title.slice(speakerMatch[0].length).trim();
    }
  }

  // 설교 제목 끝에 "/ 임은미 선교사"처럼 설교자가 붙는 경우(초청 강사·집회
  // 강사 등). 이걸 안 읽으면 설교는 무조건 담임목사로 적혀서, 제목에는
  // "임은미 선교사"라고 쓰여 있는데 아래에는 "허성영 담임목사"라고 나왔다.
  // 성경구절보다 먼저 떼어 낸다 — 뒤에 이게 붙어 있으면 구절이 끝에
  // 오지 않아 본문도 같이 못 읽는다.
  const guest = title.match(
    /\s*[/|]\s*([가-힣]{2,4})\s*(담임목사|목사|선교사|전도사|강도사|사모|장로|집사)\s*$/,
  );
  if (guest) {
    speaker = applyNameFixes(`${guest[1]} ${guest[2]}`);
    title = title.slice(0, guest.index).trim();
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
    //
    // 하루에 설교가 한 편일 때는 날짜만으로 짝이 맞는다. 그런데 집회처럼
    // 하루에 새벽·저녁 두 편이 있으면 날짜만 보고는 어느 영상인지 알 수
    // 없다. 그대로 두면 두 설교가 같은 영상 문서에 차례로 쓰이고 나중
    // 것이 앞의 것을 덮는다 — 실제로 2026-10-10 집회에서 저녁 설교
    // ("나의 참된 소유는 무엇인가?")가 새벽 설교 제목으로 덮여 앱에서
    // 통째로 사라졌다. 그래서 그런 날은 제목까지 맞는 영상에만 쓴다.
    const videoDocs = docs.filter((d) => !d.id.startsWith('web-'));
    const sameDay = webItems.filter((x) => x.date === w.date).length;
    let targets = videoDocs.filter((d) => d.date === w.date);
    if (sameDay > 1) {
      const before = targets.length;
      targets = targets.filter((d) => {
        const nd = normTitle(d.title);
        return nd && nw && (nd === nw || nd.includes(nw) || nw.includes(nd));
      });
      if (targets.length === 0 && before > 0) {
        // 짝을 못 찾았으면 아무것도 건드리지 않는다 — 엉뚱한 영상에
        // 덮어쓰면 그 영상이 통째로 다른 설교가 되어 버린다.
        console.log(`  · ${w.date}  ${w.title} — 같은 날 설교가 여럿인데 짝을 못 찾아 건너뜁니다`);
      }
    } else if (targets.some((d) => d.service === '주일예배')) {
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
      const hash = createHash('md5').update(w.url).digest('hex').slice(0, 6);
      // 예전 형식(web-{날짜})으로 만든 문서는 새 ID로 대체
      const legacy = db.doc(`sermons/web-${w.date}`);
      if ((await legacy.get()).exists) await legacy.delete();

      // 개별 페이지에 임베드된 유튜브 영상 ID — 채널 목록에 없는 설교도
      // 앱에서 직접 재생되게 한다 (이미 확보한 ID는 페이지 재요청 생략)
      const youtubeId =
        docs.find((x) => x.id.startsWith('web-') && x.id.endsWith(`-${hash}`))?.youtubeId ??
        (await extractYoutubeId(w.url));

      // 홈페이지 날짜는 글을 올린 날이라 실제 예배일과 다를 때가 있다.
      // 실제로 성금요일(4/3) 설교가 4/6으로, 4/19·4/26 주일 설교가
      // 4/21·4/27로 들어와 있었다 — 있지도 않은 날이고, 주일도 아니다.
      // 영상이 있으면 유튜브가 더 정확하다(교회가 제목에 예배일을 적는다).
      let date = w.date;
      if (youtubeId) {
        const real = await fetchVideoDate(youtubeId);
        if (real && real !== w.date) {
          console.log(`  · 날짜 바로잡음 ${w.date} → ${real}  ${w.title}`);
          date = real;
        }
      }
      const id = `web-${date}-${hash}`;
      // 날짜를 바로잡았으면 옛 날짜로 만들어 둔 문서는 지운다
      if (date !== w.date) {
        await db.doc(`sermons/web-${w.date}-${hash}`).delete().catch(() => {});
      }

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
          // 날짜를 바로잡은 뒤에 구분한다 — 성금요일 설교가 "주일예배"로
          // 박히지 않게(여기만 예배 구분을 박아 두고 있었다)
          subtitle: classify(w.title, date),
          service: classify(w.title, date),
          duration: '',
          youtubeId,
          date,
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
/**
 * 예배 구분 — 제목의 낱말로 정규 예배를 먼저 가리고, 나머지는 달력을 본다.
 *
 * 예전에는 금요·수요·새벽만 알고 나머지를 전부 "주일예배"로 떨어뜨렸다.
 * 그래서 44주년 집회가 금요일 것도 토요일 저녁 것도 "주일예배"로 나왔다.
 * 낱말로 집회를 알아내려고도 해 봤지만, 집회 이름은 해마다 달라지니
 * 따라갈 수가 없다. 주일이 아닌 날에 드린 예배는 주일예배가 아니라는
 * 사실이 더 확실하므로, 날짜의 요일로 가린다.
 */
function classify(title, date) {
  // "성령집회"에도 '집회'가 들어 있으므로 금요부터 가린다
  if (/금요|성령집회/.test(title)) return '금요성령집회';
  if (/수요/.test(title)) return '수요예배';
  // 새벽은 집회 중이든 아니든 새벽예배다
  if (/새벽/.test(title)) return '새벽기도회';
  // 주일이 아닌 날 — 집회·절기·행사 예배. 날짜를 모르면 건드리지 않는다.
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!Number.isNaN(dow) && dow !== 0) return '특별예배';
  }
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

// 제목에 발표자 이름을 넣기 시작한 건 최근 영상부터라, 그 이전 팟캐스트는
// 제목에서 이름을 못 찾는다(화면 스캔은 더 이상 하지 않음) — 사람이 직접
// 확인해서 넣어준 이름을 영상 ID로 고정해 둔다.
const MANUAL_PREACHER_OVERRIDES = {
  'T7t-h8fcVEM': '김미현 · 진선미', // 2026-07-19 표현되지 못한 사랑, 늦기 전에 전해야 할 고백
  poYcJr4H9f4: '김미현 · 진선미', // 2026-07-15 보이지 않아도 하나님은 일하고 계십니다
};

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

// 빈 방송 걸러내기 — 백필(수백 개)에서는 건너뛰고 평소 목록(최대 15개)에서만
// 확인한다. 이미 올라가 있던 빈 방송도 여기서 지워져 저절로 정리된다.
if (!BACKFILL && videos.length > 0) {
  const good = [];
  for (const v of videos) {
    const { ok, why } = await isPlayable(v.id);
    if (ok) {
      good.push(v);
      continue;
    }
    console.log(`  – 빈 방송이라 건너뜁니다(${why}): ${v.title}`);
    const ref = db.doc(`sermons/yt-${v.id}`);
    if ((await ref.get()).exists) {
      await ref.delete();
      console.log(`    (이미 올라가 있던 문서도 지웠습니다)`);
    }
  }
  videos = good;
}

const LABEL = { sermon: '설교', podcast: '팟캐스트', praise: '찬양', etc: '기타' };

let wrote = 0;
for (const v of videos) {
  const p = parseVideo(v.title, v.published);
  const service = p.category === 'sermon' ? classify(v.title, p.date) : LABEL[p.category];
  // 팟캐스트는 담임목사님이 아니라 매회 다른 성도가 발표한다 — 이름은
  // 제목 맨 앞 대괄호에서 그대로 읽는다(더 이상 썸네일을 OCR로 읽지 않음).
  // 이름을 제목에 넣기 시작한 건 최근 영상부터라, 그 이전 영상은 제목에서
  // 못 찾는다(p.speaker === ''). 그런 옛날 영상까지 매번 발표자를 빈 값으로
  // 덮어쓰면 예전에 화면 스캔으로 채워 둔 이름이 지워지므로, 새로 못 찾았을
  // 때는 payload에서 아예 빼서 기존 값을 그대로 둔다.
  const payload = {
    category: p.category,
    title: p.title,
    subtitle: service,
    scripture: p.scripture,
    date: p.date,
    service,
    duration: '',
    series: p.scripture ? p.scripture.replace(/\s*\d.*$/, '') : service,
    youtubeId: v.id,
    imageUrl: null,
  };
  // 제목에 설교자가 적혀 있으면 그 이름이 맞다 — 담임목사 기본값은 제목에서
  // 아무도 못 찾았을 때만 쓴다(그동안은 설교면 무조건 담임목사로 덮었다).
  if (p.speaker) {
    payload.preacher = p.speaker;
  } else if (p.category === 'sermon') {
    payload.preacher = PREACHER_DEFAULT;
  } else if (MANUAL_PREACHER_OVERRIDES[v.id]) {
    payload.preacher = MANUAL_PREACHER_OVERRIDES[v.id];
  }
  await db.doc(`sermons/yt-${v.id}`).set(payload, { merge: true });
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

/**
 * "교회 영상" 재생목록 → 앱 영상 탭.
 *
 * 예전에는 제목에 "찬양·선교영상" 같은 낱말이 있는지로 짐작해 영상 탭에
 * 넣었다. 그러다 보니 성가대 주일찬양·반주곡이 영상 탭을 채우고, 정작
 * VBS·세례식·임직식 같은 교회 영상은 하나도 없었다. 무엇을 보여줄지는
 * 교회가 정하는 게 맞으므로, 교회가 직접 고른 재생목록을 그대로 쓴다.
 *
 * 목록에 있으면 churchVideo를 켜고 놓인 차례(churchVideoOrder)를 적는다.
 * 목록에서 빠지면 꺼서 앱에서도 내려간다 — 문서는 지우지 않는다(설교로도
 * 쓰이는 영상이 있을 수 있고, 다시 넣으면 그대로 살아난다).
 */
async function syncChurchVideos() {
  let name, videos;
  try {
    ({ name, videos } = await fetchPlaylist(CHURCH_VIDEOS_LIST));
  } catch (e) {
    console.log(`! 교회 영상 재생목록을 읽지 못했습니다: ${e.message}`);
    return;
  }
  if (videos.length === 0) {
    // 읽기는 됐는데 0개 — 유튜브 쪽 일시 오류일 수 있다. 이때 기존 표시를
    // 지우면 영상 탭이 통째로 비므로, 아무것도 건드리지 않고 넘어간다.
    console.log('! 교회 영상 재생목록이 비어 보여 이번에는 건너뜁니다.');
    return;
  }
  console.log(`\n교회 영상 재생목록 "${name}" — ${videos.length}개`);

  const inList = new Set();
  const unknownDates = [];
  const fixedDates = [];
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const id = `yt-${v.id}`;
    inList.add(id);
    const ref = db.doc(`sermons/${id}`);
    const cur = await ref.get();
    // 날짜 — 제목의 [MM/DD/YYYY], 없으면 이미 저장된 값, 그것도 없으면
    // 유튜브 시청 페이지에서 한 번 읽어 온다(다음부터는 저장된 값을 쓴다).
    const fromTitle = v.title.match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
    // REFRESH_CHURCH_DATES=1이면 저장된 날짜를 믿지 않고 유튜브에서 다시
    // 읽는다 — 날짜 읽기가 고장났던 동안 오늘 날짜로 채워진 것을 바로잡을 때.
    const titleDate = fromTitle
      ? `${fromTitle[3]}-${fromTitle[1].padStart(2, '0')}-${fromTitle[2].padStart(2, '0')}`
      : null;
    let date = titleDate || (REFRESH_CHURCH_DATES ? null : cur.get('date'));
    if (!date) date = (await fetchUploadDate(v.id)) || cur.get('date') || null;
    if (!date) {
      // 끝내 못 읽었다 — 날짜 없이 저장하면 목록 조회(날짜순)에서 빠져
      // 영상이 아예 안 보이므로 오늘로 두되, 조용히 넘어가지는 않는다.
      date = new Date().toISOString().slice(0, 10);
      unknownDates.push(`${v.title} (${v.id})`);
    }
    const p = parseVideo(v.title, `${date}T00:00:00Z`);
    const payload = { churchVideo: true, churchVideoOrder: i };
    if (!cur.exists) {
      // 처음 보는 영상만 내용을 채운다 — 이미 있는 문서(설교 등)는 제목·
      // 분류를 건드리지 않는다. 홈페이지에서 보강해 둔 내용이 덮이면 안 된다.
      Object.assign(payload, {
        category: p.category === 'sermon' ? 'etc' : p.category,
        title: p.title,
        subtitle: LABEL[p.category === 'sermon' ? 'etc' : p.category],
        scripture: p.scripture,
        date,
        service: LABEL[p.category === 'sermon' ? 'etc' : p.category],
        duration: '',
        series: '교회 영상',
        youtubeId: v.id,
        imageUrl: null,
      });
    }
    // 이미 있는 문서의 날짜는 평소엔 건드리지 않는다(홈페이지에서 보강해 둔
    // 설교 날짜가 덮이면 안 된다). 다만 날짜 바로잡기로 돌렸을 때는 다시
    // 읽은 값을 실제로 적어야 한다 — 전에는 여기서 막혀, 로그에는 제대로
    // 찍히는데 저장은 안 되는 상태였다.
    let mark = cur.exists ? '✓' : '+';
    if (cur.exists && REFRESH_CHURCH_DATES && date && cur.get('date') !== date) {
      payload.date = date;
      mark = '↻';
      fixedDates.push(`${p.title}: ${cur.get('date')} → ${date}`);
    }
    await ref.set(payload, { merge: true });
    console.log(`  ${mark} ${date}  ${p.title}`);
  }

  // 목록에서 빠진 영상은 표시를 끈다
  const marked = await db.collection('sermons').where('churchVideo', '==', true).get();
  let off = 0;
  for (const d of marked.docs) {
    if (inList.has(d.id)) continue;
    await d.ref.update({ churchVideo: false });
    console.log(`  – 목록에서 빠짐: ${d.get('title')}`);
    off++;
  }
  console.log(`교회 영상: ${videos.length}개 표시${off ? `, ${off}개 내림` : ''}`);
  if (fixedDates.length) {
    console.log(`날짜 바로잡음 ${fixedDates.length}개:`);
    for (const t of fixedDates) console.log(`    · ${t}`);
  }
  if (unknownDates.length) {
    console.log(`! 날짜를 못 읽어 오늘로 둔 영상 ${unknownDates.length}개:`);
    for (const t of unknownDates) console.log(`    · ${t}`);
  }
}

await syncChurchVideos();

// 홈페이지 정식 설교 정보(제목·본문·설교자·이미지)로 보강 — 항상 마지막에 실행
try {
  await syncWebSermons();
} catch (e) {
  console.log(`! 홈페이지 설교 동기화 실패 (영상 동기화는 완료): ${e.message}`);
}

console.log(`완료: ${wrote}개 영상 동기화`);
process.exit(0);
