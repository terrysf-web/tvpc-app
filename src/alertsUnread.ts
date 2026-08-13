import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useNews } from './data/hooks';
import { useNotifHistory } from './notifHistory';

/** 알림 화면을 마지막으로 연 시각 — 이보다 새 알림이 있으면 종 아이콘에 표시 */
const LAST_READ_KEY = 'tvpc.alertsLastRead';

function getLastRead(): number {
  try {
    return typeof localStorage === 'undefined' ? 0 : Number(localStorage.getItem(LAST_READ_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

/** 알림 화면(app/alerts.tsx)을 열었을 때 불러 — 지금까지 온 알림을 모두 읽음 처리한다 */
export function markAlertsRead() {
  try {
    localStorage?.setItem(LAST_READ_KEY, String(Date.now()));
  } catch {
    /* 무시 */
  }
}

/**
 * 홈 화면 종 아이콘에 안 읽은 알림 표시를 할지 — 긴급 공지(news, 서버 공유)와
 * 이 기기가 받은 알림 기록(오늘의 말씀·감사일기 등, src/notifHistory.ts)을
 * 합쳐서 가장 최근 것이 마지막으로 알림 화면을 연 시각보다 새로우면 true.
 */
export function useHasUnreadAlerts(): boolean {
  const { news } = useNews();
  const localHistory = useNotifHistory();
  const [lastRead, setLastRead] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setLastRead(getLastRead());
  }, []);

  if (Platform.OS !== 'web') return false;

  const newestAlertTs = news
    .filter((n) => n.alert)
    .reduce((max, a) => Math.max(max, Date.parse(`${a.date}T00:00:00`) || 0), 0);
  const newestLocalTs = localHistory.reduce((max, n) => Math.max(max, n.ts), 0);

  return Math.max(newestAlertTs, newestLocalTs) > lastRead;
}
