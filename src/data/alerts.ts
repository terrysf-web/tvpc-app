import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { getAuthOrNull, getDb } from '../firebase';

/**
 * 긴급 알림 — 관리자가 등록하면 알림을 켠 모든 기기로 푸시 전송.
 *
 * 흐름: alerts 컬렉션에 대기(pending) 문서 저장 → GitHub 발송 워크플로를
 * 즉시 깨워(연결 토큰 필요, 약 1분) 전송. 토큰이 없거나 깨우기에 실패해도
 * 매시간 도는 안전망 워크플로가 대기 알림을 자동 발송한다.
 */

const GITHUB_REPO = 'terrysf-web/tvpc-app';
const ALERT_WORKFLOW = 'send-alert.yml';
const WORKFLOW_BRANCH = 'claude/react-native-firebase-app-e0vg1r';

export interface AlertDoc {
  id: string;
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'expired';
  createdAt: number;
  sentAt?: number;
  sentCount?: number;
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return db;
}

/** 긴급 알림 등록 — 발송 대기 상태로 저장하고 문서 ID를 돌려준다 */
export async function createAlert(title: string, body: string): Promise<string> {
  const id = `a-${Date.now()}`;
  await setDoc(doc(requireDb(), 'alerts', id), {
    title: title.trim().slice(0, 60),
    body: body.trim().slice(0, 500),
    status: 'pending',
    createdAt: Date.now(),
    by: getAuthOrNull()?.currentUser?.email ?? null,
  });
  return id;
}

export async function getAlert(id: string): Promise<AlertDoc | null> {
  const snap = await getDoc(doc(requireDb(), 'alerts', id));
  return snap.exists() ? ({ ...(snap.data() as Omit<AlertDoc, 'id'>), id: snap.id }) : null;
}

/** 최근 보낸 알림 — 관리자 화면 발송 내역 표시용 */
export async function getRecentAlerts(count = 3): Promise<AlertDoc[]> {
  const snap = await getDocs(
    query(collection(requireDb(), 'alerts'), orderBy('createdAt', 'desc'), fsLimit(count)),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<AlertDoc, 'id'>), id: d.id }));
}

/** 즉시 발송용 GitHub 연결 토큰 (config/github) — 관리자만 읽고 쓸 수 있다 */
export async function getDispatchToken(): Promise<string | null> {
  const snap = await getDoc(doc(requireDb(), 'config', 'github'));
  const token = snap.exists() ? (snap.get('token') as string | undefined) : undefined;
  return token && token.length > 0 ? token : null;
}

export async function saveDispatchToken(token: string): Promise<void> {
  await setDoc(
    doc(requireDb(), 'config', 'github'),
    { token: token.trim(), updatedAt: Date.now() },
    { merge: true },
  );
}

/** 발송 워크플로를 즉시 깨운다 — 성공하면 약 1분 안에 푸시가 나간다 */
export async function triggerAlertWorkflow(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${ALERT_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: WORKFLOW_BRANCH }),
      },
    );
    return res.status === 204;
  } catch {
    return false;
  }
}
