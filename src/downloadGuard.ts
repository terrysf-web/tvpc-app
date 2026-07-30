/**
 * 이미지 다운로드·글자 복사 방지 — 웹 전체에 적용.
 *
 * 브라우저는 스크린샷을 막는 기능을 아예 제공하지 않는다(OS 영역이라
 * 자바스크립트가 손댈 수 없음). 여기서 할 수 있는 건 '길게 눌러 저장',
 * '우클릭으로 저장·복사', '드래그해서 저장' 같은 손쉬운 경로를 막는
 * 정도 — 완벽한 차단은 아니고, 마음먹고 개발자도구를 쓰면 우회된다.
 *
 * 입력창(주소·전화번호를 복사해 쓰는 경우, 관리자 입력 등)은 그대로
 * 선택·복사가 되게 남겨둔다.
 */
import { Platform } from 'react-native';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    body {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    img, canvas {
      -webkit-user-drag: none;
    }
    input, textarea, [contenteditable="true"] {
      -webkit-user-select: text;
      user-select: text;
    }
  `;
  document.head.appendChild(style);

  const isEditable = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    const tag = el?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || !!el?.isContentEditable;
  };
  const isMedia = (t: EventTarget | null) => {
    const tag = (t as HTMLElement | null)?.tagName;
    return tag === 'IMG' || tag === 'CANVAS';
  };

  // 입력창 위에서는 평소처럼 우클릭(붙여넣기 등)을 쓸 수 있게 둔다
  document.addEventListener('contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => {
    if (isMedia(e.target)) e.preventDefault();
  });
}
