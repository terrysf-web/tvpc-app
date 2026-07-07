import type { SermonDoc } from './types';

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
