/* eslint-disable no-undef */
/**
 * FCM 백그라운드 메시지 서비스 워커 — 데일리브레드(오늘의 말씀) 푸시 표시.
 * 앱이 닫혀 있어도 브라우저가 이 워커로 알림을 띄운다.
 */
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAd37hhPfm1GFecAxfyTQtg8GHsfuhrUJA',
  authDomain: 'tvpc-40043.firebaseapp.com',
  projectId: 'tvpc-40043',
  storageBucket: 'tvpc-40043.firebasestorage.app',
  messagingSenderId: '447584603547',
  appId: '1:447584603547:web:33ff97f4aa3cf26b7de53e',
});

firebase.messaging();

// 새 버전 서비스 워커가 앱 완전 종료를 기다리지 않고 바로 교체되게 —
// 더보기의 "앱 새로고침"만으로 알림 동작 변경까지 적용된다
self.addEventListener('install', () => self.skipWaiting());
// 이 서비스워커가 실제로 활성화될 때마다 IndexedDB(kv.swBuild)에 이 값을
// 남긴다 — iOS Safari는 홈 화면 PWA의 서비스워커 갱신이 몇 시간~며칠씩
// 늦게 반영되는 경우가 실제로 있어서(알림 문제가 여러 번 재현된 유력한
// 원인), "지금 이 기기가 실제로 어느 버전을 쓰고 있는지"를 관리자 오류
// 탭에서 직접 확인할 수 있게 해 둔다. 이 파일을 고칠 때마다 값을 올린다.
const SW_BUILD = '2026-08-19-01';
self.addEventListener('activate', (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      openDb().then(
        (db) =>
          new Promise((resolve) => {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put({ build: SW_BUILD, activatedAt: Date.now() }, 'swBuild');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          }),
      ),
    ]),
  ),
);

// tvpc-sw DB v2 — kv(가려던 경로 등 1회성 값) + notifHistory(받은 알림 기록).
// 버전을 올렸으므로 이 DB를 여는 모든 곳(여기, src/notificationNav.ts,
// src/notifHistory.ts)이 같은 버전을 써야 한다(안 그러면 VersionError).
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tvpc-sw', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('notifHistory')) {
        db.createObjectStore('notifHistory', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 앱이 완전히 닫혀 있던 상태(iOS 잠금화면 등)에서 알림을 눌러 새로
// 열릴 때 — openWindow()에 준 URL을 사파리가 무시하고 그냥
// start_url(홈)로 여는 경우가 있다(알려진 iOS PWA 제약). openWindow()만
// 믿지 않고, 가려던 경로를 IndexedDB에 남겨뒀다가 앱이 뜬 뒤 직접
// 확인해서 옮겨가게 한다(src/notificationNav.ts에서 읽음).
function setPendingNav(path, debug) {
  return openDb()
    .then(
      (db) =>
        new Promise((resolve) => {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ path, ts: Date.now(), debug: debug || null }, 'pendingNav');
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        }),
    )
    .catch(() => {});
}

// 발송 쪽(scripts/send-scheduled-push.mjs, functions/index.js)이 알림마다
// 붙이는 tag 접두어로 목적 화면을 알아낸다. FCM이 실제로 브라우저에
// 넘기는 push payload의 정확한 구조(어디에 링크가 들어있는지)는 문서화가
// 부실하고 실기기에서 확인하기도 어려워, fcmOptions.link 파싱에만 기대면
// (실제로 그랬던 것처럼) 조용히 어긋날 수 있다 — tag는 우리가 직접
// 붙인 값이라 훨씬 믿을 만해서, 아는 태그는 이걸 우선으로 쓴다.
//
// 말씀 알림(verse-YYYY-MM-DD)은 특히 — "오늘의 말씀"은 매일 바뀌므로,
// 어제 온 알림을 오늘 눌러도 /word(오늘 것)로 보내면 알림 내용과 다른
// 말씀이 뜬다. 알림에 적힌 그 날짜 그대로 보여주는 /verse/[date]로
// 보낸다 — 단, 같은 날 안에 눌렀다면(가장 흔한 경우) 평소 쓰는 말씀
// 탭(/word)으로 보낸다.
function pathFromTag(tag) {
  if (!tag) return null;
  if (tag.indexOf('verse-') === 0) {
    const date = tag.slice('verse-'.length);
    if (!date) return '/word';
    const today = new Date().toLocaleDateString('en-CA');
    return date === today ? '/word' : '/verse/' + date;
  }
  if (tag.indexOf('gratitude-') === 0) return '/gratitude';
  if (tag.indexOf('alert-') === 0) return '/alerts';
  if (tag.indexOf('pray-started-') === 0) return '/pray-request';
  if (tag.indexOf('pray-answer-') === 0) return '/pray-inbox';
  if (tag.indexOf('pray-') === 0) return '/pray-inbox';
  return null;
}

// 놓친 알림도 나중에 종 모양(알림 화면)에서 다시 볼 수 있게 — 알림이
// 도착하는 순간(앱이 닫혀 있어도) 내용을 IndexedDB에 남겨둔다. 눌렀는지,
// 화면에서 사라졌는지와 무관하게 "받았다"는 사실만으로 기록한다.
// 긴급 공지(alert-*)는 news 컬렉션에 이미 전체가 저장돼 알림 화면에서
// 그쪽으로 보여주므로 여기선 중복 저장하지 않는다(app/alerts.tsx 참고).
const NOTIF_HISTORY_MAX = 40;

function recordNotifHistory(event) {
  if (!event.data) return Promise.resolve();
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    return Promise.resolve();
  }
  const notif = (payload && payload.notification) || {};
  const title = notif.title || '';
  if (!title) return Promise.resolve();
  const tag = notif.tag || '';
  if (tag.indexOf('alert-') === 0) return Promise.resolve();
  const link =
    pathFromTag(tag) ||
    (payload.fcmOptions && payload.fcmOptions.link) ||
    (payload.notification && payload.notification.click_action) ||
    (payload.data && payload.data.link) ||
    '/';
  const item = { tag, title, body: notif.body || '', link, ts: Date.now() };

  return openDb()
    .then(
      (db) =>
        new Promise((resolve) => {
          const tx = db.transaction('notifHistory', 'readwrite');
          const store = tx.objectStore('notifHistory');
          store.add(item);
          // 너무 오래 쌓이지 않게 최근 NOTIF_HISTORY_MAX개만 남긴다
          const cursorReq = store.openCursor(null, 'prev');
          let seen = 0;
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            seen++;
            if (seen > NOTIF_HISTORY_MAX) cursor.delete();
            cursor.continue();
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        }),
    )
    .catch(() => {});
}

self.addEventListener('push', (event) => {
  event.waitUntil(recordNotifHistory(event));
});

// 알림 탭 → 알림에 지정된 화면(감사일기·기도요청함·알림 보관함 등)으로 이동.
// focus()+postMessage()+navigate()로 "이미 열린 창을 그대로 재활용"하려는
// 시도를 여러 번 보강해 봤지만(포커스만 되고 화면은 안 바뀜, 멈춰 있던
// 탭이 메시지를 놓침 등) 실기기(iOS)에서 계속 조금씩 다르게 실패했다 —
// "눌렀는데 마지막 보던 화면 그대로"라는 신고가 그 결과다. 더 정교하게
// 다듬는 대신, 아예 매번 clients.openWindow()만 쓰기로 했다 — 이미 열려
// 있는 창이 있어도 openWindow()는 OS 차원의 "그 앱을 이 주소로 열기"
// 경로를 타서, 우리가 손으로 흉내 낸 focus/postMessage/navigate 조합보다
// 훨씬 잘 먹힌다(경로 자체는 실기기에서 여러 번 정확히 열리는 게 이미
// 확인됐다 — 안 되던 건 "이미 켜진 탭을 그 자리에서 이동시키는" 부분).
// 이미 설치된 PWA(홈 화면 앱)는 openWindow()가 새 창을 또 띄우는 대신
// 기존 앱을 그 주소로 가져온다 — 여러 개로 안 늘어난다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const msg = event.notification && event.notification.data && event.notification.data.FCM_MSG;
  // event.notification.tag는 실제로 화면에 띄운 알림 자체의 값이라
  // FCM_MSG 파싱보다 확실하다 — 아는 태그면 이걸 우선으로 쓴다.
  const tag = (event.notification && event.notification.tag) || '';
  const rawLink =
    pathFromTag(tag) ||
    (msg && msg.fcmOptions && msg.fcmOptions.link) ||
    (msg && msg.notification && msg.notification.click_action) ||
    '/';
  let path = '/';
  let absoluteLink = self.location.origin + '/';
  try {
    const u = /^https?:/i.test(rawLink) ? new URL(rawLink) : new URL(rawLink, self.location.origin);
    path = u.pathname || '/';
    // 이 열기가 알림을 눌러서 난 것임을 표시하는 물음표 매개변수 —
    // pendingNav(IndexedDB)를 못 찾는 경합이 있어도(src/notificationNav.ts
    // 쪽 주석 참고), openWindow()가 준 URL 자체를 사파리가 그대로 열어줬다면
    // 이 값만으로 "알림으로 열렸다"를 확실히 알 수 있다. (실기기에서 이
    // 매개변수만 사라지고 경로는 남는 사례도 있었지만, 경로 자체가 이미
    // 목적 화면과 같으므로 그 경우도 결과적으로 문제없다.)
    u.searchParams.set('pn', '1');
    absoluteLink = u.href;
  } catch (e) {}
  event.waitUntil(
    (path !== '/' ? setPendingNav(path, { tag: tag, rawLink: rawLink }) : Promise.resolve()).then(
      () => clients.openWindow(absoluteLink),
    ),
  );
});
