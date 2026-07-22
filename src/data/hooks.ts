import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDoc,
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureAnonymousAuth, firebaseEnabled, getDb } from '../firebase';
import type {
  EventDoc,
  NewsDoc,
  PrayerCategory,
  PrayerDoc,
  SermonDoc,
  VerseDoc,
} from '../types';
import {
  sampleEvents,
  sampleNews,
  samplePrayers,
  sampleSermons,
  sampleVerse,
} from './sample';

/**
 * Firestore 컬렉션 구독 훅.
 * Firebase 미설정(데모 모드)이거나 구독 실패 시 번들 샘플 데이터를 그대로 사용한다.
 */
function useCollection<T extends { id: string }>(
  name: string,
  fallback: T[],
  orderField: string,
  direction: 'asc' | 'desc' = 'desc',
  max = 50,
  /** orderField ≤ 이 값인 문서만 (미래 날짜로 미리 등록된 문서 제외용) */
  upTo?: string,
): { data: T[]; loading: boolean; live: boolean } {
  const [data, setData] = useState<T[]>(fallback);
  const [loading, setLoading] = useState(firebaseEnabled);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    ensureAnonymousAuth().then(() => {
      if (cancelled) return;
      const q = query(
        collection(db, name),
        ...(upTo != null ? [where(orderField, '<=', upTo)] : []),
        orderBy(orderField, direction),
        limit(max),
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            setData(snap.docs.map((d) => ({ ...(d.data() as Omit<T, 'id'>), id: d.id }) as T));
            setLive(true);
          }
          setLoading(false);
        },
        (err) => {
          console.warn(`[firestore] ${name} 구독 실패 — 샘플 데이터 사용:`, err.message);
          setLoading(false);
        },
      );
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [name, orderField, direction, max, upTo]);

  return { data, loading, live };
}

/** 오늘의 말씀 — verses 컬렉션에서 가장 최근 문서 1개 */
export function useTodayVerse(): { verse: VerseDoc; loading: boolean } {
  // 새벽예배 본문이 한 주치 미리 등록되므로, 오늘 이하 날짜 중 최신 문서를 쓴다
  const today = new Date().toLocaleDateString('en-CA');
  const { data, loading } = useCollection<VerseDoc>(
    'verses',
    [sampleVerse],
    'date',
    'desc',
    1,
    today,
  );
  return { verse: data[0] ?? sampleVerse, loading };
}

export function useSermons(): { sermons: SermonDoc[]; loading: boolean } {
  // 팟캐스트 아카이브까지 표시할 수 있게 넉넉히 (설교+팟캐스트+찬양 통합 목록)
  const { data, loading } = useCollection<SermonDoc>('sermons', sampleSermons, 'date', 'desc', 200);
  return { sermons: data, loading };
}

export function useNews(): { news: NewsDoc[]; loading: boolean } {
  const { data, loading } = useCollection<NewsDoc>('news', sampleNews, 'date');
  return { news: data, loading };
}

export function useEvents(): { events: EventDoc[]; loading: boolean } {
  // dateLabel(문자)이 아닌 실제 날짜(sortKey)순 — "01.01"이 "08.30"보다 앞서는 문제 방지
  const { data, loading } = useCollection<EventDoc>('events', sampleEvents, 'sortKey', 'asc', 200);
  return { events: data, loading };
}

const LIKED_KEY = 'tvpc.likedPrayers';

/**
 * 기도요청 목록 + 작성/좋아요.
 * 좋아요 여부는 기기 로컬(AsyncStorage)에, 카운트는 Firestore(increment)에 저장.
 * 데모 모드에서는 전부 로컬 상태로만 동작한다.
 */
export function usePrayers() {
  const { data, loading, live } = useCollection<PrayerDoc>('prayers', samplePrayers, 'createdAt');
  const [localPrayers, setLocalPrayers] = useState<PrayerDoc[]>([]);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [localDelta, setLocalDelta] = useState<Record<string, number>>({});

  useEffect(() => {
    AsyncStorage.getItem(LIKED_KEY)
      .then((raw) => raw && setLiked(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const prayers = useMemo(() => {
    const merged = live ? data : [...localPrayers, ...data];
    return merged.map((p) => ({
      ...p,
      prayCount: p.prayCount + (live ? 0 : (localDelta[p.id] ?? 0)),
    }));
  }, [data, localPrayers, localDelta, live]);

  const toggleLike = useCallback(
    (id: string) => {
      const nowLiked = !liked[id];
      const next = { ...liked, [id]: nowLiked };
      setLiked(next);
      AsyncStorage.setItem(LIKED_KEY, JSON.stringify(next)).catch(() => {});
      const db = getDb();
      if (db && live) {
        updateDoc(doc(db, 'prayers', id), { prayCount: increment(nowLiked ? 1 : -1) }).catch(
          (e) => console.warn('[firestore] 좋아요 반영 실패:', e.message),
        );
      } else {
        setLocalDelta((d) => ({ ...d, [id]: (d[id] ?? 0) + (nowLiked ? 1 : -1) }));
      }
    },
    [liked, live],
  );

  const addPrayer = useCallback(
    async (input: { category: PrayerCategory; text: string; authorName: string }) => {
      const body = {
        category: input.category,
        answered: input.category === 'answered',
        text: input.text,
        authorName: input.authorName,
        createdAt: Date.now(),
        prayCount: 0,
      };
      const db = getDb();
      if (db && live) {
        await ensureAnonymousAuth();
        await addDoc(collection(db, 'prayers'), body);
      } else {
        setLocalPrayers((prev) => [{ ...body, id: `local-${Date.now()}` }, ...prev]);
      }
    },
    [live],
  );

  return { prayers, loading, liked, toggleLike, addPrayer };
}

/** "n시간 전" 스타일 상대 시간 */
export function timeAgo(millis: number): string {
  const diff = Date.now() - millis;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(millis).toLocaleDateString('ko-KR');
}
