/**
 * 교회 앨범(사진 주소록) PDF → 앱용 페이지 이미지.
 *
 * 홈페이지의 앨범 PDF가 커서 전화기에서 여는 데 오래 걸리므로,
 * 미리 페이지별 JPEG로 변환해 Firestore albums/current/pages 에 담아
 * 앱 뷰어가 첫 장부터 즉시 보여줄 수 있게 한다.
 * 같은 PDF(해시 동일)면 건너뛰므로 매주 돌려도 비용이 없다.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import sharp from 'sharp';

const ALBUM_URL =
  process.env.ALBUM_URL || 'https://tvpc.church/ChurchDirectory/TVPC_2026_01.pdf';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

console.log(`[앨범] 다운로드: ${ALBUM_URL}`);
const res = await fetch(ALBUM_URL, {
  headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
});
if (!res.ok) {
  console.error(`  ✗ HTTP ${res.status} — 주소를 확인해 주세요.`);
  process.exit(1);
}
const pdfBuf = Buffer.from(await res.arrayBuffer());
if (pdfBuf.subarray(0, 5).toString() !== '%PDF-') {
  console.error('  ✗ PDF가 아닌 응답입니다.');
  process.exit(1);
}
console.log(`  ✓ ${Math.round(pdfBuf.length / 1024)}KB`);

const pdfHash = createHash('sha256').update(pdfBuf).digest('hex');
const meta = await db.doc('albums/current').get();
if (meta.exists && meta.get('pdfHash') === pdfHash) {
  console.log('완료: 앨범이 이미 최신입니다 (변경 없음).');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'album-'));
writeFileSync(join(dir, 'in.pdf'), pdfBuf);
// 사진 위주 문서 — 전화기 화면 기준 폭이면 충분 (용량 절약)
execFileSync('pdftoppm', ['-jpeg', '-r', '110', '-jpegopt', 'quality=80', join(dir, 'in.pdf'), join(dir, 'p')]);
const files = readdirSync(dir).filter((f) => f.startsWith('p') && f.endsWith('.jpg')).sort();
console.log(`[변환] ${files.length}페이지 렌더링`);

// 페이지 구조(XML) — 명부 페이지(Photo/Name/Cell 표)를 줄 단위로 자르기 위한 좌표
execFileSync('pdftohtml', ['-xml', '-q', join(dir, 'in.pdf'), join(dir, 'layout')], { cwd: dir });
const xml = readFileSync(join(dir, 'layout.xml'), 'utf8');
const pagesXml = [...xml.matchAll(/<page number="(\d+)"[^>]*height="([\d.]+)"[^>]*width="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g)].map((m) => ({
  n: Number(m[1]),
  h: Number(m[2]),
  w: Number(m[3]),
  body: m[4],
}));
const textsOf = (body) =>
  [...body.matchAll(/<text top="([\d.]+)" left="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)].map((m) => ({
    top: Number(m[1]),
    left: Number(m[2]),
    w: Number(m[3]),
    h: Number(m[4]),
    s: m[5].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim(),
  }));
const imagesOf = (body) =>
  [...body.matchAll(/<image top="([\d.]+)" left="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*>/g)].map((m) => ({
    top: Number(m[1]),
    left: Number(m[2]),
    w: Number(m[3]),
    h: Number(m[4]),
  }));

const MAX_BYTES = 675_000; // base64 후 Firestore 1MB 한도 아래
async function encode(img) {
  for (const q of [78, 65, 52, 40]) {
    const buf = await img.clone().jpeg({ quality: q }).toBuffer();
    if (buf.length <= MAX_BYTES) return buf;
  }
  throw new Error('페이지 이미지가 너무 큽니다.');
}

// 기존 데이터 정리 후 새로 기록
for (const coll of ['albums/current/pages', 'albums/current/rows']) {
  const old = await db.collection(coll).get();
  for (const d of old.docs) await d.ref.delete();
}

let introCount = 0;
let total = 0;
const rows = []; // {cell, buf, w, h, pageOrder}

for (let i = 0; i < files.length; i++) {
  const px = pagesXml.find((p) => p.n === i + 1);
  const texts = px ? textsOf(px.body) : [];
  const isTable =
    texts.some((t) => t.s === 'Photo') &&
    texts.some((t) => t.s === 'Name') &&
    texts.some((t) => t.s === 'Cell');
  const pageImg = sharp(readFileSync(join(dir, files[i])));
  const { width: imgW, height: imgH } = await pageImg.metadata();

  if (!isTable) {
    // 소개·단체사진 페이지는 통째로
    const buf = await encode(pageImg);
    total += buf.length;
    await db.doc(`albums/current/pages/${String(introCount).padStart(3, '0')}`).set({
      order: introCount,
      image: `data:image/jpeg;base64,${buf.toString('base64')}`,
      w: imgW,
      h: imgH,
    });
    introCount++;
    continue;
  }

  // 명부 페이지 — 사진 위치가 곧 줄(행)의 기준
  const cellHeader = texts.find((t) => t.s === 'Cell');
  const photos = imagesOf(px.body).sort((a, b) => a.top - b.top);
  const scaleY = imgH / px.h;
  const bottomMost = Math.max(...texts.map((t) => t.top + t.h), ...photos.map((p) => p.top + p.h));
  for (let r = 0; r < photos.length; r++) {
    const startY = photos[r].top - 6;
    const endY = r + 1 < photos.length ? photos[r + 1].top - 6 : Math.min(bottomMost + 8, px.h);
    // 이 줄의 Cell 값 (셀 열 위치의 텍스트)
    const label = texts
      .filter(
        (t) =>
          cellHeader &&
          t.left >= cellHeader.left - 6 &&
          t.top >= startY &&
          t.top < endY &&
          t.s &&
          t.s !== 'Cell',
      )
      .map((t) => t.s)
      .join(' ')
      .trim();
    const cell = (label.split(',')[0] || '').trim() || '기타';
    const cropTop = Math.max(0, Math.round(startY * scaleY));
    const cropH = Math.min(imgH - cropTop, Math.round((endY - startY) * scaleY));
    if (cropH < 20) continue;
    const slice = sharp(await pageImg.clone().extract({ left: 0, top: cropTop, width: imgW, height: cropH }).toBuffer());
    const buf = await encode(slice);
    total += buf.length;
    rows.push({ cell, cellFull: label || cell, buf, w: imgW, h: cropH });
  }
  if ((i + 1) % 10 === 0) console.log(`  … ${i + 1}/${files.length}페이지 처리`);
}

// 셀 이름순으로 묶어 저장 — 뷰어는 순서대로 읽으며 셀이 바뀔 때 제목을 단다
const cellOrder = [...new Set(rows.map((r) => r.cell))].sort((a, b) =>
  a.localeCompare(b, 'en', { numeric: true }),
);
rows.sort(
  (a, b) => cellOrder.indexOf(a.cell) - cellOrder.indexOf(b.cell) || 0,
);
for (let i = 0; i < rows.length; i++) {
  await db.doc(`albums/current/rows/${String(i).padStart(4, '0')}`).set({
    order: i,
    cell: rows[i].cell,
    image: `data:image/jpeg;base64,${rows[i].buf.toString('base64')}`,
    w: rows[i].w,
    h: rows[i].h,
  });
}

await db.doc('albums/current').set({
  pageCount: introCount,
  rowCount: rows.length,
  cells: cellOrder,
  pdfHash,
  sourceUrl: ALBUM_URL,
  updatedAt: FieldValue.serverTimestamp(),
});
console.log(
  `완료: 소개 ${introCount}페이지 + 명부 ${rows.length}줄(${cellOrder.length}개 셀: ${cellOrder.join(', ')}) — 총 ${Math.round(total / 1024)}KB`,
);
