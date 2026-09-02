export interface VerseDoc {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** 예: "시편 23:1" */
  reference: string;
  /** 히어로에 크게 표시되는 말씀 */
  heroText: string;
  /** 본문 탭 — 절 단위 */
  passage: { verse: number; text: string }[];
  passageTitle: string;
  meditation: string;
  application: string[];
  prayer: string;
  imageUrl?: string | null;
  /** 'auto' = 주보에서 자동 등록, 없으면 직접 등록 */
  source?: string;
  /** 자동 등록 본문의 번역본 — 'gae'=개역개정, 'krv'=개역한글(예전 자동 등록분).
   *  없으면(예전 문서) 개역한글로 간주한다. */
  translation?: 'gae' | 'krv';
}

export type SermonCategory = 'sermon' | 'podcast' | 'praise' | 'etc';

export interface SermonDoc {
  id: string;
  /** 자동 분류 — 없으면 'sermon'으로 간주 */
  category?: SermonCategory;
  title: string;
  subtitle: string;
  preacher: string;
  scripture: string;
  /** YYYY-MM-DD */
  date: string;
  service: string;
  duration: string;
  series: string;
  youtubeId?: string | null;
  imageUrl?: string | null;
  /** 교회 홈페이지 개별 설교 페이지 — 영상이 없을 때 대체 링크 */
  sermonUrl?: string | null;
  featured?: boolean;
}

export type NewsCategory = 'notice' | 'event';

export interface NewsDoc {
  id: string;
  category: NewsCategory;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  imageUrl?: string | null;
  /** 홈페이지 원문 링크 (홈페이지 동기화 소식) */
  url?: string | null;
  /** 긴급 알림 본문 — 알림이 소식으로 자동 등록될 때 저장 */
  body?: string | null;
  /** true면 긴급 알림에서 온 소식 */
  alert?: boolean;
}

/** 교회 사진 — 홈페이지 사진 게시판(나눔 › 교회 사진) 글 하나 */
export interface PhotoDoc {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 대표 사진 */
  imageUrl?: string | null;
  /** 글 안의 사진들 (앨범 보기용) */
  images?: string[];
  /** 앨범 사진 수 */
  photoCount?: number;
  /** 홈페이지 원문 링크 */
  url?: string | null;
}

export interface EventDoc {
  id: string;
  /** 예: "05.22 금요일" */
  dateLabel: string;
  title: string;
  /** 예: "오후 8:00 · 본당" */
  detail: string;
  imageUrl?: string | null;
  /** 홈페이지 행사 상세 링크 */
  url?: string | null;
  /** YYYY-MM-DD — 홈페이지 동기화 일정의 실제 날짜 (달력 표시용) */
  sortKey?: string;
}

export type PrayerCategory = 'family' | 'health' | 'work' | 'etc' | 'answered';

export interface PrayerDoc {
  id: string;
  category: PrayerCategory;
  /** 응답 여부 — true면 기도응답 탭에 표시 */
  answered: boolean;
  text: string;
  authorName: string;
  /** epoch millis */
  createdAt: number;
  prayCount: number;
}

/**
 * 은혜안에 찬양팀 유튜브 채널 콘텐츠 — 교회 미디어 "찬양" 탭.
 * 채널에 직접 올린 영상은 개별 문서(youtubeId만), 매주 만드는 "세트리스트"
 * 재생목록은 playlistId가 있는 문서로 저장된다 — 재생목록은 다른 팀 원곡이
 * 섞여 있을 수 있어 낱개로 안 보여주고 재생목록째로만 연다.
 */
export interface PraiseVideoDoc {
  id: string;
  /** 영상 제목, 또는 재생목록이면 유튜브 재생목록 제목 그대로 */
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 썸네일용 — 재생목록이면 그 안 첫 영상의 ID */
  youtubeId: string;
  /** 있으면 이 문서는 재생목록 — 앱 안 재생기에서 이 재생목록을 연다 */
  playlistId?: string | null;
  /** 재생목록일 때만 — 안의 곡 목록(직접 골라 들을 수 있게) */
  entries?: { id: string; title: string }[];
}

export interface OfferingRecord {
  id: string;
  item: string;
  /** YYYY-MM-DD */
  date: string;
  amount: string;
}
