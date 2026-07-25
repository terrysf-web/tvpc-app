/**
 * 내 메모 백업 — 이 기기에 저장된 개인 기록(설교 메모, 괄호 답,
 * 말씀 메모·형광펜, 저장한 말씀)을 파일 하나로 내보내고 되불러온다.
 * 서버에는 올라가지 않는다 — 파일은 사용자가 직접 보관한다.
 */

const PREFIXES = ['bulletinNote:', 'bulletinFill:', 'verseNote:', 'verseHl:'];
const SINGLE_KEYS = ['tvpc.savedVerses'];

/** 개인 기록에 해당하는 저장 키인지 — 백업·클라우드 동기화가 함께 쓴다 */
export function isMemoStorageKey(key: string): boolean {
  return SINGLE_KEYS.includes(key) || PREFIXES.some((p) => key.startsWith(p));
}

const KIND = 'tvpc-memo-backup';

function storageOrNull(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

const isMemoKey = isMemoStorageKey;

/** 백업 파일 다운로드 — 저장된 항목 수를 돌려준다 (0이면 백업할 것 없음) */
export function exportMemoBackup(): number {
  const ls = storageOrNull();
  if (!ls || typeof document === 'undefined') return 0;
  const data: Record<string, string> = {};
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (key && isMemoKey(key)) {
      const val = ls.getItem(key);
      if (val != null) data[key] = val;
    }
  }
  const count = Object.keys(data).length;
  if (count === 0) return 0;

  const payload = { kind: KIND, version: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `교회앱-메모백업-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return count;
}

/** 백업 파일에서 복원 — 되살린 항목 수를 돌려준다 */
export async function importMemoBackup(file: File): Promise<number> {
  const ls = storageOrNull();
  if (!ls) throw new Error('이 기기에서는 복원을 지원하지 않습니다.');
  const text = await file.text();
  let payload: { kind?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('백업 파일이 아닙니다.');
  }
  if (payload.kind !== KIND || !payload.data || typeof payload.data !== 'object') {
    throw new Error('교회 앱 메모 백업 파일이 아닙니다.');
  }
  let count = 0;
  for (const [key, val] of Object.entries(payload.data)) {
    // 백업 파일에 다른 키가 섞여 있어도 메모 항목만 되살린다
    if (isMemoKey(key) && typeof val === 'string') {
      ls.setItem(key, val);
      count++;
    }
  }
  return count;
}
