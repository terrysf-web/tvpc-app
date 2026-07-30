/**
 * 예배 시간 안내 — 관리자 화면에서 고칠 수 있게 Firestore(content/services)에 둔다.
 * 서버 값이 없거나 통신에 실패하면 churchInfo.services(번들 기본값)를 보여준다.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { churchInfo } from '../churchInfo';
import { ensureAnonymousAuth, getDb } from '../firebase';

export interface ServiceItem {
  name: string;
  time: string;
  place: string;
}

const FALLBACK: ServiceItem[] = churchInfo.services.map((s) => ({ ...s }));
const CACHE_KEY = 'tvpc.servicesCache';

function readCache(): ServiceItem[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ServiceItem[]) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(list: ServiceItem[]) {
  try {
    localStorage?.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* 무시 */
  }
}

export function useServices(): { services: ServiceItem[]; ready: boolean } {
  const [state, setState] = useState<{ list: ServiceItem[]; ready: boolean }>(() => {
    const cached = readCache();
    return cached ? { list: cached, ready: true } : { list: FALLBACK, ready: false };
  });

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const db = getDb();
        if (!db) {
          if (on) setState((s) => ({ ...s, ready: true }));
          return;
        }
        await ensureAnonymousAuth();
        const snap = await getDoc(doc(db, 'content', 'services'));
        const list = snap.exists() ? (snap.get('list') as ServiceItem[] | undefined) : undefined;
        if (Array.isArray(list) && list.length > 0) {
          writeCache(list);
          if (on) setState({ list, ready: true });
        } else if (on) {
          setState((s) => ({ ...s, ready: true }));
        }
      } catch {
        if (on) setState((s) => ({ ...s, ready: true }));
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  return { services: state.list, ready: state.ready };
}

/** 관리자 화면 — 예배 시간 목록 저장 */
export async function saveServices(list: ServiceItem[]): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  const cleaned = list
    .map((s) => ({ name: s.name.trim(), time: s.time.trim(), place: s.place.trim() }))
    .filter((s) => s.name && s.time);
  if (cleaned.length === 0) throw new Error('예배 이름과 시간은 최소 한 줄 이상 있어야 합니다.');
  await setDoc(doc(db, 'content', 'services'), {
    list: cleaned,
    updatedAt: new Date().toISOString(),
  });
}
