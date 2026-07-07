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
 */
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyAd37hhPfm1GFecAxfyTQtg8GHsfuhrUJA',
  authDomain: 'tvpc-40043.firebaseapp.com',
  projectId: 'tvpc-40043',
  storageBucket: 'tvpc-40043.firebasestorage.app',
  messagingSenderId: '447584603547',
  appId: '1:447584603547:web:33ff97f4aa3cf26b7de53e',
};
