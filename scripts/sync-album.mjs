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

const MAX_BYTES = 675_000; // base64 후 Firestore 1MB 한도 아래
async function encode(img) {
  for (const q of [78, 65, 52, 40]) {
    const buf = await img.clone().jpeg({ quality: q }).toBuffer();
    if (buf.length <= MAX_BYTES) return buf;
  }
  throw new Error('페이지 이미지가 너무 큽니다.');
}

// 기존 페이지 정리 후 새로 기록
const old = await db.collection('albums/current/pages').get();
for (const d of old.docs) await d.ref.delete();

let total = 0;
for (let i = 0; i < files.length; i++) {
  const img = sharp(readFileSync(join(dir, files[i])));
  const { width, height } = await img.metadata();
  const buf = await encode(img);
  total += buf.length;
  await db.doc(`albums/current/pages/${String(i).padStart(3, '0')}`).set({
    order: i,
    image: `data:image/jpeg;base64,${buf.toString('base64')}`,
    w: width,
    h: height,
  });
  if ((i + 1) % 10 === 0 || i === files.length - 1) console.log(`  … ${i + 1}/${files.length}`);
}
await db.doc('albums/current').set({
  pageCount: files.length,
  pdfHash,
  sourceUrl: ALBUM_URL,
  updatedAt: FieldValue.serverTimestamp(),
});
console.log(`완료: 앨범 ${files.length}페이지 등록 (총 ${Math.round(total / 1024)}KB)`);
