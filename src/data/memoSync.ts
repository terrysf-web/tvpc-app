import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { getAuthOrNull, getDb, watchUser } from '../firebase';
import { isMemoStorageKey } from './backup';

/**
 * 개인 메모 클라우드 동기화 — 로그인 계정(목회자·관리자)만.
 *
 * 말씀 메모·형광펜, 설교 메모, 괄호 답, 저장한 말씀을 userMemos/{uid}에 보관해
 * 폰·컴퓨터 어디서 로그인해도 같은 기록이 보인다. 로그인하지 않은 교인은
 * 지금처럼 기기에만 저장된다(서버로 올라가지 않음).
 *
 * 병합 방식: 마지막으로 동기화된 내용(스냅샷)과 비교하는 3자 병합 —
 * 이쪽에서만 바뀌었으면 이쪽 것, 저쪽에서만 바뀌었으면 저쪽 것,
 * 양쪽이 다 바뀌었으면 지금 쓰고 있는 기기 것을 남긴다.
 */

const SNAPSHOT_KEY = 'tvpc.memoSyncSnapshot';

type MemoMap = Record<string, string>;

function storageOrNull(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readLocalMemos(ls: Storage): MemoMap {
  const out: MemoMap = {};
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (key && isMemoStorageKey(key)) {
      const v = ls.getItem(key);
      if (v != null) out[key] = v;
    }
  }
  return out;
}

function readSnapshot(ls: Storage): MemoMap {
  try {
    const raw = ls.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as MemoMap) : {};
  } catch {
    return {};
  }
}

/** 삭제도 동기화되도록, 지워진 키는 빈 문자열로 표시해 보관한다 */
const DELETED = '';

function merge(local: MemoMap, remote: MemoMap, snap: MemoMap): MemoMap {
  const merged: MemoMap = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(snap)])) {
    const l = local[key] ?? DELETED;
    const r = remote[key] ?? DELETED;
    const s = snap[key] ?? DELETED;
    if (l === r) merged[key] = l;
    else if (s === r) merged[key] = l; // 이쪽에서만 바뀜
    else if (s === l) merged[key] = r; // 저쪽에서만 바뀜
    else merged[key] = l || r; // 양쪽 다 바뀜 — 쓰고 있는 기기 우선
  }
  return merged;
}

/** 한 번 동기화 — 로그인된 관리자 계정일 때만 동작한다 */
export async function syncMemosOnce(): Promise<void> {
  const ls = storageOrNull();
  const db = getDb();
  const user = getAuthOrNull()?.currentUser;
  // 익명 세션(교인)은 이메일이 없다 — 클라우드 저장 대상이 아니다
  if (!ls || !db || !user || !user.email) return;

  const ref = doc(db, 'userMemos', user.uid);
  let remote: MemoMap = {};
  try {
    const snapDoc = await getDoc(ref);
    if (snapDoc.exists()) {
      const data = snapDoc.get('data');
      if (data && typeof data === 'object') remote = data as MemoMap;
    }
  } catch {
    // 권한이 없는 계정(관리자 아님)이면 조용히 넘어간다
    return;
  }

  const local = readLocalMemos(ls);
  const snap = readSnapshot(ls);
  const merged = merge(local, remote, snap);

  // 기기에 반영 — 빈 값(삭제)은 지운다
  for (const [key, val] of Object.entries(merged)) {
    if (val === DELETED) ls.removeItem(key);
    else if (ls.getItem(key) !== val) ls.setItem(key, val);
  }

  // 서버에 반영 — 내용이 달라졌을 때만 쓴다
  const sameAsRemote =
    Object.keys(merged).length === Object.keys(remote).length &&
    Object.entries(merged).every(([k, v]) => remote[k] === v);
  if (!sameAsRemote) {
    await setDoc(ref, { data: merged, updatedAt: Date.now(), email: user.email }, { merge: true });
  }
  ls.setItem(SNAPSHOT_KEY, JSON.stringify(merged));
}

/**
 * 앱이 열려 있는 동안 메모를 자동 동기화한다.
 * 로그인 상태가 바뀔 때, 앱으로 돌아올 때, 그리고 2분마다.
 */
export function useMemoSync(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stopped = false;
    const run = () => {
      if (!stopped) syncMemosOnce().catch(() => {});
    };

    const unsub = watchUser(() => run());
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    // 다른 기기에서 쓴 내용이 곧 넘어오도록 주기적으로도 확인
    const timer = setInterval(run, 120_000);

    return () => {
      stopped = true;
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
}
