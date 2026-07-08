import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Firestore,
  initializeFirestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { firebaseConfig } from './firebaseConfig';

/** Firebase 설정 여부 — false면 앱 전체가 번들 샘플 데이터(데모 모드)로 동작 */
export const firebaseEnabled = firebaseConfig != null;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

function ensureApp(): FirebaseApp | null {
  if (!firebaseConfig) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
  }
  return app;
}

export function getDb(): Firestore | null {
  const a = ensureApp();
  if (!a) return null;
  if (!db) {
    // RN(특히 Android 에뮬레이터)에서 WebChannel이 막히는 경우가 있어 자동 감지 롱폴링 사용
    db = initializeFirestore(a, {
      experimentalAutoDetectLongPolling: Platform.OS !== 'web',
    });
  }
  return db;
}

/**
 * 익명 로그인 보장 — Firestore 보안 규칙이 request.auth != null 을 요구하므로
 * 앱 시작 시 한 번 호출한다. 실패해도 앱은 읽기 전용 샘플 모드로 동작한다.
 */
export async function ensureAnonymousAuth(): Promise<string | null> {
  const a = ensureApp();
  if (!a) return null;
  try {
    if (!auth) auth = getAuth(a);
    if (auth.currentUser) return auth.currentUser.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (e) {
    console.warn('[firebase] anonymous sign-in failed:', e);
    return null;
  }
}

/** 관리자(교역자) 이메일 로그인 */
export function getAuthOrNull(): Auth | null {
  const a = ensureApp();
  if (!a) return null;
  if (!auth) auth = getAuth(a);
  return auth;
}

export async function adminSignIn(email: string, password: string): Promise<void> {
  const au = getAuthOrNull();
  if (!au) throw new Error('Firebase가 설정되지 않았습니다.');
  await signInWithEmailAndPassword(au, email.trim(), password);
}

export async function adminSignOut(): Promise<void> {
  const au = getAuthOrNull();
  if (au) await signOut(au);
  // 일반 사용자 기능(기도요청)을 위해 익명 세션 복구
  await ensureAnonymousAuth();
}

/** 로그인 상태 구독 — 해제 함수 반환 */
export function watchUser(cb: (user: User | null) => void): () => void {
  const au = getAuthOrNull();
  if (!au) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(au, cb);
}
