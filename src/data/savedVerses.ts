import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 저장한 말씀(북마크) — 기기 로컬에만 저장한다.
 * 본문 전체가 아니라 날짜·제목·첫 구절만 담고,
 * 다시 열 때 verses/{날짜} 문서를 불러와 전체를 보여준다.
 */
export interface SavedVerse {
  /** YYYY-MM-DD — verses/{date} 문서 ID */
  date: string;
  reference: string;
  heroText: string;
  savedAt: number;
}

const KEY = 'tvpc.savedVerses';

export async function getSavedVerses(): Promise<SavedVerse[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedVerse[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function isVerseSaved(date: string): Promise<boolean> {
  return (await getSavedVerses()).some((v) => v.date === date);
}

/** 저장돼 있으면 해제, 없으면 저장. 저장 후 상태를 반환한다. */
export async function toggleSavedVerse(entry: Omit<SavedVerse, 'savedAt'>): Promise<boolean> {
  const list = await getSavedVerses();
  const without = list.filter((v) => v.date !== entry.date);
  const nowSaved = without.length === list.length;
  const next = nowSaved ? [{ ...entry, savedAt: Date.now() }, ...without] : without;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
  return nowSaved;
}

export async function removeSavedVerse(date: string): Promise<SavedVerse[]> {
  const next = (await getSavedVerses()).filter((v) => v.date !== date);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
  return next;
}
