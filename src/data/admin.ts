import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { adminSignIn, adminSignOut, getDb, watchUser } from '../firebase';
import type { EventDoc, NewsDoc, VerseDoc } from '../types';

/**
 * 관리자(교역자) 인증 상태.
 * 관리자 여부는 Firestore `admins/{이메일}` 문서 존재로 판별하며,
 * 실제 쓰기 권한은 보안 규칙이 강제한다 (클라이언트 표시는 편의용).
 */
export function useAdminAuth() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = watchUser(async (user) => {
      const mail = user?.email ?? null;
      setEmail(mail);
      if (!mail) {
        setIsAdmin(false);
        setChecking(false);
        return;
      }
      try {
        const db = getDb();
        const snap = db ? await getDoc(doc(db, 'admins', mail)) : null;
        setIsAdmin(!!snap?.exists());
      } catch {
        setIsAdmin(false);
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

  return { email, isAdmin, checking, signIn, signOut };
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
  await setDoc(doc(requireDb(), 'events', id), e);
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
