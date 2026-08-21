import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * 서비스워커(firebase-messaging-sw.js)를 앱을 열 때마다 최신인지 확인하고,
 * 새 버전이 실제로 자리를 넘겨받으면(controllerchange) 자동으로
 * 새로고침해서 사람이 손으로 지웠다 다시 설치하지 않아도 바로 반영되게
 * 한다.
 *
 * 지금까지는 알림을 "켤 때"(src/push.ts의 toggle)만 등록해서, 이미
 * 알림을 켜둔 사람은 그 뒤로 서비스워커가 다시 등록되거나 갱신 확인이
 * 될 일이 전혀 없었다 — 브라우저가 알아서 가끔(스펙상 24시간에 한 번
 * 정도, 실제로는 더 들쭉날쭉) 확인해 줄 뿐이었다. update()로 확인은
 * 했지만, 새 버전이 설치·활성화돼도(우리 서비스워커는 install에서
 * skipWaiting(), activate에서 clients.claim()을 이미 부르므로 금방
 * 그렇게 된다) 그걸 "지금 이 화면에도 반영"하는 동작이 없어서 —
 * "앱 새로고침"을 여러 번 눌러도 실기기에 안 바뀌던 문제(알림 관련
 * 문제가 여러 번 재현된 이유로 가장 유력)로 이어졌다. controllerchange
 * (이 페이지를 통제하는 서비스워커가 실제로 새 걸로 바뀐 순간)를
 * 지켜보다 한 번 새로고침하면, 이제 사람이 신경 쓰지 않아도 앱을 열 때
 * 마다 최신 버전으로 저절로 맞춰진다.
 *
 * getRegistration()은 새로 등록하지 않고 "이미 있으면" 그 등록에
 * update()만 호출한다 — 등록이 없으면(알림을 한 번도 안 켠 기기) 아무
 * 일도 안 한다. 처음 등록되는 순간(원래 컨트롤러가 없던 페이지)까지
 * 새로고침하면 불필요하니, 이미 컨트롤러가 있던 경우(=진짜 갱신)에만
 * 반응한다.
 */
export function useServiceWorkerUpdate() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .getRegistration('/firebase-messaging-sw.js')
      .then((reg) => reg?.update())
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
}
