import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * 서비스워커(firebase-messaging-sw.js)를 앱을 열 때마다 최신인지 확인한다.
 *
 * 지금까지는 알림을 "켤 때"(src/push.ts의 toggle)만 등록해서, 이미
 * 알림을 켜둔 사람은 그 뒤로 서비스워커가 다시 등록되거나 갱신 확인이
 * 될 일이 전혀 없었다 — 브라우저가 알아서 가끔(스펙상 24시간에 한 번
 * 정도, 실제로는 더 들쭉날쭉) 확인해 줄 뿐이었다. 그래서 서비스워커
 * 쪽 버그를 고쳐 배포해도 실기기에 반영되기까지 하루 이상 걸리거나,
 * "앱 새로고침"을 여러 번 해도 안 되던 걸로 보인다(알림 관련 문제가
 * 여러 번 재현된 이유로 가장 유력).
 *
 * getRegistration()은 새로 등록하지 않고 "이미 있으면" 그 등록에
 * update()만 호출한다 — 등록이 없으면(알림을 한 번도 안 켠 기기) 아무
 * 일도 안 한다.
 */
export function useServiceWorkerUpdate() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    navigator.serviceWorker
      .getRegistration('/firebase-messaging-sw.js')
      .then((reg) => reg?.update())
      .catch(() => {});
  }, []);
}
