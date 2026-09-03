import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useNews } from './data/hooks';
import { useNotifHistory } from './notifHistory';

/**
 * 알림 보관함(app/alerts.tsx) 항목별 읽음 여부. 예전엔 "알림 화면을 마지막
 * 으로 연 시각" 딱 하나만 저장해서, 화면을 열면 그 순간 전부 한꺼번에 읽음
 * 처리됐다 — 그래서 종 아이콘을 눌러 들어가도 정작 어느 알림이 새로 온
 * 건지 목록에서 구분할 수 없었다. 이제 항목 하나하나(alert-<id>,
 * local-<id>)를 따로 기억해, 실제로 그 카드를 눌러 확인한 것만 읽음으로
 * 남기고 나머지는 계속 "안 읽음" 표시가 남는다.
 */
const READ_IDS_KEY = 'tvpc.alertsReadIds';
/** 옛 방식(마지막으로 연 시각) — 새 방식으로 넘어갈 때 이 시각 이전 항목은
 *  이미 본 걸로 간주해 한꺼번에 읽음 처리하는 마이그레이션에만 쓴다 */
const LEGACY_LAST_READ_KEY = 'tvpc.alertsLastRead';
/** 너무 오래(수백~수천 건) 쌓이지 않게 최근 읽음 기록만 유지 */
const MAX_READ_IDS = 500;

// 같은 탭 안에서 markEntryRead()가 바뀔 때 useHasUnreadAlerts()도 즉시 다시
// 계산되도록 알리는 용도 — localStorage는 다른 탭에만 storage 이벤트를 준다.
const listeners = new Set<() => void>();
function notifyChanged() {
  listeners.forEach((fn) => fn());
}

function getReadIds(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = localStorage.getItem(READ_IDS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    const arr = [...ids];
    const trimmed = arr.length > MAX_READ_IDS ? arr.slice(arr.length - MAX_READ_IDS) : arr;
    localStorage?.setItem(READ_IDS_KEY, JSON.stringify(trimmed));
  } catch {
    /* 무시 */
  }
}

/** 알림 카드 하나가 읽음 처리됐는지 — key는 "alert-<id>" 또는 "local-<id>" */
export function isEntryRead(key: string): boolean {
  return getReadIds().has(key);
}

/** 알림 카드를 눌러 확인했을 때 호출 — 그 항목만 읽음으로 표시한다 */
export function markEntryRead(key: string) {
  const ids = getReadIds();
  if (ids.has(key)) return;
  ids.add(key);
  saveReadIds(ids);
  notifyChanged();
}

/**
 * 옛 데이터 마이그레이션 — 새 읽음 기록이 아직 하나도 없으면(이 기기에서
 * 처음 업데이트된 직후), 예전 "마지막으로 연 시각" 이전 항목은 이미 봤던
 * 걸로 보고 한꺼번에 읽음 처리한다. 그래야 업데이트 직후 이미 봤던 옛
 * 알림들까지 전부 "안 읽음"으로 갑자기 쏟아지지 않는다. entries가 아직 다
 * 안 불러와졌으면(빈 배열) 호출하지 않는 게 안전 — 호출부에서 데이터가
 * 준비된 뒤 한 번만 부르도록 한다.
 */
export function migrateLegacyReadState(entries: { key: string; ts: number }[]) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(READ_IDS_KEY) != null) return; // 이미 마이그레이션함
    const legacy = Number(localStorage.getItem(LEGACY_LAST_READ_KEY) ?? '0') || 0;
    const ids = getReadIds();
    if (legacy > 0) {
      entries.forEach((e) => {
        if (e.ts <= legacy) ids.add(e.key);
      });
    }
    saveReadIds(ids);
    notifyChanged();
  } catch {
    /* 무시 */
  }
}

/**
 * 홈 화면 종 아이콘에 안 읽은 알림 표시를 할지 — 긴급 공지(news, 서버 공유)와
 * 이 기기가 받은 알림 기록(오늘의 말씀·감사일기 등, src/notifHistory.ts)을
 * 합쳐, 하나라도 아직 안 읽은 게 있으면 true.
 */
export function useHasUnreadAlerts(): boolean {
  const { news } = useNews();
  const localHistory = useNotifHistory();
  const [, bump] = useState(0);

  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  if (Platform.OS !== 'web') return false;

  const readIds = getReadIds();
  const alertKeys = news.filter((n) => n.alert).map((a) => `alert-${a.id}`);
  const localKeys = localHistory.map((n) => `local-${n.id}`);
  return [...alertKeys, ...localKeys].some((key) => !readIds.has(key));
}
