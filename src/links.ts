import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
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
 * 설교 영상 재생 — youtubeId가 있으면 앱 내 재생 화면(/watch)으로 이동
 * (외부 탭이 남지 않음). 없으면 교회 채널로.
 */
export function playSermon(s: SermonDoc) {
  if (s.youtubeId) {
    router.push({
      pathname: '/watch',
      params: { v: s.youtubeId, t: s.title },
    });
  } else {
    openExternal(YOUTUBE_CHANNEL_URL);
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
