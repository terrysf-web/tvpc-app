/**
 * 말씀카드 배경 후보 사진 모으기.
 *
 * 위키미디어 공용(Wikimedia Commons)에서 자유 이용 사진을 검색해 카드 비율로
 * 잘라 preview/bg-candidates/ 에 저장한다. 저작권 정보(작가·라이선스)도 함께
 * 적어 두어, 고른 뒤 출처를 밝힐 수 있게 한다.
 *
 * 사용: node scripts/fetch-bg-candidates.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const W = 1600;
const H = 730;
const OUT = 'preview/bg-candidates';
mkdirSync(OUT, { recursive: true });

// 말씀·묵상에 어울리는 장면들
const QUERIES = [
  'open bible book pages',
  'bible candle light',
  'sunrise field wheat',
  'light through forest path',
  'sunrise mountain valley',
  'calm lake sunrise',
];

const OK_LICENSE = /cc0|public domain|cc by|cc-by|attribution/i;

async function search(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search' +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}&gsrlimit=6&gsrnamespace=6` +
    '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1800';
  const res = await fetch(url, { headers: { 'user-agent': 'tvpc-app-bg-picker/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  return Object.values(data?.query?.pages ?? {});
}

const picked = [];
let n = 0;
for (const term of QUERIES) {
  const pages = await search(term);
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    const license = String(meta.LicenseShortName?.value ?? '');
    const author = String(meta.Artist?.value ?? '')
      .replace(/<[^>]+>/g, '')
      .trim()
      .slice(0, 60);
    if (!OK_LICENSE.test(license)) continue;
    if (info.width < 1400 || info.height < 800) continue;
    const src = info.thumburl || info.url;
    try {
      const img = await fetch(src, { headers: { 'user-agent': 'tvpc-app-bg-picker/1.0' } });
      if (!img.ok) continue;
      const buf = Buffer.from(await img.arrayBuffer());
      n += 1;
      const name = `cand-${String(n).padStart(2, '0')}`;
      await sharp(buf).resize(W, H, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(`${OUT}/${name}.jpg`);
      picked.push({ name, term, title: p.title, license, author, page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}` });
      console.log(`✓ ${name}  ${term}  |  ${license}  |  ${author}`);
    } catch (e) {
      console.log(`  – 내려받기 실패: ${p.title}`);
    }
    if (picked.filter((x) => x.term === term).length >= 2) break;
  }
}

writeFileSync(`${OUT}/list.json`, JSON.stringify(picked, null, 2));
console.log(`완료 — 후보 ${picked.length}장`);
