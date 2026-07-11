import { createUserWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
  adminSignIn,
  adminSignOut,
  firebaseEnabled,
  getAuthOrNull,
  getDb,
  watchUser,
} from '../firebase';

/** 교인 프로필 — members/{uid}. 승인된 교인의 정보가 곧 교회 주소록이 된다 */
export interface MemberDoc {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  status: 'pending' | 'approved';
  createdAt: number;
}

export type MemberState =
  | 'loading' // 확인 중
  | 'none' // 로그인 안 함(또는 익명)
  | 'pending' // 가입 신청, 승인 대기
  | 'approved'; // 승인된 교인

/**
 * 교인 인증 상태 훅.
 * 회원가입 → members/{uid} 문서가 pending으로 생성 → 관리자 승인 후 approved.
 * 주소록·헌금 내역·기도요청은 approved 교인만 이용한다(보안 규칙 강제).
 */
export function useMember() {
  const [state, setState] = useState<MemberState>(firebaseEnabled ? 'loading' : 'none');
  const [member, setMember] = useState<MemberDoc | null>(null);

  useEffect(() => {
    if (!firebaseEnabled) return;
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = watchUser((user) => {
      unsubDoc?.();
      unsubDoc = undefined;
      // 익명 세션(일반 열람용)은 로그인으로 치지 않는다
      if (!user || user.isAnonymous || !user.email) {
        setMember(null);
        setState('none');
        return;
      }
      const db = getDb();
      if (!db) {
        setState('none');
        return;
      }
      unsubDoc = onSnapshot(
        doc(db, 'members', user.uid),
        (snap) => {
          if (!snap.exists()) {
            setMember(null);
            setState('none');
            return;
          }
          const m = { ...(snap.data() as Omit<MemberDoc, 'id'>), id: snap.id };
          setMember(m);
          setState(m.status === 'approved' ? 'approved' : 'pending');
        },
        () => setState('none'),
      );
    });
    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  const signUp = useCallback(
    async (input: { name: string; phone: string; address: string; email: string; password: string }) => {
      const auth = getAuthOrNull();
      const db = getDb();
      if (!auth || !db) throw new Error('Firebase가 설정되지 않았습니다.');
      const cred = await createUserWithEmailAndPassword(
        auth,
        input.email.trim(),
        input.password,
      );
      await setDoc(doc(db, 'members', cred.user.uid), {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        address: input.address.trim(),
        status: 'pending',
        createdAt: Date.now(),
      });
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    await adminSignIn(email, password); // 이메일/비밀번호 로그인 (교인·교역자 공용)
  }, []);

  const signOut = useCallback(async () => {
    await adminSignOut(); // 로그아웃 후 익명 세션 복구
  }, []);

  const updateProfile = useCallback(
    async (patch: { name?: string; phone?: string; address?: string }) => {
      const db = getDb();
      if (!db || !member) throw new Error('로그인이 필요합니다.');
      await updateDoc(doc(db, 'members', member.id), patch);
    },
    [member],
  );

  return { state, member, signUp, signIn, signOut, updateProfile };
}

/** 교회 주소록 — 승인된 교인 목록 (승인 교인만 읽을 수 있음) */
export function useDirectory(enabled: boolean) {
  const [rows, setRows] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getDb();
    if (!db || !enabled) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'members'), where('status', '==', 'approved'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ ...(d.data() as Omit<MemberDoc, 'id'>), id: d.id }),
        );
        list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [enabled]);

  return { rows, loading };
}

/** 내 헌금 내역 — offeringRecords에서 내 uid 문서만 (규칙이 본인 것만 허용) */
export interface OfferingRecordDoc {
  id: string;
  uid: string;
  item: string;
  /** YYYY-MM-DD */
  date: string;
  amount: string;
}

export function useMyOfferings(uid: string | null) {
  const [rows, setRows] = useState<OfferingRecordDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getDb();
    if (!db || !uid) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'offeringRecords'), where('uid', '==', uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ ...(d.data() as Omit<OfferingRecordDoc, 'id'>), id: d.id }),
        );
        list.sort((a, b) => (a.date < b.date ? 1 : -1));
        setRows(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid]);

  return { rows, loading };
}
