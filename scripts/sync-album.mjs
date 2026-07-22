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

// 변환 방식이 바뀌면(버전 증가) 같은 PDF라도 다시 변환한다
const CONVERTER_VERSION = 5;
const pdfHash = createHash('sha256').update(pdfBuf).digest('hex');
const meta = await db.doc('albums/current').get();
if (
  meta.exists &&
  meta.get('pdfHash') === pdfHash &&
  meta.get('converterVersion') === CONVERTER_VERSION
) {
  console.log('완료: 앨범이 이미 최신입니다 (변경 없음).');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'album-'));
writeFileSync(join(dir, 'in.pdf'), pdfBuf);
// 150dpi — 화면용으로 충분하면서 OCR(이름 인식)도 가능한 해상도
execFileSync('pdftoppm', ['-jpeg', '-r', '150', '-jpegopt', 'quality=82', join(dir, 'in.pdf'), join(dir, 'p')]);
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

// 명부 페이지는 텍스트 층이 없어(이름·셀이 그림) OCR로 읽는다
function ocrWords(file) {
  const out = execFileSync(
    'tesseract',
    [file, 'stdout', '--psm', '6', '-l', 'kor+eng', 'tsv'],
    { maxBuffer: 64 * 1024 * 1024 },
  ).toString();
  const words = [];
  for (const line of out.split('\n').slice(1)) {
    const c = line.split('\t');
    if (c.length < 12) continue;
    const conf = Number(c[10]);
    const text = (c[11] ?? '').trim();
    if (!text || conf < 30) continue;
    words.push({ left: Number(c[6]), top: Number(c[7]), w: Number(c[8]), h: Number(c[9]), text });
  }
  return words;
}

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
  const pageFile = join(dir, files[i]);
  const pageImg = sharp(readFileSync(pageFile));
  const { width: imgW, height: imgH } = await pageImg.metadata();

  // 명부 페이지 판별 — OCR로 표 머리글(Photo/Name/Cell) 확인
  const photos = px ? imagesOf(px.body).sort((a, b) => a.top - b.top) : [];
  let words = [];
  let nameX = null;
  let cellX = null;
  if (photos.length >= 2) {
    words = ocrWords(pageFile);
    const hdr = (re) => words.filter((w) => re.test(w.text)).sort((a, b) => a.top - b.top)[0];
    const hName = hdr(/^Name$/i);
    const hCell = hdr(/^Cell$/i);
    const hPhoto = hdr(/^Photo$/i);
    if (hName && hCell && hPhoto) {
      nameX = hName.left;
      cellX = hCell.left;
    }
  }

  if (nameX === null || cellX === null) {
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

  // 명부 페이지 — 사진(XML 좌표) 위치가 곧 줄(행)의 기준
  const scaleY = imgH / px.h;
  for (let r = 0; r < photos.length; r++) {
    const startPx = Math.max(0, Math.round((photos[r].top - 6) * scaleY));
    const endPx =
      r + 1 < photos.length
        ? Math.round((photos[r + 1].top - 6) * scaleY)
        : Math.min(imgH, Math.round((photos[r].top + photos[r].h + 14) * scaleY));
    const inRow = (w) => w.top >= startPx && w.top < endPx;
    // 셀 열의 OCR 단어들 → 셀 이름 (쉼표 앞 첫 항목)
    const cellText = words
      .filter((w) => inRow(w) && w.left >= cellX - 20)
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .map((w) => w.text)
      .join(' ')
      .trim();
    const cell = (cellText.split(',')[0] || '').replace(/[.,;:]+$/, '').trim() || '기타';
    // 이름 열의 OCR 단어들 — 이름 검색용
    const names = words
      .filter((w) => inRow(w) && w.left >= nameX - 20 && w.left < cellX - 20)
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .map((w) => w.text)
      .join(' ')
      .trim();
    const cropH = endPx - startPx;
    if (cropH < 30) continue;
    const slice = sharp(
      await pageImg.clone().extract({ left: 0, top: startPx, width: imgW, height: cropH }).toBuffer(),
    );
    const buf = await encode(slice);
    total += buf.length;
    rows.push({ cell, names, buf, w: imgW, h: cropH });
  }
  console.log(`  p${i + 1}: 명부 ${photos.length}줄 (OCR 단어 ${words.length}개)`);
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
    names: rows[i].names,
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
  converterVersion: CONVERTER_VERSION,
  sourceUrl: ALBUM_URL,
  updatedAt: FieldValue.serverTimestamp(),
});
console.log(
  `완료: 소개 ${introCount}페이지 + 명부 ${rows.length}줄(${cellOrder.length}개 셀: ${cellOrder.join(', ')}) — 총 ${Math.round(total / 1024)}KB`,
);
