import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform } from 'react-native';
import type { SermonDoc } from './types';

/**
 * 외부 링크 열기.
 * 웹: window.open으로 새 탭에 목적지 URL을 직접 로드 — expo-web-browser의
 * 웹 구현은 about:blank 팝업을 먼저 만들고 이동해서, iOS 사파리에서
 * 뒤로가기 시 빈 탭이 남는 문제가 있다.
 * 네이티브: 인앱 브라우저(SFSafariViewController/Custom Tabs).
 */
export function openExternal(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    WebBrowser.openBrowserAsync(url).catch(() => {});
  }
}

/**
 * 유튜브 영상 열기 — 유튜브 앱에서 전체 보기·자동 재생.
 *
 * 새 탭(window.open)으로 열면 유튜브 앱으로 넘어간 뒤 돌아왔을 때
 * 빈 탭("Search or enter website name")이 남는다. 같은 창에서 주소를
 * 이동하면 iOS·안드로이드가 이 주소를 유튜브 앱으로 가로채므로
 * 빈 탭이 생기지 않고, 앱에서 뒤로 가면 원래 화면으로 돌아온다.
 */
export function openYouTube(videoId: string) {
  openYouTubeUrl(`https://www.youtube.com/watch?v=${videoId}`);
}

/** 유튜브 주소를 같은 창에서 열기 — 빈 탭이 남지 않는다 */
export function openYouTubeUrl(url: string) {
  if (Platform.OS === 'web') {
    window.location.href = url;
  } else {
    WebBrowser.openBrowserAsync(url).catch(() => {});
  }
}

/** 주일 온라인예배 재생목록 — 지난 예배 녹화본이 최신순으로 쌓인다 */
export const WORSHIP_PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=PLbDbHDX38DM2DLSk57Ei6BGg-mvzs_1HZ';

/** 주일예배 생중계 — 방송 중일 때 실시간 화면으로 */
export function openLiveWorship() {
  openYouTubeUrl(`${YOUTUBE_CHANNEL_URL}/live`);
}

/** 지난 주일 온라인예배 다시보기 — 예배 재생목록(맨 위가 가장 최근) */
export function openWorshipReplay() {
  openYouTubeUrl(WORSHIP_PLAYLIST_URL);
}

/**
 * 설교 영상 재생 — 유튜브에서 전체 보기로 연다(자동 재생).
 * 앱 안 작은 재생기는 영상에 따라 "Watch on YouTube"로 막히고 자동 재생도
 * 되지 않아, 유튜브 앱·사이트로 바로 넘긴다.
 * 영상이 없으면 홈페이지 개별 설교 페이지로, 그것도 없으면 교회 채널로.
 */
export function playSermon(s: SermonDoc) {
  if (s.youtubeId) {
    openYouTube(s.youtubeId);
  } else if (s.sermonUrl) {
    router.push({ pathname: '/browser', params: { url: s.sermonUrl, t: s.title } });
  } else {
    openExternal(YOUTUBE_CHANNEL_URL);
  }
}

/**
 * 그날 말씀에 걸린 "설교 듣기" — 사역자 페이지에서 녹음해 올렸거나 주소를
 * 넣어 둔 것(verses/{날짜}.sermonAudioUrl). 아직 없으면 준비 중이라고 알린다.
 * 유튜브 주소면 앱 안 재생기로 열어 다 듣고 닫았을 때 앱으로 돌아오게 하고,
 * 녹음 파일 주소는 브라우저로 연다.
 */
export function playSermonAudio(url: string | null | undefined, title: string) {
  const link = url?.trim();
  if (!link) {
    const msg = '설교 듣기는 준비 중입니다. 조금만 기다려 주세요.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.alert(msg);
    } else {
      Alert.alert('준비 중', msg);
    }
    return;
  }
  const yt = link.match(/(?:youtu\.be\/|[?&]v=|youtube\.com\/(?:embed|live)\/)([\w-]{11})/)?.[1];
  if (yt) {
    router.push({ pathname: '/watch', params: { v: yt, t: title } });
  } else {
    openExternal(link);
  }
}

/**
 * 올려 둔 설교 파일을 기기에 내려받는다(목회자·점검 계정용).
 *
 * 다른 도메인에 있는 파일은 <a download>가 무시돼 그냥 열리기만 하므로,
 * 내용을 받아 와서 저장한다. 그것마저 막히면(CORS 등) 새 탭으로 열어
 * 브라우저 기능으로 저장하시게 한다 — 아무 일도 안 일어나는 것보다 낫다.
 */
export async function saveUrlToDevice(url: string, filename: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    openExternal(url);
    return;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
  } catch {
    openExternal(url);
  }
}

/** 교회 유튜브 채널 — 설교 영상에 youtubeId가 없으면 여기로 이동 */
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@tri-valley';

export function sermonVideoUrl(s: SermonDoc): string {
  return s.youtubeId
    ? `https://www.youtube.com/watch?v=${s.youtubeId}`
    : YOUTUBE_CHANNEL_URL;
}

/**
 * 설교 썸네일 — imageUrl이 있으면 그것을, 없고 youtubeId가 있으면
 * 유튜브 썸네일을 자동 사용. 둘 다 없으면 null(그라데이션 플레이스홀더).
 */
export function sermonThumb(s: SermonDoc): string | null {
  if (s.imageUrl) return s.imageUrl;
  if (s.youtubeId) return `https://i.ytimg.com/vi/${s.youtubeId}/hqdefault.jpg`;
  return null;
}
