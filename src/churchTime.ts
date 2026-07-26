/**
 * 교회 현지 시각(태평양 시간) — 여행 중이거나 기기 시계가 다른 지역이어도
 * 예배 시간 판단은 교회 기준으로 한다.
 */
const TZ = 'America/Los_Angeles';

export type ChurchNow = { weekday: number; minutes: number };

/** 지금의 교회 현지 요일(일=0)과 자정부터의 분 */
export function churchNow(now: Date = new Date()): ChurchNow {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));
    if (wd < 0 || Number.isNaN(hour) || Number.isNaN(minute)) throw new Error('parse');
    return { weekday: wd, minutes: hour * 60 + minute };
  } catch {
    // Intl 시간대를 못 쓰는 환경 — 기기 시계로 대신한다
    return { weekday: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

/** 2부 온라인예배가 끝나는 시각 — 주일 오후 12시 30분 */
export const SUNDAY_LIVE_END = 12 * 60 + 30;
