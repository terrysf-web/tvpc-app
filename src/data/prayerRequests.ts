import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { ensureAnonymousAuth, getDb } from '../firebase';
import { savedPushToken } from '../push';

/**
 * 기도요청함 — 교인이 목사님께 보내는 비공개 기도요청.
 * 작성은 누구나(익명 인증), 열람·관리는 목회자만 (보안 규칙).
 * 새 요청이 저장되면 Cloud Functions가 목사님 기기로 푸시를 보낸다.
 */

export interface PrayerRequest {
  id: string;
  /** 보낸 사람 이름 — 새 요청은 필수(pray-request.tsx에서 검증), 예전 요청 중엔 빈 값(익명)도 있다 */
  name: string;
  text: string;
  createdAt: number;
  status: 'new' | 'prayed';
  /** 목사님이 '기도 시작했어요'를 누른 때 */
  prayedAt?: number | null;
  /** 보낸 분이 나중에 전해온 응답 나눔 */
  answer?: string | null;
  answeredAt?: number | null;
}

/** 이 기기에서 보낸 기도 — 보낸 분에게만 보이는 내 기록 */
export interface MyPrayer {
  id: string;
  name: string;
  text: string;
  createdAt: number;
  status: 'new' | 'prayed';
  prayedAt: number | null;
  answer: string | null;
  answeredAt: number | null;
}

const MINE_KEY = 'tvpc.myPrayers';

function readMine(): MyPrayer[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(MINE_KEY);
    return raw ? (JSON.parse(raw) as MyPrayer[]) : [];
  } catch {
    return [];
  }
}

function writeMine(list: MyPrayer[]) {
  try {
    localStorage?.setItem(MINE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* 저장 못 해도 보내기는 정상 동작한다 */
  }
}

/** 이 기기에서 보낸 기도 목록 (최근 것부터) */
export function getMyPrayers(): MyPrayer[] {
  return readMine().sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 목사님이 기도를 시작하셨는지 확인해 내 기록을 새로 맞춘다.
 * 요청 문서는 아이디를 아는 사람만 읽을 수 있고, 아이디는 보낸 기기에만 있다.
 */
export async function refreshMyPrayers(): Promise<MyPrayer[]> {
  const mine = readMine();
  const db = getDb();
  if (!db || mine.length === 0) return getMyPrayers();
  try {
    await ensureAnonymousAuth();
    const updated = await Promise.all(
      mine.map(async (m) => {
        if (m.status === 'prayed' && m.answer) return m;
        try {
          const snap = await getDoc(doc(db, 'prayerRequests', m.id));
          if (!snap.exists()) return m;
          const status = (snap.get('status') as MyPrayer['status']) ?? 'new';
          const prayedAt = (snap.get('prayedAt') as number | null) ?? null;
          const answer = (snap.get('answer') as string | null) ?? null;
          const answeredAt = (snap.get('answeredAt') as number | null) ?? null;
          return { ...m, status, prayedAt, answer, answeredAt };
        } catch {
          return m;
        }
      }),
    );
    writeMine(updated);
  } catch {
    /* 오프라인 — 지난번에 본 상태 그대로 */
  }
  return getMyPrayers();
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return db;
}

export async function submitPrayerRequest(name: string, text: string): Promise<string> {
  const db = requireDb();
  await ensureAnonymousAuth();
  // 아이디는 보낸 기기만 알고 있어야 하므로 짐작할 수 없게 만든다
  const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const cleanName = name.trim().slice(0, 40);
  const cleanText = text.trim().slice(0, 2000);
  const createdAt = Date.now();
  await setDoc(doc(db, 'prayerRequests', id), {
    name: cleanName,
    text: cleanText,
    createdAt,
    status: 'new',
    prayedAt: null,
    // 목사님이 기도를 시작하시면 이 기기 한 대에만 알림을 보내기 위한 주소.
    // 알림을 켜지 않았으면 비어 있고, 그래도 앱 안에서는 상태로 확인할 수 있다.
    deviceToken: savedPushToken(),
  });
  writeMine([
    {
      id,
      name: cleanName,
      text: cleanText,
      createdAt,
      status: 'new',
      prayedAt: null,
      answer: null,
      answeredAt: null,
    },
    ...readMine(),
  ]);
  return id;
}

/**
 * 응답 나눔 — 보낸 분이 나중에 "이렇게 응답받았습니다"를 원래 기도에 이어 붙인다.
 * 요청 아이디는 보낸 기기에만 있으므로 자기 기도에만 적을 수 있다.
 */
export async function submitPrayerAnswer(id: string, text: string): Promise<void> {
  const db = requireDb();
  await ensureAnonymousAuth();
  const answer = text.trim().slice(0, 2000);
  const answeredAt = Date.now();
  await updateDoc(doc(db, 'prayerRequests', id), { answer, answeredAt });
  writeMine(readMine().map((m) => (m.id === id ? { ...m, answer, answeredAt } : m)));
}

export async function getPrayerRequests(count = 100): Promise<PrayerRequest[]> {
  const snap = await getDocs(
    query(collection(requireDb(), 'prayerRequests'), orderBy('createdAt', 'desc'), fsLimit(count)),
  );
  return snap.docs.map((d) => ({ ...(d.data() as Omit<PrayerRequest, 'id'>), id: d.id }));
}

export async function setPrayerRequestStatus(id: string, status: 'new' | 'prayed'): Promise<void> {
  await updateDoc(doc(requireDb(), 'prayerRequests', id), {
    status,
    prayedAt: status === 'prayed' ? Date.now() : null,
  });
}

export async function removePrayerRequest(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'prayerRequests', id));
}
