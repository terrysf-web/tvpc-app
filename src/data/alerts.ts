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
 * alerts 문서가 생기는 순간 Cloud Functions(functions/index.js)가 몇 초 안에
 * 발송한다. 함수가 동작하지 않는 경우에도 GitHub 예비 실행(send-alert.yml,
 * 5분 간격)이 남은 대기 알림을 발송한다 — 두 경로는 잠금으로 중복이 방지된다.
 */

export interface AlertDoc {
  id: string;
  title: string;
  body: string;
  status: 'pending' | 'sending' | 'sent' | 'expired';
  createdAt: number;
  sentAt?: number;
  sentCount?: number;
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return db;
}

/** 긴급 알림 등록 — 저장되는 순간 서버가 자동 발송한다 */
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

export interface PushDevice {
  id: string;
  /** 교인 가입이 된 기기의 이름 (미가입이면 null) */
  name: string | null;
  email: string | null;
  ua: string;
  createdAt: number;
}

/** 알림을 켠 기기 목록 — 관리자만 조회 가능 (보안 규칙) */
export async function getPushDevices(): Promise<PushDevice[]> {
  const snap = await getDocs(collection(requireDb(), 'pushTokens'));
  const rows = snap.docs.map((d) => ({
    id: d.id,
    name: (d.get('name') as string | undefined) ?? null,
    email: (d.get('email') as string | undefined) ?? null,
    ua: (d.get('ua') as string | undefined) ?? '',
    createdAt: Number(d.get('createdAt') ?? 0),
  }));
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

/** 기기 종류 표시용 — 브라우저 정보(ua)에서 기종을 추린다 */
export function deviceKind(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return '아이폰';
  if (/Android/i.test(ua)) return '안드로이드';
  return '컴퓨터';
}
