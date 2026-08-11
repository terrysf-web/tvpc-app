import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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

/**
 * 선택 가능한 알림 종류 — 긴급 공지는 여기 없다(끄고 켜는 게 아니라, 알림을
 * 켠 모든 기기에 무조건 감. sendAlert 함수·send-alert.mjs 참고).
 * 새 알림 종류가 생기면 여기 한 줄만 추가하면 설정 화면에 바로 나타난다.
 */
export const NOTIFICATION_TOPICS = [
  { key: 'verse', label: '오늘의 말씀' },
  { key: 'gratitude', label: '감사일기' },
] as const;
export type NotificationTopicKey = (typeof NOTIFICATION_TOPICS)[number]['key'];
// 감사일기는 기본값 off — 원하는 사람만 알림 설정에서 직접 켠다.
const DEFAULT_TOPICS: NotificationTopicKey[] = ['verse'];

const SAVED_KEY = 'tvpc.pushToken';

/** 이 기기의 알림 주소 — 알림을 켜지 않았으면 null */
export function savedPushToken(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(SAVED_KEY);
  } catch {
    return null;
  }
}

function messagingOrNull() {
  const au = getAuthOrNull();
  return au ? getMessaging(au.app) : null;
}

/**
 * 푸시 알림 on/off + 알림 종류별 선택 훅.
 * 켜면 브라우저 알림 권한을 받고 FCM 토큰을 Firestore pushTokens에 등록한다.
 * 긴급 공지는 이 등록만으로 무조건 받고(선택 불가), 그 외 알림 종류(오늘의
 * 말씀 등, NOTIFICATION_TOPICS)는 topics 배열로 따로 켜고 끌 수 있다.
 */
export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<Set<NotificationTopicKey>>(new Set());
  const [topicBusy, setTopicBusy] = useState<NotificationTopicKey | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !pushConfigured) return;
    isSupported()
      .then(async (ok) => {
        setSupported(ok);
        if (!ok) return;
        const saved = localStorage.getItem(SAVED_KEY);
        setEnabled(!!saved);
        if (!saved) return;
        const db = getDb();
        if (!db) return;
        try {
          const snap = await getDoc(doc(db, 'pushTokens', saved));
          const list = (snap.get('topics') as NotificationTopicKey[] | undefined) ?? DEFAULT_TOPICS;
          setTopics(new Set(list));
        } catch {
          setTopics(new Set(DEFAULT_TOPICS));
        }
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
        setTopics(new Set());
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
      // 로그인된 사용자(교인·관리자)면 그 세션을 쓰고, 아니면 익명 세션 보장
      const currentEmail = getAuthOrNull()?.currentUser?.email ?? null;
      if (!currentEmail) {
        const uid = await ensureAnonymousAuth();
        if (!uid) throw new Error('로그인 세션 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
      // 교인 가입이 된 계정이면 이름을 함께 저장 — 관리자 "알림 켠 기기" 목록 표시용
      let memberName: string | null = null;
      try {
        const uid = getAuthOrNull()?.currentUser?.uid;
        if (uid) {
          const m = await getDoc(doc(db, 'members', uid));
          memberName = m.exists() ? ((m.get('name') as string | undefined) ?? null) : null;
        }
      } catch {}
      await setDoc(doc(db, 'pushTokens', token), {
        createdAt: Date.now(),
        // 관리자 알림(가입 신청 등) 대상 식별용
        email: currentEmail ? currentEmail.toLowerCase() : null,
        name: memberName,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 150) : '',
        // 긴급 공지는 이 필드와 무관하게 무조건 감. 그 외 알림만 여기서 선택.
        topics: DEFAULT_TOPICS,
      });
      localStorage.setItem(SAVED_KEY, token);
      setEnabled(true);
      setTopics(new Set(DEFAULT_TOPICS));
    } catch (e) {
      setError(e instanceof Error ? e.message : '알림 설정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  /** 알림 종류 하나를 켜거나 끈다(긴급 공지 제외) — pushTokens 문서의 topics만 갱신 */
  const setTopic = useCallback(
    async (topic: NotificationTopicKey, on: boolean) => {
      const saved = localStorage.getItem(SAVED_KEY);
      const db = getDb();
      if (!saved || !db) return;
      setError(null);
      setTopicBusy(topic);
      try {
        const next = new Set(topics);
        if (on) next.add(topic);
        else next.delete(topic);
        await updateDoc(doc(db, 'pushTokens', saved), { topics: [...next] });
        setTopics(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : '알림 설정에 실패했습니다.');
      } finally {
        setTopicBusy(null);
      }
    },
    [topics],
  );

  return {
    supported: supported && pushConfigured,
    enabled,
    busy,
    error,
    toggle,
    topics,
    topicBusy,
    setTopic,
  };
}
