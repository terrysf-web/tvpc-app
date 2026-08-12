import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** 서비스워커가 남겨둔 값이 이보다 오래됐으면 무시(오래된 재실행 방지) */
const PENDING_NAV_MAX_AGE_MS = 10 * 60 * 1000;

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
      const req = indexedDB.open('tvpc-sw', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
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
 * 알림을 눌러서 앱이 열렸을 때 목적 화면으로 이동시킨다.
 *
 * 1) 이미 열려 있던 창이었다면 — 서비스워커가 postMessage로 보내주는
 *    경로를 받아 라우터로 옮긴다. WindowClient.navigate()만 믿으면
 *    사파리(특히 iOS 홈화면에 설치한 PWA)에서 포커스만 되고 화면은 안
 *    바뀌는 경우가 있어("눌러도 안 열린다") — 이쪽이 훨씬 확실하다.
 * 2) 앱이 완전히 닫혀 있다가 알림으로 새로 열린 거라면 — 서비스워커가
 *    IndexedDB에 남겨둔 "가려던 경로"를 앱이 뜨자마자 확인해서 옮긴다
 *    (openWindow()가 준 URL을 사파리가 무시하고 시작 화면으로 여는
 *    경우의 대비책).
 */
export function useNotificationNav() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    readAndClearPendingNav().then((path) => {
      if (path && path !== window.location.pathname) router.push(path as never);
    });

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | undefined;
      if (data?.type === 'tvpc-navigate' && data.path) {
        router.push(data.path as never);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
