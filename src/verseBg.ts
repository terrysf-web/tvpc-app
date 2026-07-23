/**
 * 시간대별 말씀카드 기본 배경 — 인사말과 같은 구분을 쓴다.
 * 새벽·저녁·밤은 어두운 그림이라 흰 글씨, 아침·오후는 밝은 그림이라
 * 진한 남색 글씨가 어울린다 (dark 플래그로 화면에서 분기).
 */
export function verseBg(): { uri: string; dark: boolean } {
  const h = new Date().getHours();
  const slot =
    h < 6 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 20 ? 'evening' : 'night';
  return {
    uri: `/verse-bg-${slot}.jpg`,
    dark: slot === 'dawn' || slot === 'evening' || slot === 'night',
  };
}
