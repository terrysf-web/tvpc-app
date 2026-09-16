/**
 * 새로 올라온 것에 빨간 점.
 *
 * 홈의 "한눈에 보기" 카드와 그 안의 탭에, 지난번 보고 난 뒤 새로 올라온
 * 것이 있으면 작은 빨간 점을 붙인다. 열어 보면 그 자리의 점은 사라진다.
 * "뭐가 새로 올라왔지?" 하고 하나하나 들어가 보지 않아도 되게.
 *
 * 무엇이 "새 것"인지는 그 칸에 있는 글들의 목록(문서 id를 모은 값)으로
 * 가린다 — 목록이 지난번과 달라졌으면 새 것이 있다는 뜻이다. 자동
 * 동기화가 같은 글을 다시 써도 id는 그대로라 괜히 점이 뜨지 않는다.
 *
 * 앱을 처음 켠 분에게는 점을 붙이지 않는다(들어가 본 적이 없다고 해서
 * 모든 칸에 점이 뜨면 안내가 아니라 잡음이다) — 처음 본 값은 조용히
 * "본 것"으로 적어 둔다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLatestBulletinWeekInfo } from './data/bulletin';
import {
  useEvents,
  useNews,
  usePhotos,
  usePraiseVideos,
  useRecentVerses,
  useSermons,
  useTodayVerse,
} from './data/hooks';

/** 점을 붙일 자리 — 카드 안의 탭 하나하나 */
export type UnreadKey =
  | 'word'
  | 'bulletin'
  | 'sermon.recent'
  | 'sermon.dawn'
  | 'sermon.podcast'
  | 'news.notice'
  | 'news.event'
  | 'news.schedule'
  | 'media.photo'
  | 'media.video'
  | 'media.praise';

/** 카드 하나에 딸린 자리들 — 하나라도 새 것이면 카드에 점이 붙는다 */
export const UNREAD_GROUPS: Record<string, UnreadKey[]> = {
  word: ['word'],
  bulletin: ['bulletin'],
  sermon: ['sermon.recent', 'sermon.dawn', 'sermon.podcast'],
  news: ['news.notice', 'news.event', 'news.schedule'],
  media: ['media.photo', 'media.video', 'media.praise'],
};

const PREFIX = 'tvpc.seen.';

/** 글 목록을 짧은 값 하나로 — 목록이 달라지면 값도 달라진다 */
function signature(ids: string[]): string {
  if (!ids.length) return '';
  let h = 5381;
  for (const id of [...ids].sort()) {
    for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  }
  return `${ids.length}.${(h >>> 0).toString(36)}`;
}

/** 지금 각 자리에 무엇이 들어 있는지 */
function useCurrentSignatures(): Record<UnreadKey, string> {
  const { news } = useNews();
  const { events } = useEvents();
  const { photos } = usePhotos();
  const { sermons } = useSermons();
  const { videos: praiseVideos } = usePraiseVideos();
  // 주보는 그 주 것 한 부뿐이라, 가장 최근 주보 날짜가 곧 "새 주보"다
  const { date: bulletinDate } = useLatestBulletinWeekInfo(true);
  // 오늘의 말씀 — 날짜가 바뀌면 새 말씀
  const { verse } = useTodayVerse();
  // 새벽설교 목록
  const { verses: dawnVerses } = useRecentVerses(60);

  return useMemo(() => {
    // 미디어 화면과 같은 기준으로 나눈다(은혜안에 워십팀 영상은 찬양 쪽)
    const isEunhyeane = (s: { title: string; youtubeId?: string | null }) =>
      /은혜안에/.test(s.title) && !!s.youtubeId;
    const videos = sermons.filter(
      (s) => (s.category === 'praise' || s.category === 'etc') && !isEunhyeane(s),
    );
    const praise = [...praiseVideos.map((v) => v.id), ...sermons.filter(isEunhyeane).map((s) => s.id)];

    return {
      word: verse.date ?? '',
      bulletin: bulletinDate ?? '',
      'sermon.recent': signature(
        sermons.filter((s) => (s.category ?? 'sermon') === 'sermon').map((s) => s.id),
      ),
      'sermon.dawn': signature(dawnVerses.map((v) => v.date)),
      'sermon.podcast': signature(sermons.filter((s) => s.category === 'podcast').map((s) => s.id)),
      'news.notice': signature(news.filter((n) => n.category === 'notice').map((n) => n.id)),
      'news.event': signature(news.filter((n) => n.category === 'event').map((n) => n.id)),
      'news.schedule': signature(events.map((e) => e.id)),
      'media.photo': signature(photos.map((p) => p.id)),
      'media.video': signature(videos.map((v) => v.id)),
      'media.praise': signature(praise),
    };
  }, [news, events, photos, sermons, praiseVideos, bulletinDate, verse.date, dawnVerses]);
}

export interface Unread {
  /** 이 자리에 새 것이 있나 */
  isNew: (key: UnreadKey) => boolean;
  /** 이 카드(탭 묶음) 안에 새 것이 있나 */
  groupIsNew: (group: string) => boolean;
  /** 열어 봤다고 적어 둔다 */
  markSeen: (key: UnreadKey) => void;
}

export function useUnread(): Unread {
  const current = useCurrentSignatures();
  const [seen, setSeen] = useState<Record<string, string> | null>(null);

  // 기기에 적어 둔 "지난번 본 값" 읽기
  useEffect(() => {
    let on = true;
    const keys = Object.keys(current) as UnreadKey[];
    Promise.all(keys.map((k) => AsyncStorage.getItem(PREFIX + k)))
      .then((vals) => {
        if (!on) return;
        const map: Record<string, string> = {};
        keys.forEach((k, i) => {
          if (vals[i] != null) map[k] = vals[i] as string;
        });
        setSeen(map);
      })
      .catch(() => on && setSeen({}));
    return () => {
      on = false;
    };
    // 처음 한 번만 읽는다 — 그 뒤로는 markSeen이 갱신한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markSeen = useCallback((key: UnreadKey) => {
    const now = (current as Record<string, string>)[key] ?? '';
    setSeen((prev) => ({ ...(prev ?? {}), [key]: now }));
    AsyncStorage.setItem(PREFIX + key, now).catch(() => {});
  }, [current]);

  // 처음 켠 기기 — 지금 있는 것을 조용히 "본 것"으로 적어 둔다
  useEffect(() => {
    if (!seen) return;
    for (const [key, sig] of Object.entries(current)) {
      if (!sig || seen[key] != null) continue;
      AsyncStorage.setItem(PREFIX + key, sig).catch(() => {});
      setSeen((prev) => ({ ...(prev ?? {}), [key]: sig }));
    }
  }, [seen, current]);

  const isNew = useCallback(
    (key: UnreadKey) => {
      if (!seen) return false;
      const sig = (current as Record<string, string>)[key] ?? '';
      const was = seen[key];
      // 아직 한 번도 안 적어 둔 자리는 새 것으로 보지 않는다(위에서 적는다)
      return !!sig && was != null && was !== sig;
    },
    [seen, current],
  );

  const groupIsNew = useCallback(
    (group: string) => (UNREAD_GROUPS[group] ?? []).some(isNew),
    [isNew],
  );

  return { isNew, groupIsNew, markSeen };
}
