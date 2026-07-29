/**
 * 말씀·주일 카드 배경을 시간대 5종으로 변환해 Firestore에 저장한다.
 *
 * 관리자 화면에서 버튼을 누르면 브라우저가 같은 일을 하지만, 규칙이 바뀌었을 때
 * 서버에서 한 번에 다시 만들기 위한 도구다. 이미 올려둔 그림을 쓰므로
 * 다시 올릴 필요가 없다.
 *
 *   verseBg/original      → verseBg/{slot}          (평일 말씀카드)
 *   verseBg/sunday        → verseBg/sunday-{slot}   (주일·월요일 카드)
 *
 * 시간대는 새벽·아침·오후·저녁·밤 다섯이고, 해·달 모양을 그리지 않고
 * 빛과 색만 입힌다(사진 위에 붙인 티가 나지 않게).
 *
 * 필요 시크릿: FIREBASE_SERVICE_ACCOUNT
 * 사용: TARGET=both|weekday|sunday node scripts/grade-bg-firestore.mjs
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import sharp from 'sharp';

const W = 1600;
const H = 730;
const SLOTS = ['dawn', 'morning', 'afternoon', 'evening', 'night'];
const LABEL = {
  dawn: '새벽(여명)',
  morning: '아침',
  afternoon: '오후(햇살)',
  evening: '저녁(노을)',
  night: '밤(달빛)',
};

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const svg = (inner) =>
  Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);

/** 그림의 평균 밝기(0~255) */
async function lumOf(buf) {
  const { data } = await sharp(buf).resize(64, 32).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += 3) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 3);
}

/**
 * 한 시간대 그림 만들기 — 원본 판(base)에 빛과 색만 입힌다.
 * 밤은 원본이 이미 어두우면 덜 누른다(그러지 않으면 무슨 그림인지 안 보인다).
 */
function gradeSlot(base, slot, srcLum = 140) {
  if (slot === 'morning') {
    return sharp(base).modulate({ brightness: 1.04, saturation: 1.08 });
  }
  if (slot === 'afternoon') {
    return sharp(base)
      .modulate({ brightness: 1.03, saturation: 1.12 })
      .composite([
        {
          input: svg(`
            <rect width="${W}" height="${H}" fill="#FFD98A" opacity="0.10"/>
            <radialGradient id="s" cx="0.8" cy="0.15" r="0.5">
              <stop offset="0" stop-color="#FFF3C2" stop-opacity="0.55"/>
              <stop offset="0.6" stop-color="#FFF3C2" stop-opacity="0"/>
            </radialGradient>
            <rect width="${W}" height="${H}" fill="url(#s)"/>`),
          blend: 'over',
        },
      ]);
  }
  if (slot === 'dawn') {
    return sharp(base)
      .modulate({ brightness: 0.92, saturation: 0.94 })
      .composite([
        {
          input: svg(`
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
      ]);
  }
  if (slot === 'evening') {
    return sharp(base)
      .modulate({ brightness: 0.86, saturation: 1.06 })
      .composite([
        {
          input: svg(`
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
      ]);
  }
  // 밤 — 밝기를 낮추고 푸른 달빛 색조를 입힌다. 색조 없이 어둡게만 하면
  // 검은 판이 되고, 색조 없이 밝게 두면 낮처럼 보인다.
  const f = Math.max(0.48, Math.min(0.95, 62 / Math.max(1, srcLum)));
  return sharp(base)
    .modulate({ brightness: f, saturation: 0.54 })
    .linear(0.91, 15) // 대비를 살짝 낮추고 어두운 부분을 들어 형태를 남긴다
    .tint({ r: 145, g: 173, b: 232 })
    .composite([
      {
        input: svg(`
          <defs>
            <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#E6F1FF" stop-opacity="0.34"/>
              <stop offset="0.5" stop-color="#CFE2FF" stop-opacity="0.153"/>
              <stop offset="1" stop-color="#CFE2FF" stop-opacity="0"/>
            </linearGradient>
            <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="26"/>
            </filter>
          </defs>
          <rect width="${W}" height="${H}" fill="#0C1B3E" opacity="0.33"/>
          <radialGradient id="m" cx="0.7" cy="0.08" r="0.5">
            <stop offset="0" stop-color="#DCEBFF" stop-opacity="0.34"/>
            <stop offset="0.45" stop-color="#B9D0F5" stop-opacity="0.12"/>
            <stop offset="1" stop-color="#B9D0F5" stop-opacity="0"/>
          </radialGradient>
          <rect width="${W}" height="${H}" fill="url(#m)"/>
          <!-- 달빛 줄기 — 위쪽 배지와 본문 글씨 사이를 지나 아래로 퍼진다.
               흐리게 번지게 해서 그려 넣은 물건이 아니라 빛으로 보이게 한다 -->
          <polygon points="${0.63 * W},0 ${0.73 * W},0 ${0.93 * W},${0.62 * H} ${0.45 * W},${0.62 * H}"
                   fill="url(#beam)" filter="url(#soft)"/>
          <linearGradient id="nv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.5" stop-color="#060D22" stop-opacity="0.06"/>
            <stop offset="1" stop-color="#060D22" stop-opacity="0.34"/>
          </linearGradient>
          <rect width="${W}" height="${H}" fill="url(#nv)"/>`),
        blend: 'over',
      },
    ]);
}

/** 글씨 색 판단 — 어두우면 흰 글씨 */
async function isDark(buf) {
  const { data } = await sharp(buf).resize(64, 32).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += 3) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 3) < 115;
}

/** Firestore 문서 1MB 한도 아래로 맞춘 data URL */
async function toDataUrl(pipe) {
  for (const q of [82, 70, 58, 46]) {
    const buf = await pipe.clone().jpeg({ quality: q }).toBuffer();
    const url = `data:image/jpeg;base64,${buf.toString('base64')}`;
    if (url.length < 900_000) return { url, buf };
  }
  const buf = await pipe.clone().resize(1200).jpeg({ quality: 60 }).toBuffer();
  return { url: `data:image/jpeg;base64,${buf.toString('base64')}`, buf };
}

/** 원본 문서에서 그림 읽기 */
async function readSource(docId) {
  const snap = await db.doc(`verseBg/${docId}`).get();
  const img = snap.exists ? String(snap.get('image') ?? '') : '';
  if (!img.startsWith('data:image')) return null;
  return Buffer.from(img.split(',', 2)[1], 'base64');
}

async function grade(sourceId, targetPrefix) {
  const src = await readSource(sourceId);
  if (!src) {
    console.log(`  – verseBg/${sourceId}: 원본이 없어 건너뜁니다.`);
    return 0;
  }
  const base = await sharp(src).resize(W, H, { fit: 'cover' }).toBuffer();
  const srcLum = await lumOf(base);
  console.log(`  · 원본 밝기 ${Math.round(srcLum)}`);
  let n = 0;
  for (const slot of SLOTS) {
    const { url, buf } = await toDataUrl(gradeSlot(base, slot, srcLum));
    const dark = await isDark(buf);
    const id = targetPrefix ? `${targetPrefix}-${slot}` : slot;
    await db.doc(`verseBg/${id}`).set({
      image: url,
      dark,
      updatedAt: new Date().toISOString(),
    });
    console.log(
      `  ✓ ${id.padEnd(18)} ${LABEL[slot]} ${Math.round(url.length / 1024)}KB ${dark ? '흰 글씨' : '남색 글씨'}`,
    );
    n++;
  }
  return n;
}

const target = process.env.TARGET || 'both';
if (target === 'both' || target === 'weekday') {
  console.log('[평일 말씀카드] verseBg/original → verseBg/{시간대}');
  await grade('original', '');
}
if (target === 'both' || target === 'sunday') {
  console.log('[주일·월요일 카드] verseBg/sunday → verseBg/sunday-{시간대}');
  await grade('sunday', 'sunday');
}
console.log('완료 — 앱을 새로고침하면 바로 보입니다.');
