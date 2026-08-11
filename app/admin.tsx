import React, { Suspense, lazy } from 'react';
import { RouteFallback } from '../src/components/RouteFallback';

// 관리자 화면은 코드가 커서(1500줄+) 일반 교인은 절대 안 받도록 별도
// 번들로 분리 — 이 화면을 열 때만 내려받는다. 성능 최적화 참고.
const AdminScreen = lazy(() => import('../src/screens/AdminScreen'));

export default function Admin() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <AdminScreen />
    </Suspense>
  );
}
