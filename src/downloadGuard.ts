/**
 * 이미지 다운로드 방지 — 웹 전체에 적용.
 *
 * 브라우저는 스크린샷을 막는 기능을 아예 제공하지 않는다(OS 영역이라
 * 자바스크립트가 손댈 수 없음). 여기서 할 수 있는 건 '길게 눌러 저장',
 * '우클릭으로 이미지 저장', '드래그해서 저장' 같은 손쉬운 경로를
 * 막는 정도 — 완벽한 차단은 아니고, 마음먹고 개발자도구를 쓰면 우회된다.
 */
import { Platform } from 'react-native';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    img, canvas {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-user-drag: none;
    }
  `;
  document.head.appendChild(style);

  const isMedia = (t: EventTarget | null) => {
    const tag = (t as HTMLElement | null)?.tagName;
    return tag === 'IMG' || tag === 'CANVAS';
  };

  document.addEventListener('contextmenu', (e) => {
    if (isMedia(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => {
    if (isMedia(e.target)) e.preventDefault();
  });
}
