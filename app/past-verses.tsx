import { Redirect } from 'expo-router';
import React from 'react';

/**
 * 지난 새벽설교는 설교 탭의 "새벽설교"로 옮겼다 — 설교를 한곳에서 찾도록
 * (주일설교 · 새벽설교 · 팟캐스트). 예전 주소로 들어오면 그리로 보낸다.
 */
export default function PastVersesScreen() {
  return <Redirect href="/sermon" />;
}
