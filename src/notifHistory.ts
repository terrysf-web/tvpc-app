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
