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

/**
 * 홈 화면의 주일 모드.
 *  - 'live'   주일 예배 시간 (~ 낮 12시 30분): 온라인예배로 안내
 *  - 'after'  주일 오후·저녁: 최신 설교로 안내
 *  - 'monday' 월요일 하루 종일 (화요일 새벽 12시 1분에 끝난다): 주일의 여운
 *  - null     그 밖의 날: 평소처럼 오늘의 말씀
 */
export type SundayPhase = 'live' | 'after' | 'monday' | null;

export function sundayPhase(now: Date = new Date()): SundayPhase {
  const { weekday, minutes } = churchNow(now);
  if (weekday === 0) return minutes < SUNDAY_LIVE_END ? 'live' : 'after';
  if (weekday === 1) return 'monday';
  // 화요일 0시 1분에 평일 화면으로 돌아간다
  if (weekday === 2 && minutes < 1) return 'monday';
  return null;
}
