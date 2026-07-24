import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { ensureAnonymousAuth, getDb } from '../firebase';

/**
 * 기도요청함 — 교인이 목사님께 보내는 비공개 기도요청.
 * 작성은 누구나(익명 인증), 열람·관리는 목회자만 (보안 규칙).
 * 새 요청이 저장되면 Cloud Functions가 목사님 기기로 푸시를 보낸다.
 */

export interface PrayerRequest {
  id: string;
  /** 보낸 사람 이름 — 비워두면 익명 */
  name: string;
  text: string;
  createdAt: number;
  status: 'new' | 'prayed';
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return db;
}

export async function submitPrayerRequest(name: string, text: string): Promise<void> {
  const db = requireDb();
  await ensureAnonymousAuth();
  await setDoc(doc(db, 'prayerRequests', `p-${Date.now()}`), {
    name: name.trim().slice(0, 40),
    text: text.trim().slice(0, 2000),
    createdAt: Date.now(),
    status: 'new',
  });
}

export async function getPrayerRequests(count = 100): Promise<PrayerRequest[]> {
  const snap = await getDocs(
    query(collection(requireDb(), 'prayerRequests'), orderBy('createdAt', 'desc'), fsLimit(count)),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<PrayerRequest, 'id'>), id: d.id }));
}

export async function setPrayerRequestStatus(id: string, status: 'new' | 'prayed'): Promise<void> {
  await updateDoc(doc(requireDb(), 'prayerRequests', id), { status });
}

export async function removePrayerRequest(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'prayerRequests', id));
}
