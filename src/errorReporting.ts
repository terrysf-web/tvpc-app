import { useEffect } from 'react';
import { Platform } from 'react-native';
import { logClientError } from './data/errorLog';

/**
 * 앱 어디서든 잡히지 않은 예외·처리 안 된 Promise 거부를 관리자 화면 '오류'
 * 탭으로 보낸다 — 화면에 이상한 게 보여도 사용자가 알려주기 전에 먼저 알 수
 * 있게(방금 알림 설정 화면에 Firestore 원본 에러가 그대로 뜬 일이 계기).
 */
export function useErrorReporting() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onError = (event: ErrorEvent) => {
      logClientError(event.message || '알 수 없는 오류', {
        stack: event.error instanceof Error ? event.error.stack : undefined,
        path: window.location.pathname,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      logClientError(`(처리 안 된 Promise) ${message}`, {
        stack: reason instanceof Error ? reason.stack : undefined,
        path: window.location.pathname,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
}
