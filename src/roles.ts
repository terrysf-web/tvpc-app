/**
 * 화면에서 "누구에게만 보일지" 판단할 때 쓰는 기준.
 *
 * 쓰기 권한 자체는 보안 규칙(firestore.rules)이 막는다 — 여기 값은 단추를
 * 보여줄지 말지 같은 표시용이다.
 */

/** 개발·점검 계정 — 관리자 화면의 모든 탭과 일부 도구가 이 계정에만 보인다 */
export const OWNER_EMAIL = 'terrysf@gmail.com';

/** 설교 파일 내려받기처럼 목회자와 점검 계정에게만 보여줄 것들 */
export function canManageSermonAudio(
  email: string | null,
  role: 'pastor' | 'admin' | null,
): boolean {
  return role === 'pastor' || email === OWNER_EMAIL;
}
