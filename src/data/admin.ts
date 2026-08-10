import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { adminSignIn, adminSignOut, getDb, watchUser } from '../firebase';
import type { MemberDoc } from './member';
import type { EventDoc, NewsDoc, VerseDoc } from '../types';

/**
 * 관리자(교역자) 인증 상태.
 * 관리자 여부는 Firestore `admins/{이메일}` 문서 존재로 판별하며,
 * 실제 쓰기 권한은 보안 규칙이 강제한다 (클라이언트 표시는 편의용).
 */
export type AdminRole = 'pastor' | 'admin';

export function useAdminAuth() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // 역할: pastor(목회자) = 말씀 관리, admin(관리자) = 소식·일정 관리
  const [role, setRole] = useState<AdminRole | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = watchUser(async (user) => {
      const mail = user?.email ?? null;
      setEmail(mail);
      if (!mail) {
        setIsAdmin(false);
        setRole(null);
        setChecking(false);
        return;
      }
      try {
        const db = getDb();
        const snap = db ? await getDoc(doc(db, 'admins', mail)) : null;
        const ok = !!snap?.exists();
        setIsAdmin(ok);
        setRole(ok ? ((snap?.get('role') as string) === 'pastor' ? 'pastor' : 'admin') : null);
      } catch {
        setIsAdmin(false);
        setRole(null);
      }
      setChecking(false);
    });
    return unsub;
  }, []);

  const signIn = useCallback(async (mail: string, password: string) => {
    await adminSignIn(mail, password);
  }, []);

  const signOut = useCallback(async () => {
    await adminSignOut();
  }, []);

  return { email, isAdmin, role, checking, signIn, signOut };
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return db;
}

/** 오늘의 말씀 저장 — 문서 ID = 날짜(YYYY-MM-DD) */
export async function saveVerse(v: Omit<VerseDoc, 'id'>): Promise<void> {
  await setDoc(doc(requireDb(), 'verses', v.date), v, { merge: true });
}

/** 소식 저장 */
export async function saveNews(n: Omit<NewsDoc, 'id'>): Promise<void> {
  const id = `n-${Date.now()}`;
  await setDoc(doc(requireDb(), 'news', id), n);
}

/** 일정 저장 */
export async function saveEvent(e: Omit<EventDoc, 'id'>): Promise<void> {
  const id = `e-${Date.now()}`;
  // 목록·달력이 sortKey(YYYY-MM-DD)순으로 조회하므로 날짜 표시에서 유도해 저장
  let sortKey = e.sortKey;
  if (!sortKey) {
    const m = e.dateLabel.match(/(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    const now = new Date();
    if (m) {
      let y = now.getFullYear();
      const cand = new Date(y, Number(m[1]) - 1, Number(m[2]));
      if (cand.getTime() < now.getTime() - 180 * 86400e3) y += 1;
      sortKey = `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    } else {
      sortKey = now.toLocaleDateString('en-CA');
    }
  }
  await setDoc(doc(requireDb(), 'events', id), { ...e, sortKey });
}

/** 가입 신청(승인 대기) 교인 목록 — 관리자 전용 */
export function usePendingMembers(enabled: boolean) {
  const [rows, setRows] = useState<MemberDoc[]>([]);
  useEffect(() => {
    const db = getDb();
    if (!db || !enabled) return;
    const q = query(collection(db, 'members'), where('status', '==', 'pending'));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<MemberDoc, 'id'>), id: d.id }));
        list.sort((a, b) => a.createdAt - b.createdAt);
        setRows(list);
      },
      () => setRows([]),
    );
  }, [enabled]);
  return rows;
}

/** 승인된 교인 목록 — 관리자 전용, 리포트 제출용 명단 */
export function useApprovedMembers(enabled: boolean) {
  const [rows, setRows] = useState<MemberDoc[]>([]);
  useEffect(() => {
    const db = getDb();
    if (!db || !enabled) return;
    const q = query(collection(db, 'members'), where('status', '==', 'approved'));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<MemberDoc, 'id'>), id: d.id }));
        list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        setRows(list);
      },
      () => setRows([]),
    );
  }, [enabled]);
  return rows;
}

/** 승인 해제된 교인 목록 — 관리자 전용, 언제 해제했는지 리포트에 남기기 위함 */
export function useRevokedMembers(enabled: boolean) {
  const [rows, setRows] = useState<MemberDoc[]>([]);
  useEffect(() => {
    const db = getDb();
    if (!db || !enabled) return;
    const q = query(collection(db, 'members'), where('status', '==', 'revoked'));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as Omit<MemberDoc, 'id'>), id: d.id }));
        list.sort((a, b) => (b.revokedAt ?? 0) - (a.revokedAt ?? 0));
        setRows(list);
      },
      () => setRows([]),
    );
  }, [enabled]);
  return rows;
}

/** 교인 가입 승인 */
export async function approveMember(uid: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'members', uid), { status: 'approved' });
}

/** 교인 가입 거절 — 신청 문서 삭제 (다시 신청 가능) */
export async function rejectMember(uid: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'members', uid));
}

/** 승인 해제 — 문서는 남기고 상태만 바꿔 언제 해제했는지 기록에 남긴다 */
export async function revokeMember(uid: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'members', uid), { status: 'revoked', revokedAt: Date.now() });
}

/** 해제된 교인을 다시 승인 (실수로 해제한 경우) */
export async function reapproveMember(uid: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'members', uid), { status: 'approved', revokedAt: null });
}

/** 헌금 내역 등록 — 교인 이메일로 대상을 찾아 본인만 볼 수 있게 저장 */
export async function addOfferingRecord(input: {
  email: string;
  item: string;
  date: string;
  amount: string;
}): Promise<string> {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, 'members'), where('email', '==', input.email.trim().toLowerCase())),
  );
  if (snap.empty) throw new Error('해당 이메일로 가입한 교인이 없습니다.');
  const memberDoc = snap.docs[0];
  await addDoc(collection(db, 'offeringRecords'), {
    uid: memberDoc.id,
    email: input.email.trim().toLowerCase(),
    item: input.item.trim(),
    date: input.date.trim(),
    amount: input.amount.trim(),
    createdAt: Date.now(),
  });
  return (memberDoc.data() as { name?: string }).name ?? input.email;
}

/**
 * 본문 텍스트를 절 배열로 변환.
 * "1 여호와는 나의 목자시니..." 형식이면 절 번호를 읽고,
 * 번호가 없으면 줄 순서대로 번호를 붙인다.
 */
export function parsePassage(text: string): { verse: number; text: string }[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const m = line.match(/^(\d+)[.)]?\s+(.*)$/);
      return m ? { verse: Number(m[1]), text: m[2] } : { verse: i + 1, text: line };
    });
}
