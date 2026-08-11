import React, { Suspense, lazy } from 'react';
import { RouteFallback } from '../src/components/RouteFallback';

// 교우 앨범 화면은 별도 번들로 분리 — 이 화면을 열 때만 내려받는다.
// 성능 최적화 참고.
const AlbumScreen = lazy(() => import('../src/screens/AlbumScreen'));

export default function Album() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <AlbumScreen />
    </Suspense>
  );
}
