import React, { Suspense, lazy } from 'react';
import { RouteFallback } from '../src/components/RouteFallback';

// 주보 화면은 코드가 커서(1800줄+) 별도 번들로 분리 — 이 화면을 열 때만
// 내려받는다. 성능 최적화 참고.
const BulletinScreen = lazy(() => import('../src/screens/BulletinScreen'));

export default function Bulletin() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <BulletinScreen />
    </Suspense>
  );
}
