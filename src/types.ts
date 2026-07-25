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
  /** 'auto' = 주보에서 자동 등록(개역한글 본문), 없으면 직접 등록 */
  source?: string;
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
 * 교회 사진 — 홈페이지(tvpc.church)에서 자동으로 모아 온 사진 한 장.
 * 사진 파일은 홈페이지에 그대로 두고 주소만 저장한다(저장소 비용 0).
 */
export interface PhotoDoc {
  id: string;
  /** 사진 원본 주소 */
  imageUrl: string;
  /** 목록에서 쓰는 작은 사진 — 없으면 imageUrl을 쓴다 */
  thumbUrl?: string | null;
  /** 사진이 속한 글·행사 제목 (묶음 제목) */
  album: string;
  /** 사진 자체 설명 — 없을 수 있다 */
  caption?: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** 홈페이지 원문 링크 */
  url?: string | null;
}

export interface OfferingRecord {
  id: string;
  item: string;
  /** YYYY-MM-DD */
  date: string;
  amount: string;
}
