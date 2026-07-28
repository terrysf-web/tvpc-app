/**
 * 말씀카드 배경 한 장 → 시간대별 5종 생성.
 *
 * IMAGE_URL의 그림(밝은 낮 풍경)을 받아 색감을 입혀 만든다:
 *   morning   원본 (살짝 화사하게)
 *   afternoon 따뜻한 햇살
 *   dawn      해돋이 — 수평선 여명 + 떠오르는 해
 *   evening   노을 — 주황·분홍으로 물들임
 *   night     밤 — 어두운 파랑 + 달과 별
 *
 * 결과는 public/verse-bg-{slot}.jpg 로 저장된다.
 * 사용: IMAGE_URL=https://... node scripts/grade-verse-bg.mjs
 */
import sharp from 'sharp';

const W = 1600;
const H = 730;

const url = process.env.IMAGE_URL;
if (!url) {
  console.error('IMAGE_URL 환경변수가 필요합니다.');
  process.exit(1);
}

console.log(`다운로드: ${url}`);
const res = await fetch(url, {
  headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
});
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}
const src = Buffer.from(await res.arrayBuffer());

/** 카드 비율로 잘라 리사이즈한 기본 판 */
const base = await sharp(src).resize(W, H, { fit: 'cover' }).toBuffer();

const svgOverlay = (inner) =>
  Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);

// 아침 — 원본을 살짝 화사하게
await sharp(base)
  .modulate({ brightness: 1.04, saturation: 1.08 })
  .jpeg({ quality: 88 })
  .toFile('public/verse-bg-morning.jpg');
console.log('✓ morning');

// 오후 — 따뜻한 햇살 (연한 금빛 오버레이 + 오른쪽 위 햇살)
await sharp(base)
  .modulate({ brightness: 1.03, saturation: 1.12 })
  .composite([
    {
      input: svgOverlay(`
        <rect width="${W}" height="${H}" fill="#FFD98A" opacity="0.10"/>
        <radialGradient id="s" cx="0.8" cy="0.15" r="0.5">
          <stop offset="0" stop-color="#FFF3C2" stop-opacity="0.55"/>
          <stop offset="0.6" stop-color="#FFF3C2" stop-opacity="0"/>
        </radialGradient>
        <rect width="${W}" height="${H}" fill="url(#s)"/>`),
      blend: 'over',
    },
  ])
  .jpeg({ quality: 88 })
  .toFile('public/verse-bg-afternoon.jpg');
console.log('✓ afternoon');

// 새벽 — 해돋이: 하늘을 새벽빛으로, 수평선(약 62%)에서 해가 떠오름
await sharp(base)
  .modulate({ brightness: 0.9, saturation: 0.9 })
  .composite([
    {
      input: svgOverlay(`
        <linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3D4C7E" stop-opacity="0.55"/>
          <stop offset="0.45" stop-color="#8A6E8C" stop-opacity="0.32"/>
          <stop offset="0.72" stop-color="#F5B478" stop-opacity="0.3"/>
          <stop offset="1" stop-color="#2E3A5C" stop-opacity="0.4"/>
        </linearGradient>
        <rect width="${W}" height="${H}" fill="url(#d)"/>
        <radialGradient id="g" cx="0.86" cy="0.14" r="0.6">
          <stop offset="0" stop-color="#FFE2B4" stop-opacity="0.45"/>
          <stop offset="0.45" stop-color="#FFCD96" stop-opacity="0.14"/>
          <stop offset="1" stop-color="#FFCD96" stop-opacity="0"/>
        </radialGradient>
        <rect width="${W}" height="${H}" fill="url(#g)"/>`),
      blend: 'over',
    },
  ])
  .jpeg({ quality: 88 })
  .toFile('public/verse-bg-dawn.jpg');
console.log('✓ dawn (여명)');

// 저녁 — 노을
await sharp(base)
  .modulate({ brightness: 0.86, saturation: 1.06 })
  .composite([
    {
      input: svgOverlay(`
        <linearGradient id="e" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#4A4478" stop-opacity="0.5"/>
          <stop offset="0.45" stop-color="#B06188" stop-opacity="0.34"/>
          <stop offset="0.78" stop-color="#E8834C" stop-opacity="0.34"/>
          <stop offset="1" stop-color="#6E3A30" stop-opacity="0.46"/>
        </linearGradient>
        <rect width="${W}" height="${H}" fill="url(#e)"/>
        <radialGradient id="g" cx="0.86" cy="0.16" r="0.62">
          <stop offset="0" stop-color="#FFD79A" stop-opacity="0.5"/>
          <stop offset="0.45" stop-color="#FFB46E" stop-opacity="0.16"/>
          <stop offset="1" stop-color="#FFB46E" stop-opacity="0"/>
        </radialGradient>
        <rect width="${W}" height="${H}" fill="url(#g)"/>`),
      blend: 'over',
    },
  ])
  .jpeg({ quality: 88 })
  .toFile('public/verse-bg-evening.jpg');
console.log('✓ evening (노을)');

// 밤 — 밝기를 낮추고 푸른 달빛 색조를 입힌다 (달·별은 그리지 않는다)
const { data: nd } = await sharp(base).resize(64, 32).raw().toBuffer({ resolveWithObject: true });
let nsum = 0;
for (let i = 0; i < nd.length; i += 3) {
  nsum += 0.299 * nd[i] + 0.587 * nd[i + 1] + 0.114 * nd[i + 2];
}
const nightF = Math.max(0.5, Math.min(0.95, 62 / Math.max(1, nsum / (nd.length / 3))));
await sharp(base)
  .modulate({ brightness: nightF, saturation: 0.55 })
  .linear(0.92, 14)
  .tint({ r: 150, g: 178, b: 235 })
  .composite([
    {
      input: svgOverlay(`
        <rect width="${W}" height="${H}" fill="#0E1E44" opacity="0.34"/>
        <radialGradient id="m" cx="0.7" cy="0.1" r="0.62">
          <stop offset="0" stop-color="#CFE2FF" stop-opacity="0.3"/>
          <stop offset="0.45" stop-color="#B9D0F5" stop-opacity="0.105"/>
          <stop offset="1" stop-color="#B9D0F5" stop-opacity="0"/>
        </radialGradient>
        <rect width="${W}" height="${H}" fill="url(#m)"/>
        <linearGradient id="nv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stop-color="#060D22" stop-opacity="0.08"/>
          <stop offset="1" stop-color="#060D22" stop-opacity="0.34"/>
        </linearGradient>
        <rect width="${W}" height="${H}" fill="url(#nv)"/>`),
      blend: 'over',
    },
  ])
  .jpeg({ quality: 88 })
  .toFile('public/verse-bg-night.jpg');
console.log('✓ night (달빛)');

console.log('완료 — public/verse-bg-*.jpg 5종 생성');
