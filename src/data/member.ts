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
import { adminSignOut, firebaseEnabled, getAuthOrNull, getDb, watchUser } from '../firebase';

/** 교인 프로필 — members/{uid}. 승인된 교인의 정보가 곧 교회 주소록이 된다 */
export interface MemberDoc {
  id: string;
  name: string;
  email: string;
  /** 기존 교인인지, 새로 가입하는(처음 오신) 분인지 */
  memberType: 'existing' | 'new';
  /** 새로 가입하는 분의 자기소개 — 기존 교인은 비워 둠 */
  bio: string;
  status: 'pending' | 'approved' | 'revoked';
  createdAt: number;
  /** 승인 해제된 시각 — 언제 해제했는지 리포트에 남기기 위함 */
  revokedAt?: number;
}

export type MemberState =
  | 'loading' // 확인 중
  | 'none' // 로그인 안 함(또는 익명)
  | 'noProfile' // 계정 로그인은 됐지만 교인 정보 미등록 (기존 관리자 계정 등)
  | 'pending' // 가입 신청, 승인 대기
  | 'approved' // 승인된 교인
  | 'revoked'; // 승인이 해제된 교인

/**
 * 교인 인증 상태 훅. 로그인은 Google 계정으로만(이메일/비밀번호 없음) —
 * 로그인 후 members/{uid} 문서가 없으면 이름·교인구분·자기소개만 받아
 * pending으로 등록 → 관리자 승인 후 approved.
 * 교우 앨범·주소록·헌금 내역·기도요청은 approved 교인만 이용한다(보안 규칙 강제).
 */
export function useMember() {
  const [state, setState] = useState<MemberState>(firebaseEnabled ? 'loading' : 'none');
  const [member, setMember] = useState<MemberDoc | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseEnabled) return;
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = watchUser((user) => {
      unsubDoc?.();
      unsubDoc = undefined;
      // 익명 세션(일반 열람용)은 로그인으로 치지 않는다
      if (!user || user.isAnonymous || !user.email) {
        setMember(null);
        setAuthEmail(null);
        setState('none');
        return;
      }
      setAuthEmail(user.email);
      const db = getDb();
      if (!db) {
        setState('none');
        return;
      }
      unsubDoc = onSnapshot(
        doc(db, 'members', user.uid),
        (snap) => {
          if (!snap.exists()) {
            // 계정은 있지만 교인 정보가 없음 → 정보 등록 유도
            setMember(null);
            setState('noProfile');
            return;
          }
          const m = { ...(snap.data() as Omit<MemberDoc, 'id'>), id: snap.id };
          setMember(m);
          setState(m.status === 'approved' ? 'approved' : m.status === 'revoked' ? 'revoked' : 'pending');
        },
        () => setState('none'),
      );
    });
    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  /** Google 로그인은 됐지만 아직 교인 정보가 없을 때(첫 로그인) 가입 신청 */
  const createProfile = useCallback(
    async (input: { name: string; memberType: 'existing' | 'new'; bio: string }) => {
      const auth = getAuthOrNull();
      const db = getDb();
      const user = auth?.currentUser;
      if (!db || !user || !user.email) throw new Error('로그인이 필요합니다.');
      await setDoc(doc(db, 'members', user.uid), {
        name: input.name.trim(),
        email: user.email.toLowerCase(),
        memberType: input.memberType,
        bio: input.memberType === 'new' ? input.bio.trim() : '',
        status: 'pending',
        createdAt: Date.now(),
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    await adminSignOut(); // 로그아웃 후 익명 세션 복구
  }, []);

  const updateProfile = useCallback(
    async (patch: { name?: string; memberType?: 'existing' | 'new'; bio?: string }) => {
      const db = getDb();
      if (!db || !member) throw new Error('로그인이 필요합니다.');
      await updateDoc(doc(db, 'members', member.id), patch);
    },
    [member],
  );

  return { state, member, authEmail, signOut, updateProfile, createProfile };
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
