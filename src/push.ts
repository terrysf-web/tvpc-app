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

/** 알림을 보낼 수 있는 시각 — 사람마다 받고 싶은 시간이 달라 선택하게 한다 */
export const NOTIFICATION_TIMES = [
  { key: '08:00', label: '오전 8시' },
  { key: '12:30', label: '오후 12:30' },
  { key: '19:00', label: '오후 7시' },
] as const;
export type NotificationTimeKey = (typeof NOTIFICATION_TIMES)[number]['key'];

/**
 * 선택 가능한 알림 종류 — 긴급 공지는 여기 없다(끄고 켜는 게 아니라, 알림을
 * 켠 모든 기기에 무조건 감. sendAlert 함수·send-alert.mjs 참고).
 * 새 알림 종류가 생기면 여기 한 줄만 추가하면 설정 화면에 바로 나타난다.
 * defaultTime — 시각을 따로 고르지 않은 기존 기기에 그대로 적용되는 값
 * (scripts/send-scheduled-push.mjs도 같은 기본값을 쓴다).
 */
export const NOTIFICATION_TOPICS = [
  { key: 'verse', label: '오늘의 말씀', defaultTime: '08:00' as NotificationTimeKey },
  { key: 'gratitude', label: '감사일기', defaultTime: '19:00' as NotificationTimeKey },
] as const;
export type NotificationTopicKey = (typeof NOTIFICATION_TOPICS)[number]['key'];
// 알림 종류는 전부 기본값 off — 본인이 알림 설정에서 직접 켜기 전까지는
// 강제로 켜지 않는다(긴급 공지만 예외, 위 주석 참고).
const DEFAULT_TOPICS: NotificationTopicKey[] = [];

function defaultTimeOf(topic: NotificationTopicKey): NotificationTimeKey {
  return NOTIFICATION_TOPICS.find((t) => t.key === topic)?.defaultTime ?? '08:00';
}

/** Firestore pushTokens 문서 필드명 — topic별로 "{topic}Time" */
function timeField(topic: NotificationTopicKey): string {
  return `${topic}Time`;
}

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

function readTopicTimes(snap: { get: (k: string) => unknown }): Record<NotificationTopicKey, NotificationTimeKey> {
  const times = {} as Record<NotificationTopicKey, NotificationTimeKey>;
  for (const t of NOTIFICATION_TOPICS) {
    const v = snap.get(timeField(t.key)) as string | undefined;
    times[t.key] = (NOTIFICATION_TIMES.find((n) => n.key === v)?.key ?? t.defaultTime) as NotificationTimeKey;
  }
  return times;
}

function defaultTopicTimes(): Record<NotificationTopicKey, NotificationTimeKey> {
  const times = {} as Record<NotificationTopicKey, NotificationTimeKey>;
  for (const t of NOTIFICATION_TOPICS) times[t.key] = t.defaultTime;
  return times;
}

/**
 * Firestore SDK가 던진 원본 에러(코드·경로·토큰까지 들어있는 기술적 문구)를
 * 화면에 그대로 보여주지 않기 위한 판별 — 우리가 직접 던진 Error(코드 없음,
 * 이미 한국어로 친절한 문구)와 구분한다.
 */
function firestoreErrorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null ? (e as { code?: string }).code : undefined;
}

/** 알림 설정 실패를 사용자에게 보여줄 문구로 — 기술적인 원문은 콘솔에만 남긴다 */
function friendlyPushError(e: unknown, context: string): string {
  const code = firestoreErrorCode(e);
  if (!code) return e instanceof Error ? e.message : '알림 설정에 실패했습니다.';
  console.warn(`[push] ${context} 실패(${code}):`, e);
  // 등록 문서가 없어졌다 — 발송 스크립트가 무효 토큰을 정리했을 때 등
  if (code === 'not-found') return '이 기기의 알림 등록이 만료됐어요. "알림 받기"를 다시 켜 주세요.';
  return '알림 설정에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

/**
 * 푸시 알림 on/off + 알림 종류·시각 선택 훅.
 * 켜면 브라우저 알림 권한을 받고 FCM 토큰을 Firestore pushTokens에 등록한다.
 * 긴급 공지는 이 등록만으로 무조건 받고(선택 불가), 그 외 알림 종류(오늘의
 * 말씀 등, NOTIFICATION_TOPICS)는 topics 배열로 따로 켜고 끌 수 있고, 각각
 * 받고 싶은 시각(NOTIFICATION_TIMES)도 고를 수 있다.
 */
export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<Set<NotificationTopicKey>>(new Set());
  const [topicBusy, setTopicBusy] = useState<NotificationTopicKey | null>(null);
  const [topicTimes, setTopicTimes] = useState<Record<NotificationTopicKey, NotificationTimeKey>>(
    defaultTopicTimes(),
  );

  // 서버 쪽 등록(pushTokens 문서)이 사라졌을 때(무효 토큰 정리 등) 이 기기
  // 상태도 "꺼짐"으로 되돌린다 — 그래야 실제로는 안 되는데 화면엔 켜진
  // 것처럼 보이는 상태가 안 생긴다.
  const resetToDisabled = useCallback(() => {
    try {
      localStorage.removeItem(SAVED_KEY);
    } catch {}
    setEnabled(false);
    setTopics(new Set());
    setTopicTimes(defaultTopicTimes());
  }, []);

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
          if (!snap.exists()) {
            resetToDisabled();
            return;
          }
          const list = (snap.get('topics') as NotificationTopicKey[] | undefined) ?? DEFAULT_TOPICS;
          setTopics(new Set(list));
          setTopicTimes(readTopicTimes(snap));
        } catch {
          setTopics(new Set(DEFAULT_TOPICS));
        }
      })
      .catch(() => setSupported(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setTopicTimes(defaultTopicTimes());
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
      setTopicTimes(defaultTopicTimes());
    } catch (e) {
      setError(friendlyPushError(e, 'toggle'));
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
        if (firestoreErrorCode(e) === 'not-found') resetToDisabled();
        setError(friendlyPushError(e, 'setTopic'));
      } finally {
        setTopicBusy(null);
      }
    },
    [topics, resetToDisabled],
  );

  /** 알림 종류 하나의 받고 싶은 시각을 바꾼다 */
  const setTopicTime = useCallback(
    async (topic: NotificationTopicKey, time: NotificationTimeKey) => {
      const saved = localStorage.getItem(SAVED_KEY);
      const db = getDb();
      if (!saved || !db) return;
      setError(null);
      setTopicBusy(topic);
      try {
        await updateDoc(doc(db, 'pushTokens', saved), { [timeField(topic)]: time });
        setTopicTimes((prev) => ({ ...prev, [topic]: time }));
      } catch (e) {
        if (firestoreErrorCode(e) === 'not-found') resetToDisabled();
        setError(friendlyPushError(e, 'setTopicTime'));
      } finally {
        setTopicBusy(null);
      }
    },
    [resetToDisabled],
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
    topicTimes,
    setTopicTime,
  };
}
