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
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// 앱이 완전히 닫혀 있던 상태(iOS 잠금화면 등)에서 알림을 눌러 새로
// 열릴 때 — openWindow()에 준 URL을 사파리가 무시하고 그냥
// start_url(홈)로 여는 경우가 있다(알려진 iOS PWA 제약). openWindow()만
// 믿지 않고, 가려던 경로를 IndexedDB에 남겨뒀다가 앱이 뜬 뒤 직접
// 확인해서 옮겨가게 한다(src/notificationNav.ts에서 읽음).
function setPendingNav(path) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('tvpc-sw', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ path, ts: Date.now() }, 'pendingNav');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

// 알림 탭 → 알림에 지정된 화면(감사일기·기도요청함·알림 보관함 등)으로 이동.
// 이미 열린 앱 창이 있으면 포커스 후 그 화면으로, 없으면(앱이 완전히
// 닫혀 있던 상태 — 잠금화면에서 바로 누른 경우 등) 새로 연다.
//
// 이미 열린 창이 있을 때는 postMessage로 앱(_layout.tsx)에 이동할 경로를
// 알려서 라우터로 이동시키는 게 주 방법이다 — WindowClient.navigate()는
// 사파리(특히 iOS 홈화면에 설치한 PWA)에서 안 먹히는 경우가 있어(포커스만
// 되고 화면은 안 바뀜) 그것만 믿으면 "눌러도 안 열린다"는 문제가 생긴다.
// navigate()도 되면 되는 대로 같이 시도 — 안 되면 그냥 무시된다.
//
// 새로 열 때(openWindow)와 navigate()는 상대경로 대신 절대 URL을
// 넘긴다 — 사파리에서 상대경로 처리가 불안정한 경우가 있었다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const msg = event.notification && event.notification.data && event.notification.data.FCM_MSG;
  const rawLink =
    (msg && msg.fcmOptions && msg.fcmOptions.link) ||
    (msg && msg.notification && msg.notification.click_action) ||
    '/';
  let path = '/';
  let absoluteLink = self.location.origin + '/';
  try {
    if (/^https?:/i.test(rawLink)) {
      const u = new URL(rawLink);
      path = u.pathname || '/';
      absoluteLink = u.href;
    } else {
      path = rawLink;
      absoluteLink = new URL(rawLink, self.location.origin).href;
    }
  } catch (e) {}
  event.waitUntil(
    (path !== '/' ? setPendingNav(path) : Promise.resolve()).then(() =>
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const c of list) {
          if ('focus' in c) {
            const p = c.focus();
            if (path !== '/') {
              if ('postMessage' in c) c.postMessage({ type: 'tvpc-navigate', path });
              if ('navigate' in c) {
                return Promise.resolve(p).then(() => c.navigate(absoluteLink)).catch(() => {});
              }
            }
            return p;
          }
        }
        return clients.openWindow(absoluteLink);
      }),
    ),
  );
});
