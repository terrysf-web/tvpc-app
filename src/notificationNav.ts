import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * 알림을 눌러서 앱이 열렸을 때(이미 열려 있던 창인 경우) 서비스워커
 * (public/firebase-messaging-sw.js)가 postMessage로 보내주는 이동 경로를
 * 받아 라우터로 옮긴다.
 *
 * WindowClient.navigate()만 믿으면 사파리(특히 iOS 홈화면에 설치한 PWA)에서
 * 포커스만 되고 화면은 안 바뀌는 경우가 있어("눌러도 안 열린다") — 이 안에서
 * router.push로 직접 이동시키는 쪽이 훨씬 확실하다.
 */
export function useNotificationNav() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | undefined;
      if (data?.type === 'tvpc-navigate' && data.path) {
        router.push(data.path as never);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);
}
