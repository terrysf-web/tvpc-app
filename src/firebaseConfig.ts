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
export const firebaseConfig: FirebaseOptions | null = null;

// 예시:
// export const firebaseConfig: FirebaseOptions | null = {
//   apiKey: 'AIza...',
//   authDomain: 'tvpc-app.firebaseapp.com',
//   projectId: 'tvpc-app',
//   storageBucket: 'tvpc-app.firebasestorage.app',
//   messagingSenderId: '1234567890',
//   appId: '1:1234567890:web:abcdef',
// };
