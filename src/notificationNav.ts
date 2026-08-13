import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** 서비스워커가 남겨둔 값이 이보다 오래됐으면 무시(오래된 재실행 방지) */
const PENDING_NAV_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * 앱을 새로 열었을 때도(며칠 뒤 다시 열어도) 하던 자리 그대로 있어야
 * 맞는 화면 — 성경 읽던 자리·주보 괄호 채우던 자리는 시간이 얼마나
 * 지났든 이어서 하는 게 자연스럽다. 그 외 화면(관리자·소식 등)에
 * 머물다가 새로 열렸을 때는 오히려 헷갈린다는 의견을 반영해 홈으로
 * 보낸다.
 */
const ALWAYS_RESUME_PATHS = ['/word', '/bulletin'];

/** 같은 브라우저 세션(탭)인지 표시 — 새로고침(같은 세션)에는 안 적용,
 * 완전히 새로 켤 때(세션 자체가 새로 시작)만 아래 홈 이동 규칙을 적용 */
const SESSION_BOOTED_KEY = 'tvpc.booted';

/**
 * 서비스워커(public/firebase-messaging-sw.js)가 IndexedDB(tvpc-sw/kv,
 * 키 pendingNav)에 남겨둔 "가려던 경로"를 읽어온다 — 앱이 완전히 닫혀
 * 있던 상태에서 알림을 눌러 새로 열렸을 때(iOS 잠금화면 등), 사파리가
 * openWindow()에 준 URL을 무시하고 그냥 시작 화면으로 여는 경우가 있어
 * 그 대비책이다. 있으면 지운다(한 번만 쓰고 버림).
 */
function readAndClearPendingNav(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      // tvpc-sw DB v2 — kv(가려던 경로 등) + notifHistory(받은 알림 기록,
      // src/notifHistory.ts). 서비스워커가 이미 v2로 올려둬서, 여기서 계속
      // v1로 열면 VersionError로 조용히 실패해 가려던 경로를 영영 못 읽는다
      // — 버전은 반드시 세 곳(여기·notifHistory.ts·서비스워커) 다 같아야 한다.
      const req = indexedDB.open('tvpc-sw', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('notifHistory')) {
          db.createObjectStore('notifHistory', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) {
          resolve(null);
          return;
        }
        const tx = db.transaction('kv', 'readwrite');
        const getReq = tx.objectStore('kv').get('pendingNav');
        getReq.onsuccess = () => {
          const val = getReq.result as { path?: string; ts?: number } | undefined;
          tx.objectStore('kv').delete('pendingNav');
          if (val?.path && val.ts && Date.now() - val.ts < PENDING_NAV_MAX_AGE_MS) {
            resolve(val.path);
          } else {
            resolve(null);
          }
        };
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * 알림으로 온 게 아니라면(그냥 브라우저/OS가 마지막 화면을 되살린 것뿐
 * 이라면) 새 세션에서 홈이 아닌 화면, 그중에서도 ALWAYS_RESUME_PATHS에
 * 없는 화면으로 열렸을 때만 홈으로 보낸다. 알림을 눌러서 열린 경우는
 * checkPendingNav 쪽에서 이미 처리했으니 이 규칙을 적용하지 않는다
 * (그래서 이 함수는 pendingNav 확인이 끝난 뒤에만 부른다).
 */
function applyResumeGuard(router: ReturnType<typeof useRouter>) {
  if (typeof sessionStorage === 'undefined') return;
  const alreadyBooted = sessionStorage.getItem(SESSION_BOOTED_KEY) === '1';
  sessionStorage.setItem(SESSION_BOOTED_KEY, '1');
  if (alreadyBooted) return; // 같은 세션 안의 새로고침 — 하던 화면 그대로 둔다

  const path = window.location.pathname;
  if (path !== '/' && !ALWAYS_RESUME_PATHS.includes(path)) {
    router.replace('/');
  }
}

/**
 * 알림을 눌러서 앱이 열렸을 때 목적 화면으로 이동시킨다. 알림이 아니라면
 * 새로 켠 세션인지 보고 홈으로 보낼지 판단한다(applyResumeGuard).
 *
 * 1) 이미 열려 있던 창이었다면 — 서비스워커가 postMessage로 보내주는
 *    경로를 받아 라우터로 옮긴다. WindowClient.navigate()만 믿으면
 *    사파리(특히 iOS 홈화면에 설치한 PWA)에서 포커스만 되고 화면은 안
 *    바뀌는 경우가 있어("눌러도 안 열린다") — 이쪽이 훨씬 확실하다.
 * 2) 앱이 완전히 닫혀 있다가 알림으로 새로 열린 거라면 — 서비스워커가
 *    IndexedDB에 남겨둔 "가려던 경로"를 앱이 뜨자마자 확인해서 옮긴다
 *    (openWindow()가 준 URL을 사파리가 무시하고 시작 화면으로 여는
 *    경우의 대비책).
 * 3) 앱이 완전히 닫힌 것도, 멀쩡히 떠 있던 것도 아닌 애매한 상태 —
 *    한참 백그라운드에 있다가(iOS가 화면은 꺼두고 멈춰만 둔 상태)
 *    알림을 눌러 되살아난 경우 — 도 있다. 이때는 서비스워커가 매칭되는
 *    창을 찾아 postMessage를 보내긴 하지만, 멈춰 있던 페이지가 완전히
 *    되살아나기 전에 메시지가 씹혀 화면이 안 바뀌는 경우가 있었다
 *    ("눌렀는데 마지막에 보던 화면 그대로"). postMessage 하나만 믿지
 *    않고, 화면이 다시 보이는 시점(visibilitychange·focus)마다 2)의
 *    "가려던 경로"를 한 번 더 확인해서 옮긴다 — 이미 다 옮겨간
 *    뒤라면(현재 경로와 같으면) 아무 일도 안 한다.
 */
export function useNotificationNav() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.serviceWorker) {
      // 알림 기능이 아예 안 되는 환경이어도 홈 이동 규칙은 그대로 적용
      if (Platform.OS === 'web') applyResumeGuard(router);
      return;
    }

    // 부팅 시 한 번 — 알림을 눌러 연 거라면 그 경로로, 아니라면 홈으로
    // 보낼지 판단한다(순서가 중요 — pendingNav 확인이 끝난 뒤에만
    // applyResumeGuard를 불러야 알림으로 연 화면을 홈으로 되돌리지 않는다).
    readAndClearPendingNav().then((path) => {
      if (path) {
        if (path !== window.location.pathname) router.push(path as never);
        return;
      }
      applyResumeGuard(router);
    });

    const checkPendingNav = () => {
      readAndClearPendingNav().then((path) => {
        if (path && path !== window.location.pathname) router.push(path as never);
      });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkPendingNav();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkPendingNav);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | undefined;
      if (data?.type === 'tvpc-navigate' && data.path) {
        router.push(data.path as never);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkPendingNav);
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
