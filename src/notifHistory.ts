import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** 서비스워커(public/firebase-messaging-sw.js)가 기록해 둔 알림 한 건 */
export type NotifHistoryItem = {
  id: number;
  /** 예: verse-2026-08-13, gratitude-2026-08-13, pray-started-abc123 */
  tag: string;
  title: string;
  body: string;
  /** 절대 URL — 이 화면에서 상대 경로로 바꿔 라우팅한다 */
  link: string;
  ts: number;
};

// tvpc-sw DB v2 — kv(가려던 경로 등 1회성 값) + notifHistory(받은 알림 기록).
// 버전은 public/firebase-messaging-sw.js와 반드시 같아야 한다.
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('tvpc-sw', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('notifHistory')) {
          db.createObjectStore('notifHistory', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readAll(): Promise<NotifHistoryItem[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db || !db.objectStoreNames.contains('notifHistory')) {
          resolve([]);
          return;
        }
        const tx = db.transaction('notifHistory', 'readonly');
        const req = tx.objectStore('notifHistory').getAll();
        req.onsuccess = () => resolve((req.result as NotifHistoryItem[] | undefined) ?? []);
        req.onerror = () => resolve([]);
      }),
  );
}

/**
 * tag 접두어로 목적 화면을 알아낸다(public/firebase-messaging-sw.js의
 * pathFromTag와 동일한 규칙 — 서비스워커가 기록해 둔 link 필드가 언제 온
 * 알림이냐에 따라 어긋나 있을 수 있어(과거 한 번 그랬다), 화면에 보여줄
 * 때는 늘 이 값을 링크 파싱보다 우선한다 — 예전에 잘못 기록된 항목도
 * 이 함수 덕에 눌렀을 때 제 화면으로 간다).
 *
 * 말씀 알림(verse-YYYY-MM-DD)은 특히 — "오늘의 말씀"은 매일 바뀌므로,
 * 어제 온 알림을 오늘 열면 /word(오늘 것)로 보내면 알림 내용과 다른
 * 말씀이 뜬다. 알림에 적힌 그 날짜 그대로 보여주는 /verse/[date]로
 * 보낸다 — 단, 같은 날 안에 눌렀다면(가장 흔한 경우) 굳이 다를 게
 * 없으니 평소 쓰는 말씀 탭(/word)으로 보낸다.
 */
export function pathFromTag(tag: string): string | null {
  if (!tag) return null;
  if (tag.startsWith('verse-')) {
    const date = tag.slice('verse-'.length);
    if (!date) return '/word';
    const today = new Date().toLocaleDateString('en-CA');
    return date === today ? '/word' : `/verse/${date}`;
  }
  if (tag.startsWith('gratitude-')) return '/gratitude';
  if (tag.startsWith('alert-')) return '/alerts';
  if (tag.startsWith('pray-started-')) return '/pray-request';
  if (tag.startsWith('pray-answer-')) return '/pray-inbox';
  if (tag.startsWith('pray-')) return '/pray-inbox';
  return null;
}

/**
 * 이 기기가 실제로 받은 알림 기록(오늘의 말씀·감사일기·기도 알림 등) — 알림을
 * 놓치거나 눌러서 확인하지 못했어도 알림 화면(app/alerts.tsx)에서 다시 볼 수
 * 있게 한다. 긴급 공지는 news 컬렉션에서 따로 가져온다(alerts.tsx 참고).
 */
export function useNotifHistory(): NotifHistoryItem[] {
  const [items, setItems] = useState<NotifHistoryItem[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') return;
    readAll().then((list) => setItems([...list].sort((a, b) => b.ts - a.ts)));
  }, []);

  return items;
}
