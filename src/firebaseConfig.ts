import type { FirebaseOptions } from 'firebase/app';

/**
 * Firebase 프로젝트 설정 (무료 Spark 요금제로 충분합니다).
 *
 * 설정 방법:
 *  1. https://console.firebase.google.com 에서 프로젝트 생성
 *  2. 웹 앱 추가 후 표시되는 firebaseConfig 값을 아래에 붙여넣기
 *  3. Firestore Database 활성화(프로덕션 모드) + Authentication에서 익명 로그인 활성화
 *  4. `npm run seed` 로 샘플 데이터 업로드 (선택)
 *
 * null이면 앱은 번들 샘플 데이터로 동작합니다 (데모 모드).
 *
 * measurementId — "지금 몇 명이 접속했는지"(구글 애널리틱스 실시간 리포트)를
 * 보려면 필요. Firebase 콘솔 → 프로젝트 설정 → 통합 탭에서 Google
 * 애널리틱스를 연결한 뒤, 프로젝트 설정 → 일반 탭 → 이 웹 앱의 SDK 설정에서
 * "G-"로 시작하는 값을 복사해 아래에 추가하면 자동으로 켜진다(src/firebase.ts
 * 참고). 없으면 그냥 애널리틱스만 꺼진 채로 나머지는 그대로 동작한다.
 */
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyAd37hhPfm1GFecAxfyTQtg8GHsfuhrUJA',
  authDomain: 'tvpc-40043.firebaseapp.com',
  projectId: 'tvpc-40043',
  storageBucket: 'tvpc-40043.firebasestorage.app',
  messagingSenderId: '447584603547',
  appId: '1:447584603547:web:33ff97f4aa3cf26b7de53e',
  // measurementId: 'G-XXXXXXXXXX',
};
