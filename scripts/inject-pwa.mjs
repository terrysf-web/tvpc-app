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
// iOS 사파리가 입력창 포커스 때 화면을 자동 확대하고 되돌리지 않는 문제 방지.
// (iOS 10+에서는 maximum-scale이 있어도 손가락 확대는 계속 가능)
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />',
);
html = html.replace('</head>', `${TAGS}</head>`);
writeFileSync(FILE, html);
console.log('PWA 태그 주입 완료');
