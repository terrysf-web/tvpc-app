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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureAnonymousAuth, firebaseEnabled, getDb } from '../firebase';
import type {
  EventDoc,
  NewsDoc,
  PhotoDoc,
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
 * 마지막으로 받아온 데이터를 기기에 저장해 두는 캐시.
 * 앱을 다시 열 때 서버 응답을 기다리는 동안 번들 샘플(옛 구절)이
 * 번쩍이지 않도록, 최근 데이터를 즉시 보여주는 용도.
 */
const CACHE_PREFIX = 'tvpc.cache.';

function readCacheSync<T>(name: string): T[] | null {
  // 웹(PWA)에서는 localStorage를 동기로 읽어 첫 렌더부터 최신 데이터를 쓴다
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(CACHE_PREFIX + name);
    const parsed = raw ? (JSON.parse(raw) as T[]) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Firestore 컬렉션 구독 훅.
 * Firebase 미설정(데모 모드)이거나 구독 실패 시 기기 캐시 → 번들 샘플 순으로 쓴다.
 * ready가 false인 동안은 아직 번들 샘플일 수 있으므로, 화면에서는
 * 샘플이 번쩍이지 않게 로딩 표시를 보여주는 것이 좋다.
 */
function useCollection<T extends { id: string }>(
  name: string,
  fallback: T[],
  orderField: string,
  direction: 'asc' | 'desc' = 'desc',
  max = 50,
  /** orderField ≤ 이 값인 문서만 (미래 날짜로 미리 등록된 문서 제외용) */
  upTo?: string,
): { data: T[]; loading: boolean; live: boolean; ready: boolean } {
  const [initialCache] = useState<T[] | null>(() => readCacheSync<T>(name));
  const [data, setData] = useState<T[]>(initialCache ?? fallback);
  const [loading, setLoading] = useState(firebaseEnabled);
  const [live, setLive] = useState(false);
  // 확정된 데이터(기기 캐시 또는 서버 응답)를 갖고 있는지
  const [hydrated, setHydrated] = useState(initialCache != null);
  const liveRef = useRef(false);

  // 네이티브(AsyncStorage는 비동기)용 캐시 복원 — 서버 데이터가 먼저 오면 건너뜀
  useEffect(() => {
    let stale = false;
    AsyncStorage.getItem(CACHE_PREFIX + name)
      .then((raw) => {
        if (stale || liveRef.current || !raw) return;
        const parsed = JSON.parse(raw) as T[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setData(parsed);
          setHydrated(true);
        }
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [name]);

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
            const docs = snap.docs.map(
              (d) => ({ ...(d.data() as Omit<T, 'id'>), id: d.id }) as T,
            );
            liveRef.current = true;
            setData(docs);
            setLive(true);
            AsyncStorage.setItem(CACHE_PREFIX + name, JSON.stringify(docs)).catch(() => {});
          }
          setHydrated(true);
          setLoading(false);
        },
        (err) => {
          console.warn(`[firestore] ${name} 구독 실패 — 캐시/샘플 데이터 사용:`, err.message);
          setLoading(false);
        },
      );
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [name, orderField, direction, max, upTo]);

  // ready: 캐시/서버 데이터가 있거나, 조회가 끝나(실패 포함) 더 기다릴 게 없는 상태
  return { data, loading, live, ready: hydrated || !loading };
}

/** 오늘의 말씀 — verses 컬렉션에서 가장 최근 문서 1개 */
export function useTodayVerse(): { verse: VerseDoc; loading: boolean; ready: boolean } {
  // 새벽예배 본문이 한 주치 미리 등록되므로, 오늘 이하 날짜 중 최신 문서를 쓴다
  const today = new Date().toLocaleDateString('en-CA');
  const { data, loading, ready } = useCollection<VerseDoc>(
    'verses',
    [sampleVerse],
    'date',
    'desc',
    1,
    today,
  );
  return { verse: data[0] ?? sampleVerse, loading, ready };
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

/** 교회 사진 — 홈페이지 사진 게시판에서 자동으로 가져온 앨범들 */
export function usePhotos(): { photos: PhotoDoc[]; loading: boolean; ready: boolean } {
  const { data, loading, ready } = useCollection<PhotoDoc>('photos', [], 'date', 'desc', 60);
  return { photos: data, loading, ready };
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

/**
 * 시계 틱 — 1분마다, 그리고 앱을 다시 앞으로 가져올 때 값이 바뀐다.
 * 시간대별 인사말·배경처럼 '지금 시각'으로 그리는 화면이 이 훅을 쓰면
 * 앱을 켜 둔 채 시간이 흘러도(오후 → 저녁) 화면이 저절로 갱신된다.
 *
 * 다만 화면이 꺼지거나 뒤로 넘어가 오래(30분+) 있으면 — 예: 밤새 켜둔 채
 * 다음 날 아침에 여는 경우 — 인사말은 새로 그려져 맞지만, 말씀·배경처럼
 * 한 번 받아온 값을 세션 내내 기억해 두는 자료는 그대로 남아 있곤 했다
 * ("인사말은 아침인데 카드는 어제 밤"). 오래 떠나 있었다면 아예 새로고침해
 * 모든 화면을 확실히 다시 맞춘다.
 */
const RELOAD_AFTER_HIDDEN_MS = 30 * 60 * 1000;

export function useClockTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (
        hiddenAt != null &&
        Date.now() - hiddenAt >= RELOAD_AFTER_HIDDEN_MS &&
        typeof window !== 'undefined'
      ) {
        window.location.reload();
        return;
      }
      hiddenAt = null;
      setTick((t) => t + 1);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, []);
  return tick;
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
