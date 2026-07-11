import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ensureAnonymousAuth, getAuthOrNull, getDb } from './firebase';

/**
 * FCM 웹 푸시 공개 키(VAPID) — Firebase 콘솔 → 프로젝트 설정 → 클라우드 메시징
 * → 웹 푸시 인증서에서 발급. 비어 있으면 알림 UI가 표시되지 않는다.
 */
export const VAPID_KEY =
  'BGG5Pv_FMPZ58eN27fOxJeP-1UsCHYuEx3We8l1m02Kuai-ddWgDOn2WHOx3AFGRKbatytpcir0hoennQUIetlE';

export const pushConfigured = VAPID_KEY.length > 0;

const SAVED_KEY = 'tvpc.pushToken';

function messagingOrNull() {
  const au = getAuthOrNull();
  return au ? getMessaging(au.app) : null;
}

/**
 * 데일리브레드(오늘의 말씀) 푸시 알림 on/off 훅.
 * 켜면 브라우저 알림 권한을 받고 FCM 토큰을 Firestore pushTokens에 등록,
 * 매일 아침 GitHub Actions가 그날 말씀을 이 토큰들로 발송한다.
 */
export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !pushConfigured) return;
    isSupported()
      .then((ok) => {
        setSupported(ok);
        if (ok) setEnabled(!!localStorage.getItem(SAVED_KEY));
      })
      .catch(() => setSupported(false));
  }, []);

  const toggle = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const db = getDb();
      const messaging = messagingOrNull();
      if (!db || !messaging) throw new Error('Firebase가 설정되지 않았습니다.');

      if (enabled) {
        const saved = localStorage.getItem(SAVED_KEY);
        await deleteToken(messaging).catch(() => {});
        if (saved) await deleteDoc(doc(db, 'pushTokens', saved)).catch(() => {});
        localStorage.removeItem(SAVED_KEY);
        setEnabled(false);
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        throw new Error('알림 권한이 거부됐습니다. 브라우저 설정에서 허용해 주세요.');
      }
      const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: reg,
      });
      if (!token) throw new Error('알림 토큰을 발급받지 못했습니다.');
      const uid = await ensureAnonymousAuth();
      if (!uid) throw new Error('로그인 세션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      await setDoc(doc(db, 'pushTokens', token), {
        createdAt: Date.now(),
        ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 150) : '',
      });
      localStorage.setItem(SAVED_KEY, token);
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알림 설정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  return { supported: supported && pushConfigured, enabled, busy, error, toggle };
}
