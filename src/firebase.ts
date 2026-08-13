import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Analytics,
  getAnalytics,
  isSupported as analyticsSupported,
  logEvent,
} from 'firebase/analytics';
import {
  Auth,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
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
let analyticsPromise: Promise<Analytics | null> | null = null;

function ensureApp(): FirebaseApp | null {
  if (!firebaseConfig) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
  }
  return app;
}

/**
 * 구글 애널리틱스(GA4) — "지금 몇 명이 접속했는지"는 여기서 확인한다
 * (analytics.google.com → 실시간). firebaseConfig에 measurementId가
 * 있어야 켜진다(Firebase 콘솔 → 프로젝트 설정 → 통합 → Google 애널리틱스
 * 연결 후 얻는 값 — src/firebaseConfig.ts 주석 참고). 웹에서만 동작한다.
 */
function ensureAnalytics(): Promise<Analytics | null> {
  if (analyticsPromise) return analyticsPromise;
  analyticsPromise = (async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    const a = ensureApp();
    if (!a || !firebaseConfig?.measurementId) return null;
    try {
      const ok = await analyticsSupported();
      return ok ? getAnalytics(a) : null;
    } catch {
      return null;
    }
  })();
  return analyticsPromise;
}

/** 화면 하나를 봤다고 기록 — 애널리틱스 "실시간" 리포트의 화면별 집계 근거가 된다 */
export function logPageView(path: string) {
  ensureAnalytics().then((an) => {
    if (!an) return;
    logEvent(an, 'page_view', {
      page_path: path,
      page_location: typeof window !== 'undefined' ? window.location.href : path,
    });
  });
}

export function getDb(): Firestore | null {
  const a = ensureApp();
  if (!a) return null;
  if (!db) {
    // 일부 네트워크(회사망·특정 통신사 등)에서 Firestore 기본 스트리밍(WebChannel)
    // 연결이 막혀 몇 십 초씩 화면이 안 뜨는 경우가 있다. 자동 감지
    // (autoDetectLongPolling)는 먼저 스트리밍 연결을 시도하고 실패를
    // 기다린 뒤에야 롱폴링으로 전환하는데, 막힌 게 아니라 그냥 느리게
    // 멎는 네트워크에서는 이 "감지 대기"만으로도 수십 초가 든다.
    // 그래서 웹은 아예 처음부터 롱폴링을 강제해 그 대기 시간을 없앤다.
    db = initializeFirestore(a, {
      experimentalForceLongPolling: Platform.OS === 'web',
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
    // 저장된 로그인(관리자 등)의 복원이 끝나기를 기다린 뒤 판단.
    // 복원 전에 익명 로그인을 하면 관리자 세션을 덮어써 로그인이 풀린다.
    await auth.authStateReady();
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

/**
 * Google 계정 로그인 — 비밀번호 없이 관리자 로그인.
 * 팝업이 막힌 환경(일부 홈 화면 앱)에서는 리디렉션 방식으로 대체한다.
 */
export async function adminGoogleSignIn(): Promise<void> {
  const au = getAuthOrNull();
  if (!au) throw new Error('Firebase가 설정되지 않았습니다.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(au, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(au, provider);
      return;
    }
    throw e;
  }
}

/** 관리자 비밀번호 변경 — 현재 비밀번호로 본인 확인 후 새 비밀번호로 교체 */
export async function changeAdminPassword(currentPw: string, newPw: string): Promise<void> {
  const au = getAuthOrNull();
  const user = au?.currentUser;
  if (!user || !user.email) throw new Error('로그인이 필요합니다.');
  const cred = EmailAuthProvider.credential(user.email, currentPw);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPw);
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
