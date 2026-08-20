import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { logClientError } from './data/errorLog';

/** 서비스워커가 남겨둔 값이 이보다 오래됐으면 무시(오래된 재실행 방지) */
const PENDING_NAV_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * 앱을 새로 열었을 때도(며칠 뒤 다시 열어도) 하던 자리 그대로 있어야
 * 맞는 화면 — 성경 읽던 자리·주보 괄호 채우던 자리는 시간이 얼마나
 * 지났든 이어서 하는 게 자연스럽다. 그 외 화면(관리자·소식 등)에
 * 머물다가 새로 열렸을 때는 오히려 헷갈린다는 의견을 반영해 홈으로
 * 보낸다.
 */
const ALWAYS_RESUME_PATHS = ['/word', '/bulletin'];

/** 같은 브라우저 세션(탭)인지 표시 — 새로고침(같은 세션)에는 안 적용,
 * 완전히 새로 켤 때(세션 자체가 새로 시작)만 아래 홈 이동 규칙을 적용 */
const SESSION_BOOTED_KEY = 'tvpc.booted';

/**
 * 서비스워커(public/firebase-messaging-sw.js)가 IndexedDB(tvpc-sw/kv,
 * 키 pendingNav)에 남겨둔 "가려던 경로"를 읽어온다 — 앱이 완전히 닫혀
 * 있던 상태에서 알림을 눌러 새로 열렸을 때(iOS 잠금화면 등), 사파리가
 * openWindow()에 준 URL을 무시하고 그냥 시작 화면으로 여는 경우가 있어
 * 그 대비책이다. 있으면 지운다(한 번만 쓰고 버림).
 */
interface PendingNavResult {
  path: string;
  /** 서비스워커가 남겨둔 진단 정보(태그·매칭된 창 개수 등) — 있으면만 */
  debug?: unknown;
}

function readAndClearPendingNav(): Promise<PendingNavResult | null> {
  return new Promise((resolve) => {
    try {
      // tvpc-sw DB v2 — kv(가려던 경로 등) + notifHistory(받은 알림 기록,
      // src/notifHistory.ts). 서비스워커가 이미 v2로 올려둬서, 여기서 계속
      // v1로 열면 VersionError로 조용히 실패해 가려던 경로를 영영 못 읽는다
      // — 버전은 반드시 세 곳(여기·notifHistory.ts·서비스워커) 다 같아야 한다.
      const req = indexedDB.open('tvpc-sw', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('notifHistory')) {
          db.createObjectStore('notifHistory', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) {
          resolve(null);
          return;
        }
        const tx = db.transaction('kv', 'readwrite');
        const getReq = tx.objectStore('kv').get('pendingNav');
        getReq.onsuccess = () => {
          const val = getReq.result as { path?: string; ts?: number; debug?: unknown } | undefined;
          tx.objectStore('kv').delete('pendingNav');
          if (val?.path && val.ts && Date.now() - val.ts < PENDING_NAV_MAX_AGE_MS) {
            resolve({ path: val.path, debug: val.debug });
          } else {
            resolve(null);
          }
        };
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** 재시도 간격 — 실기기에서 실제로 확인된 경합(아래 주석) 대비책.
 * 한 번으로는 가끔 더 부족한 경우가 있어(느린 기기 등) 두 번 재시도한다. */
const PENDING_NAV_RETRY_DELAYS_MS = [400, 800];

/**
 * pendingNav를 읽되, 못 찾으면 짧게 재시도한다. 사파리가 알림
 * 링크로 정확히 새 창을 열어줬는데도(URL은 맞게 열림), 서비스워커가 막
 * 써놓은 pendingNav 값이 그 새 페이지에 즉시 안 보이는 경합이 실기기에서
 * 실제로 확인됐다 — 그 상태에서 못 찾음으로 단정하면 applyResumeGuard가
 * 이미 제대로 연 화면을 홈으로 되돌려 보내는 사고가 난다
 * ("감사일기 알림 눌렀는데 홈으로 감" — 관리자 오류 탭 진단 기록으로 확인).
 */
function readPendingNavWithRetry(delays = PENDING_NAV_RETRY_DELAYS_MS): Promise<PendingNavResult | null> {
  return readAndClearPendingNav().then((result) => {
    if (result || delays.length === 0) return result;
    return new Promise((resolve) => {
      setTimeout(() => {
        readPendingNavWithRetry(delays.slice(1)).then(resolve);
      }, delays[0]);
    });
  });
}

/** 알림이 갈 수 있는 화면만 — 나머지 화면(관리자·소식·설교 등)에 새 세션이
 * 열렸을 때는 pendingNav가 없는 게 당연하므로 "알림 진단" 기록을 남기지
 * 않는다(그동안 그냥 탭을 오래 열어 두다 새로 켠 것뿐인 정상 동작까지도
 * 매번 '오류'로 잡혀 관리자 오류 탭을 채웠다 — /sermon 등에서 확인). */
function isNotifTargetPath(path: string): boolean {
  return (
    path === '/gratitude' ||
    path === '/alerts' ||
    path === '/pray-request' ||
    path === '/pray-inbox' ||
    path.startsWith('/verse/')
  );
}

/**
 * 서비스워커가 openWindow()/navigate()에 준 URL에 붙여둔 "이건 알림을
 * 눌러서 연 거다" 표시(?pn=1, public/firebase-messaging-sw.js 참고)를
 * 확인한다. pendingNav(IndexedDB)는 못 찾는 경합이 실기기에서 확인됐지만
 * (readPendingNavWithRetry 주석 참고), 이 값은 사파리가 실제로 열어준
 * 주소 자체에 들어 있어 그런 경합이 없다 — "사파리가 URL은 맞게 열어줬는데
 * (path는 맞음) 그걸 우리가 못 믿고 홈으로 되돌려 보내는" 사고를 pendingNav
 * 조회 결과와 무관하게 막을 수 있다. 있으면 주소에서 지우고(새로고침해도
 * 다시 안 걸리게), 이번 세션은 이미 알림으로 확인됐다고 표시해 둔다
 * (applyResumeGuard가 그 표시를 보고 건너뛴다).
 */
function consumeNotifUrlMarker(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get('pn') !== '1') return false;
  url.searchParams.delete('pn');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SESSION_BOOTED_KEY, '1');
  return true;
}

/**
 * 알림으로 온 게 아니라면(그냥 브라우저/OS가 마지막 화면을 되살린 것뿐
 * 이라면) 새 세션에서 홈이 아닌 화면, 그중에서도 ALWAYS_RESUME_PATHS·
 * isNotifTargetPath에 없는 화면으로 열렸을 때만 홈으로 보낸다.
 *
 * 알림이 갈 수 있는 화면(감사일기·알림·기도요청함·기도응답함·verse/*)은
 * pendingNav 조회 결과와 무관하게 애초에 리셋하지 않는다 — ?pn=1 URL
 * 표시(consumeNotifUrlMarker)도, pendingNav(IndexedDB) 재시도도 실기기
 * (iOS)에서 계속 타이밍이 맞지 않아 "감사일기 알림 눌렀는데 홈으로 감"이
 * 반복됐다(관리자 오류 탭 기록으로 여러 번 확인). 그 화면들은 "우연히
 * 그 화면이 떠 있던 탭을 새로 켠" 경우에 그대로 남아도 크게 헷갈리지
 * 않는 화면들이라, 애매하면 리셋하지 않는 쪽이 낫다고 판단했다.
 */
function applyResumeGuard(router: ReturnType<typeof useRouter>) {
  if (typeof sessionStorage === 'undefined') return;
  const alreadyBooted = sessionStorage.getItem(SESSION_BOOTED_KEY) === '1';
  sessionStorage.setItem(SESSION_BOOTED_KEY, '1');
  if (alreadyBooted) return; // 같은 세션 안의 새로고침 — 하던 화면 그대로 둔다

  const path = window.location.pathname;
  if (path !== '/' && !ALWAYS_RESUME_PATHS.includes(path) && !isNotifTargetPath(path)) {
    router.replace('/');
  }
}

/**
 * 알림을 눌러서 앱이 열렸을 때 목적 화면으로 이동시킨다. 알림이 아니라면
 * 새로 켠 세션인지 보고 홈으로 보낼지 판단한다(applyResumeGuard).
 *
 * 서비스워커(notificationclick)는 이제 이미 열린 창을 손으로 조작하려
 * 하지 않고 매번 clients.openWindow()만 쓴다 — 그래서 알림을 눌렀을 때
 * 이 앱이 뜨는 경우는 항상 그 목적 경로로의 진짜(브라우저 차원의) 이동
 * 이라, 이 훅은 그 경로가 애초에 "제대로 뜬 화면"인지만 판단하면 된다.
 * 유일한 예외는 사파리가 openWindow()에 준 경로를 무시하고 시작 화면
 * (홈)으로 열어버리는 경우인데 — 그 대비책으로 서비스워커가 IndexedDB에
 * 남겨둔 "가려던 경로"(pendingNav)를 부팅 시 한 번 확인해서 옮긴다.
 */
export function useNotificationNav() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // URL 자체에 "알림으로 열렸다" 표시가 있으면(consumeNotifUrlMarker 주석
    // 참고) pendingNav 조회 결과와 무관하게 이번 세션은 이미 확인된 것.
    const openedFromNotif = consumeNotifUrlMarker();
    if (openedFromNotif) return;

    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      // 알림 기능이 아예 안 되는 환경이어도 홈 이동 규칙은 그대로 적용
      applyResumeGuard(router);
      return;
    }

    let cancelled = false;
    // 부팅 시 pendingNav를 읽는다(못 찾으면 짧게 한 번 더 — 위
    // readPendingNavWithRetry 주석 참고).
    readPendingNavWithRetry().then((result) => {
      if (cancelled) return;
      if (result) {
        logClientError(
          `[알림 진단] 부팅 시 pendingNav 발견 → ${result.path} (${JSON.stringify(result.debug ?? {})})`,
        );
        if (result.path !== window.location.pathname) router.push(result.path as never);
      } else {
        applyResumeGuard(router);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
