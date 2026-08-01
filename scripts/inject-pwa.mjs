/**
 * 웹 익스포트(dist/index.html)에 PWA(홈 화면에 추가) 메타태그 주입.
 * expo의 single 출력 모드는 커스텀 HTML 셸(+html.tsx)을 지원하지 않아
 * 빌드 후에 삽입한다. npm run deploy:web / CI 배포에서 자동 실행.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'dist/index.html';

const TAGS = `
    <meta name="description" content="매일 말씀, 설교, 교회 소식, 기도요청 — 트라이밸리 장로교회 (Tri-Valley Presbyterian Church)" />
    <meta name="theme-color" content="#1E5AA8" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=3" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=3" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="TVPC" />
`;

let html = readFileSync(FILE, 'utf8');
if (html.includes('apple-touch-icon')) {
  console.log('PWA 태그가 이미 있습니다 — 건너뜀');
  process.exit(0);
}
html = html.replace('<html lang="en"', '<html lang="ko"');
// 손가락 확대를 막지 않는다(접근성 감사 지적) — 입력창 글자는 16px 이상이라
// iOS 사파리가 포커스 때 자동 확대하지도 않는다.
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />',
);
// 분할 글꼴(필요한 글자 범위만 내려받음) + 자주 쓰는 서버 미리 연결
const HEAD_EXTRA = [
  '<link rel="preconnect" href="https://firestore.googleapis.com" crossorigin />',
  '<link rel="preconnect" href="https://www.gstatic.com" crossorigin />',
  '<link rel="stylesheet" href="/fonts/pretendard.css" />',
  '<link rel="stylesheet" href="/fonts/nanum-brush.css" />',
].join('');
html = html.replace('</head>', `${HEAD_EXTRA}</head>`);
html = html.replace('</head>', `${TAGS}</head>`);
writeFileSync(FILE, html);
console.log('PWA 태그 주입 완료');
