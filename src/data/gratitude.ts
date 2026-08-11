import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 감사일기 — 기기 로컬에만 저장하는 철저히 개인적인 기록.
 * 하루 여러 개 적을 수 있다(하나로 제한하지 않음). 로그인·서버 저장 없음 —
 * 저장한 말씀(savedVerses.ts)과 같은 방식.
 */
export interface GratitudeEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  text: string;
  createdAt: number;
}

const KEY = 'tvpc.gratitude';

export async function getGratitudeEntries(): Promise<GratitudeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as GratitudeEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** 오늘 날짜(기기 시각 기준) — YYYY-MM-DD */
export function todayKey(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** 새 감사일기 한 줄 추가 — 맨 앞에 붙인다(최신순) */
export async function addGratitudeEntry(date: string, text: string): Promise<GratitudeEntry[]> {
  const trimmed = text.trim();
  const list = await getGratitudeEntries();
  if (!trimmed) return list;
  const entry: GratitudeEntry = {
    id: `${date}-${Date.now()}`,
    date,
    text: trimmed,
    createdAt: Date.now(),
  };
  const next = [entry, ...list];
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
  return next;
}

export async function removeGratitudeEntry(id: string): Promise<GratitudeEntry[]> {
  const next = (await getGratitudeEntries()).filter((e) => e.id !== id);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 무시 */
  }
  return next;
}
