/**
 * 홈 화면에 추가(앱처럼 설치) 안내.
 *
 * 이 앱은 웹으로 열리지만 홈 화면에 추가하면 아이콘으로 바로 열리고
 * 주소창이 사라져 앱처럼 쓸 수 있다. 처음 여신 분께 그 방법을 한 번
 * 알려드리기 위한 도우미들.
 */
import { Platform } from 'react-native';

const SEEN_KEY = 'installGuideSeen';
const COUNT_KEY = 'installGuideShown';
const SESSION_KEY = 'installGuideLater';
/** 자동으로 올라오는 횟수 — 이만큼 지나면 더는 먼저 말을 걸지 않는다 */
const MAX_AUTO_SHOWS = 3;

/** 이미 홈 화면 앱으로 열었는가 */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true
  );
}

/** 안내 문구를 고르기 위한 기기 구분 */
export function deviceKind(): 'ios' | 'android' | 'desktop' {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent ?? '';
  // 아이패드는 최근 기종에서 맥과 같은 UA를 쓴다 — 손가락 터치 여부로 가린다
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** '다시 보지 않기'를 누르셨는지 */
export function guideSeen(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** 다시 보지 않기 — 이 기기에서는 다시 올라오지 않는다 */
export function markGuideSeen() {
  try {
    localStorage?.setItem(SEEN_KEY, '1');
  } catch {
    /* 저장 못 해도 그만 — 이번 방문에는 닫힌다 */
  }
}

/** 그냥 닫기 — 이번에는 접어두고, 다음에 앱을 새로 열면 한 번 더 보여드린다 */
export function dismissForNow() {
  try {
    sessionStorage?.setItem(SESSION_KEY, '1');
  } catch {
    /* 무시 */
  }
}

function dismissedThisSession(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function autoShowCount(): number {
  try {
    return Number(localStorage?.getItem(COUNT_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

/** 자동으로 한 번 보여드렸음을 기록 */
export function noteAutoShown() {
  try {
    localStorage?.setItem(COUNT_KEY, String(autoShowCount() + 1));
  } catch {
    /* 무시 */
  }
}

// ── 안드로이드·크롬의 '설치' 제안 잡아두기 ──────────────────────
// 브라우저가 설치를 제안할 준비가 되면 beforeinstallprompt가 한 번 오는데,
// 그 자리에서 쓰지 않으면 사라진다. 붙잡아 두었다가 버튼을 누를 때 쓴다.
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const f of listeners) f();
};

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    markGuideSeen();
    notify();
  });
}

export function canInstallDirectly(): boolean {
  return deferred != null;
}

/** 브라우저의 설치 창을 띄운다 — 실제로 설치되면 true */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  notify();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

// ── 안내창 열기/닫기 ───────────────────────────────────────────
let openRequests = 0;
export function openInstallGuide() {
  openRequests += 1;
  notify();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function snapshot(): string {
  return `${openRequests}:${deferred != null}`;
}

/**
 * 처음 여신 분께 자동으로 보여드릴지.
 * 홈 화면 앱으로 이미 열었거나, 컴퓨터이거나, '다시 보지 않기'를 누르셨거나,
 * 이번에 이미 닫으셨거나, 세 번 보여드린 뒤에는 먼저 말을 걸지 않는다.
 * (그 뒤에도 '더보기 › 홈 화면에 추가'에서 언제든 다시 볼 수 있다)
 */
export function shouldAutoShow(): boolean {
  return (
    Platform.OS === 'web' &&
    !isStandalone() &&
    deviceKind() !== 'desktop' &&
    !guideSeen() &&
    !dismissedThisSession() &&
    autoShowCount() < MAX_AUTO_SHOWS
  );
}
