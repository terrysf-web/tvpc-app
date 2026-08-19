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
 * 1) 이미 열려 있던 창이었다면 — 서비스워커가 postMessage로 보내주는
 *    경로를 받아 라우터로 옮긴다. WindowClient.navigate()만 믿으면
 *    사파리(특히 iOS 홈화면에 설치한 PWA)에서 포커스만 되고 화면은 안
 *    바뀌는 경우가 있어("눌러도 안 열린다") — 이쪽이 훨씬 확실하다.
 * 2) 앱이 완전히 닫혀 있다가 알림으로 새로 열린 거라면 — 서비스워커가
 *    IndexedDB에 남겨둔 "가려던 경로"를 앱이 뜨자마자 확인해서 옮긴다
 *    (openWindow()가 준 URL을 사파리가 무시하고 시작 화면으로 여는
 *    경우의 대비책).
 * 3) 앱이 완전히 닫힌 것도, 멀쩡히 떠 있던 것도 아닌 애매한 상태 —
 *    한참 백그라운드에 있다가(iOS가 화면은 꺼두고 멈춰만 둔 상태)
 *    알림을 눌러 되살아난 경우 — 도 있다. 이때는 서비스워커가 매칭되는
 *    창을 찾아 postMessage를 보내긴 하지만, 멈춰 있던 페이지가 완전히
 *    되살아나기 전에 메시지가 씹혀 화면이 안 바뀌는 경우가 있었다
 *    ("눌렀는데 마지막에 보던 화면 그대로"). postMessage 하나만 믿지
 *    않고, 화면이 다시 보이는 시점(visibilitychange·focus)마다 2)의
 *    "가려던 경로"를 한 번 더 확인해서 옮긴다 — 이미 다 옮겨간
 *    뒤라면(현재 경로와 같으면) 아무 일도 안 한다.
 */
export function useNotificationNav() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // URL 자체에 "알림으로 열렸다" 표시가 있으면(consumeNotifUrlMarker 주석
    // 참고) pendingNav 조회 결과와 무관하게 이번 세션은 이미 확인된 것 —
    // 아래 부팅 시 pendingNav 조회·resume guard를 건너뛴다(그래도 이
    // 탭이 열려 있는 동안 또 알림을 받을 수 있으니 리스너들은 그대로 붙인다).
    const openedFromNotif = consumeNotifUrlMarker();

    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      // 알림 기능이 아예 안 되는 환경이어도 홈 이동 규칙은 그대로 적용
      if (!openedFromNotif) applyResumeGuard(router);
      return;
    }

    let cancelled = false;

    const checkPendingNav = (source: string) => {
      readPendingNavWithRetry().then((result) => {
        if (result && result.path !== window.location.pathname) {
          logClientError(
            `[알림 진단] ${source}에서 pendingNav 발견 → ${result.path}로 이동 (${JSON.stringify(result.debug ?? {})})`,
          );
          router.push(result.path as never);
        }
      });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkPendingNav('visibilitychange');
    };
    const onFocus = () => checkPendingNav('focus');
    // bfcache(뒤로/앞으로 캐시)에서 되살아날 때는 visibilitychange 대신
    // pageshow만 오는 경우가 있어(사파리에서 특히) 같이 잡아둔다
    const onPageShow = () => checkPendingNav('pageshow');

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | undefined;
      if (data?.type === 'tvpc-navigate' && data.path) {
        logClientError(`[알림 진단] postMessage로 ${data.path} 수신`);
        router.push(data.path as never);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    // visibilitychange·focus·pageshow는 iOS가 "화면은 꺼두고 멈춰만 둔"
    // 페이지를 되살릴 때 아예 안 오는 경우가 실기기에서 확인됐다("감사일기
    // 알림 눌렀는데 마지막에 보던 화면 그대로" — 이벤트 자체가 없으니
    // checkPendingNav도 안 불림). 이벤트에만 기대지 않고, 이 탭이 열려
    // 있는 동안은 몇 초마다 pendingNav를 한 번씩 직접 들여다본다 —
    // IndexedDB 조회 하나뿐이라 배터리·성능 부담은 무시할 만하고, 페이지가
    // 실제로 멈춰 있는 동안은 타이머 자체가 못 돌다가 되살아나는 순간
    // 다음 tick에 바로 잡힌다.
    const POLL_INTERVAL_MS = 4000;
    let pollId: ReturnType<typeof setInterval> | undefined;

    const attachRecheckListeners = () => {
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onFocus);
      window.addEventListener('pageshow', onPageShow);
      pollId = setInterval(() => checkPendingNav('poll'), POLL_INTERVAL_MS);
    };

    if (openedFromNotif) {
      // URL의 알림 표시로 이미 확인됐다 — pendingNav 조회·resume guard 없이
      // 바로 이후(이 탭이 열려 있는 동안 또 받을 알림 대비) 리스너만 붙인다.
      attachRecheckListeners();
    } else {
      // 부팅 시 pendingNav를 읽는다(못 찾으면 짧게 한 번 더 — 위
      // readPendingNavWithRetry 주석 참고). visibilitychange·focus·
      // pageshow 리스너는 이 확인이 끝난 뒤에야 붙인다 — 알림을 눌러 앱이
      // 막 뜨는 순간엔 이 이벤트들도 거의 동시에 발생하는데, 다 같은
      // readAndClearPendingNav를 동시에 부르면(한쪽은 값을 읽어 지우고
      // 다른 쪽은 이미 지워진 뒤라 못 읽는 경합) 부팅 쪽이 늦게 resolve될
      // 경우 "알림이 아니다"로 오판해 applyResumeGuard가 이미 옮겨간 화면을
      // 홈으로 되돌려 보내는 사고가 났다("말씀 알림 눌렀는데 홈으로 감").
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
        attachRecheckListeners();
      });
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      if (pollId != null) clearInterval(pollId);
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
