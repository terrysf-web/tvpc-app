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
}

export interface EventDoc {
  id: string;
  /** 예: "05.22 금요일" */
  dateLabel: string;
  title: string;
  /** 예: "오후 8:00 · 본당" */
  detail: string;
  imageUrl?: string | null;
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

export interface OfferingRecord {
  id: string;
  item: string;
  /** YYYY-MM-DD */
  date: string;
  amount: string;
}
