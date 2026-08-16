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
      // "Script error."(스택·상세 없음)는 크로스오리진 스크립트(광고·분석
      // 스크립트 등)에서 난 에러라 브라우저가 보안상 내용을 감춘 것 —
      // 우리 코드가 아니라 원인을 알아낼 수도, 고칠 수도 없어 기록해도
      // 소용없다(오류 탭만 채운다).
      if (event.message === 'Script error.' && !(event.error instanceof Error)) return;
      logClientError(event.message || '알 수 없는 오류', {
        stack: event.error instanceof Error ? event.error.stack : undefined,
        path: window.location.pathname,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      // Firebase Auth의 내부 IndexedDB 저장소가 던지는 알려진 에러 — 특히
      // iOS Safari에서 앱을 백그라운드에 오래 뒀다 돌아오면 브라우저가
      // 조용히 그 연결을 닫아버리는데, Firebase SDK 내부 코드라 우리가
      // 잡거나 고칠 수 없다. SDK가 알아서 재시도해 실제로는 티 안 나게
      // 복구되므로, 기록만 남겨 오류 탭을 채우지 않는다.
      if (/database connection is closing/i.test(message)) return;
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
