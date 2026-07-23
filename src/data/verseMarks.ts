/**
 * 말씀 형광펜(하이라이트) — 본문에서 마음에 닿은 구절을 눌러 표시한다.
 * 날짜별로 이 기기(localStorage)에만 저장되며, 절 번호와 본문을 함께
 * 담아 '저장한 말씀' 목록에서 하이라이트한 구절만 바로 보여줄 수 있다.
 */
export interface VerseHighlight {
  /** 절 번호 */
  v: number;
  /** 절 본문 */
  t: string;
}

const keyOf = (date: string) => `verseHl:${date}`;

export function getHighlights(date: string): VerseHighlight[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(keyOf(date));
    const list = raw ? (JSON.parse(raw) as VerseHighlight[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** 눌러서 켜고 끄기 — 갱신된 목록(절 번호순)을 반환한다 */
export function toggleHighlight(date: string, v: number, t: string): VerseHighlight[] {
  const list = getHighlights(date);
  const without = list.filter((h) => h.v !== v);
  const next =
    without.length === list.length ? [...list, { v, t }].sort((a, b) => a.v - b.v) : without;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (next.length) window.localStorage.setItem(keyOf(date), JSON.stringify(next));
      else window.localStorage.removeItem(keyOf(date));
    }
  } catch {
    /* 저장 실패는 무시 */
  }
  return next;
}
