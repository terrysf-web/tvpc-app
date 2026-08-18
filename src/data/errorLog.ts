import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { getDb } from '../firebase';

/**
 * 클라이언트에서 생긴 예외 기록 — 사용자가 화면을 캡처해서 알려주기 전에
 * 관리자가 먼저 알기 위한 것(관리자 화면 '오류' 탭에서 확인).
 * src/errorReporting.ts가 전역 window 에러·처리 안 된 Promise 거부를 잡아
 * 여기로 보낸다.
 *
 * 실패해도 조용히 넘어간다 — 에러를 기록하다가 또 에러가 나면 안 되니까.
 * 같은 세션 안에서 같은 메시지가 반복되면(예: 무한 루프) 한 번만 남기고,
 * 세션당 최대 개수도 둔다(요금제 보호).
 */
const MAX_LOGS_PER_SESSION = 20;
const seen = new Set<string>();
let sentCount = 0;

export function logClientError(message: string, extra?: { stack?: string; path?: string }) {
  try {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const key = `${message}::${extra?.path ?? ''}`;
    if (seen.has(key) || sentCount >= MAX_LOGS_PER_SESSION) return;
    seen.add(key);
    sentCount++;
    const db = getDb();
    if (!db) return;
    void addDoc(collection(db, 'errorLogs'), {
      message: message.slice(0, 1000),
      stack: extra?.stack ? extra.stack.slice(0, 2000) : null,
      path: extra?.path ?? window.location.pathname,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 150) : '',
      ts: Date.now(),
    }).catch(() => {});
  } catch {
    /* 무시 — 에러 기록기가 에러를 내면 안 된다 */
  }
}

export interface ErrorLogDoc {
  id: string;
  message: string;
  stack?: string | null;
  path?: string;
  ua?: string;
  ts: number;
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return db;
}

/** 최근 에러 기록 — 관리자 화면 '오류' 탭 표시용 (보안 규칙상 관리자만 조회 가능) */
export async function getRecentErrorLogs(count = 30): Promise<ErrorLogDoc[]> {
  const snap = await getDocs(
    query(collection(requireDb(), 'errorLogs'), orderBy('ts', 'desc'), fsLimit(count)),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<ErrorLogDoc, 'id'>), id: d.id }));
}

/**
 * 지금까지 쌓인 오류 기록을 전부 지운다 — 확인을 마친 옛 기록과 앞으로
 * 새로 쌓일 기록을 구분하기 위한 용도(관리자 화면 '오류' 탭 '전체 지우기').
 * 한 번에 최대 500개(getRecentErrorLogs 조회 개수보다 넉넉하게)까지 지운다.
 */
export async function deleteAllErrorLogs(): Promise<void> {
  const snap = await getDocs(
    query(collection(requireDb(), 'errorLogs'), orderBy('ts', 'desc'), fsLimit(500)),
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(doc(requireDb(), 'errorLogs', d.id))));
}
