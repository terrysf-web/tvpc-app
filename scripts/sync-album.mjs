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

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
const FALLBACK_URL = 'https://tvpc.church/ChurchDirectory/TVPC_2026_01.pdf';

/**
 * 최신 앨범 자동 탐색 — 교회가 ChurchDirectory 폴더에 TVPC_연도_월.pdf
 * 규칙으로 올리면(예: TVPC_2026_07.pdf) 여기서 최근 월부터 거꾸로
 * 확인해 가장 최신 파일을 쓴다. 새 앨범이 나와도 코드를 고칠 필요가 없다.
 */
async function discoverAlbumUrl() {
  const exists = async (url) => {
    try {
      const head = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA } });
      if (head.ok) return (head.headers.get('content-type') || '').includes('pdf') || true;
      if (head.status === 405 || head.status === 403) {
        // HEAD를 막는 서버 — 첫 바이트만 받아 확인
        const r = await fetch(url, {
          headers: { 'user-agent': UA, range: 'bytes=0-4' },
        });
        return r.ok;
      }
    } catch {
      /* 다음 후보로 */
    }
    return false;
  };
  const now = new Date();
  for (let k = 0; k < 24; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const url = `https://tvpc.church/ChurchDirectory/TVPC_${d.getFullYear()}_${String(
      d.getMonth() + 1,
    ).padStart(2, '0')}.pdf`;
    if (await exists(url)) return url;
  }
  return null;
}

const ALBUM_URL =
  process.env.ALBUM_URL || (await discoverAlbumUrl()) || FALLBACK_URL;

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

console.log(`[앨범] 다운로드: ${ALBUM_URL}`);
const res = await fetch(ALBUM_URL, {
  headers: { 'user-agent': UA },
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
const CONVERTER_VERSION = 16;
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
// 화면용 150dpi + OCR용 300dpi(한글 인식 정확도) 두 벌 렌더링
execFileSync('pdftoppm', ['-jpeg', '-r', '150', '-jpegopt', 'quality=82', join(dir, 'in.pdf'), join(dir, 'p')]);
execFileSync('pdftoppm', ['-jpeg', '-r', '300', '-jpegopt', 'quality=85', join(dir, 'in.pdf'), join(dir, 'o')]);
const files = readdirSync(dir).filter((f) => f.startsWith('p') && f.endsWith('.jpg')).sort();
const ocrFiles = readdirSync(dir).filter((f) => f.startsWith('o') && f.endsWith('.jpg')).sort();
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
    if (!text || conf < 10) continue;
    words.push({ left: Number(c[6]), top: Number(c[7]), w: Number(c[8]), h: Number(c[9]), text, conf });
  }
  return words;
}

// OCR로 읽은 셀 이름 정규화 — 0/O 혼동, Cell 오인식(6611-07 등), 잡음 제거
function normCell(raw) {
  let s = String(raw).split(',')[0].trim();
  s = s.split(/\s+/)[0] ?? ''; // 두 그룹이 붙은 경우 첫 그룹만 (예: "늘푸른 Cell-02")
  s = s.replace(/[.,;:|：]+$/g, '').trim();
  if (!s) return '기타';
  const tail = s.match(/(\d{1,2})$/);
  if (/^[c6][e6][l1i|][l1i|]/i.test(s) && tail) return `Cell-${tail[1].padStart(2, '0')}`;
  const m = s.replace(/[oO](?=\d)/g, '0').match(/^Cell[-–—]?\s*0*(\d{1,2})$/i);
  if (m) return `Cell-${m[1].padStart(2, '0')}`;
  if (/^[A-Za-z가-힣]{2,}/.test(s)) return s;
  return '기타';
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
const rows = []; // {cell, names, buf, w, h}
// 머리글 OCR이 빠진 명부 페이지를 위해 직전 페이지의 열 위치를 기억
let lastNameX = null;
let lastCellX = null;

for (let i = 0; i < files.length; i++) {
  const px = pagesXml.find((p) => p.n === i + 1);
  const pageFile = join(dir, files[i]);
  const pageImg = sharp(readFileSync(pageFile));
  const { width: imgW, height: imgH } = await pageImg.metadata();

  // 명부 페이지 판별 — OCR로 표 머리글(Photo/Name/Cell) 확인
  // 작은 장식 이미지(구분선·로고)는 사진으로 치지 않는다
  const photos = px
    ? imagesOf(px.body)
        .filter((p) => p.w > px.w * 0.08 && p.h > px.h * 0.05)
        .sort((a, b) => a.top - b.top)
    : [];
  let words = [];
  let nameX = null;
  let cellX = null;
  let words300 = [];
  // 사진이 1장뿐인 명부 페이지(마지막 장에 한 명만 남는 경우)도 잡는다 —
  // 머리글(Photo/Name/Cell)이 OCR로 확인될 때만 명부로 취급하므로
  // 큰 사진 한 장짜리 소개 페이지가 명부로 오인되지는 않는다
  if (photos.length >= 1) {
    // 셀·머리글은 150dpi(검증된 결과), 이름은 300dpi(한글 정확도) — 이중 OCR
    words = ocrWords(pageFile);
    const ocrFile = join(dir, ocrFiles[i]);
    const om = await sharp(readFileSync(ocrFile)).metadata();
    const k = imgH / om.height;
    words300 = ocrWords(ocrFile).map((w) => ({
      ...w,
      left: Math.round(w.left * k),
      top: Math.round(w.top * k),
      w: Math.round(w.w * k),
      h: Math.round(w.h * k),
    }));
    const hdr = (re) =>
      words.filter((w) => w.conf >= 30 && re.test(w.text)).sort((a, b) => a.top - b.top)[0];
    const hName = hdr(/^Name$/i);
    const hCell = hdr(/^Cell$/i);
    const hPhoto = hdr(/^Photo$/i);
    if (hName && hCell && hPhoto) {
      nameX = hName.left;
      cellX = hCell.left;
      lastNameX = nameX;
      lastCellX = cellX;
    } else if (lastNameX !== null && photos.length >= 3) {
      // 머리글 인식 실패 — 직전 명부 페이지의 열 위치 재사용
      nameX = lastNameX;
      cellX = lastCellX;
    }
  }

  if (nameX === null || cellX === null) {
    // 소개·단체사진 페이지는 통째로
    // 화면 표시 폭(≤520 CSS px)에는 1000px면 충분 — 용량을 줄여 로딩을 빠르게
    const buf = await encode(pageImg.clone().resize({ width: 1000, withoutEnlargement: true }));
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

  // 명부 페이지 — 줄 경계는 "이전 사진 아래 ~ 다음 사진 위"의 중간 지점.
  // 셀·이름 글자가 사진보다 약간 위에 인쇄돼도 자기 줄에 포함되게 한다.
  const scaleY = imgH / px.h;
  const tops = photos.map((p) => Math.round(p.top * scaleY));
  const bottoms = photos.map((p) => Math.round((p.top + p.h) * scaleY));
  const hCellW = words.filter((w) => /^Cell$/i.test(w.text)).sort((a, b) => a.top - b.top)[0];
  const headerBottom = hCellW && hCellW.top < tops[0] ? hCellW.top + hCellW.h : 0;
  const starts = [];
  const ends = [];
  for (let r = 0; r < photos.length; r++) {
    starts[r] =
      r === 0
        ? Math.max(0, headerBottom + 4, tops[0] - 46)
        : Math.round((bottoms[r - 1] + tops[r]) / 2);
    ends[r] =
      r + 1 < photos.length
        ? Math.round((bottoms[r] + tops[r + 1]) / 2)
        : Math.min(imgH, bottoms[r] + 24);
  }
  for (let r = 0; r < photos.length; r++) {
    const startPx = starts[r];
    const endPx = ends[r];
    const inRow = (w) => w.top >= startPx && w.top < endPx && !/^(Photo|Name|Cell)$/.test(w.text);
    // 셀 열의 OCR 단어들 → 셀 이름 (쉼표 앞 첫 항목)
    const cellText = words
      .filter((w) => inRow(w) && w.conf >= 30 && w.left >= cellX - 20)
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .map((w) => w.text)
      .join(' ')
      .trim();
    let cell = normCell(cellText);
    // 이름 열 — 300dpi OCR(한글 정확도)로 검색용 이름 추출
    const names = words300
      // 이름은 검색 색인용 — 신뢰도 문턱을 낮춰(12) 흐리게 읽힌 이름도
      // 검색에 걸리게 한다 (잡음이 섞여도 포함 검색이라 해가 없다)
      .filter((w) => inRow(w) && w.conf >= 12 && w.left >= nameX - 20 && w.left < cellX - 20)
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .map((w) => w.text)
      .join(' ')
      .trim();
    // 글자가 전혀 없는 줄(장식 이미지로 생긴 가짜 줄)은 버린다
    if (!/[가-힣A-Za-z]/.test(`${names} ${cellText}`)) continue;
    // 셀을 못 찾았으면 두 해상도 OCR 단어 전체에서 셀 패턴을 직접 찾는다
    if (cell === '기타') {
      const cand = [...words, ...words300]
        .filter(
          (w) =>
            inRow(w) &&
            w.left >= nameX &&
            (/^[c6][e6][l1i|][l1i|]/i.test(w.text) || /^(CYA|EM|Pastor|늘푸른)/i.test(w.text)),
        )
        .sort((a, b) => b.left - a.left)[0];
      if (cand) cell = normCell(cand.text);
    }
    const cropH = endPx - startPx;
    if (cropH < 30) continue;
    const slice = sharp(
      await pageImg.clone().extract({ left: 0, top: startPx, width: imgW, height: cropH }).toBuffer(),
    );
    const buf = await encode(slice.resize({ width: 1000, withoutEnlargement: true }));
    total += buf.length;
    rows.push({ cell, names, buf, w: imgW, h: cropH });
  }
  console.log(`  p${i + 1}: 명부 ${photos.length}줄 (OCR 단어 ${words.length}개)`);
}

// 그룹 라벨 후처리 — 오독은 알려진 그룹만 인정하고('CVA'→'CYA' 보정),
// 아니면 명부 순서상 바로 앞 줄의 그룹을 이어받는다
// (Bre·er 같은 잡음 라벨은 대개 그룹 머리글이 없는 이어지는 줄이다)
const KNOWN_CELL = /^(Cell-\d{2}|CYA|EM|Pastor|늘푸른)$/;
const CELL_FIX = { CVA: 'CYA', CY4: 'CYA', Em: 'EM' };
{
  let prevCell = null;
  for (const r of rows) {
    if (CELL_FIX[r.cell]) r.cell = CELL_FIX[r.cell];
    if (!KNOWN_CELL.test(r.cell)) r.cell = prevCell ?? '기타';
    prevCell = r.cell;
  }
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
  // 가벼운 색인 — 뷰어가 이미지를 받기 전에도 전체 이름 검색이 되도록
  index: rows.map((r) => ({ c: r.cell, n: r.names })),
  pdfHash,
  converterVersion: CONVERTER_VERSION,
  sourceUrl: ALBUM_URL,
  updatedAt: FieldValue.serverTimestamp(),
});
console.log(
  `완료: 소개 ${introCount}페이지 + 명부 ${rows.length}줄(${cellOrder.length}개 셀: ${cellOrder.join(', ')}) — 총 ${Math.round(total / 1024)}KB`,
);
