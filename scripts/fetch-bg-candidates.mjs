/**
 * 말씀카드 배경 후보 사진 모으기.
 *
 * Openverse(자유 이용 사진 통합 검색)에서 말씀·묵상에 어울리는 가로 사진을
 * 찾아 카드 비율로 잘라 preview/bg-candidates/ 에 저장한다. 작가·라이선스도
 * 함께 적어 두어 고른 뒤 출처를 밝힐 수 있게 한다.
 *
 * 카드 배경은 글씨가 얹히므로 너무 복잡한 사진은 거른다 —
 * 결이 고르고 한쪽이 비어 있는 사진이 좋다.
 *
 * 사용: node scripts/fetch-bg-candidates.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const W = 1600;
const H = 730;
const OUT = 'preview/bg-candidates';
mkdirSync(OUT, { recursive: true });

// 교회 안의 빛 — 스테인드글라스·창으로 드는 빛·촛불
const QUERIES = [
  'church interior sunlight pews',
  'cathedral nave light empty',
  'sunlight through church window floor',
  'chapel warm light interior empty',
  'church aisle morning light',
  'stained glass light reflection wall',
];

const picked = [];
let n = 0;

async function search(term) {
  const url =
    'https://api.openverse.org/v1/images/?' +
    new URLSearchParams({
      q: term,
      license: 'cc0,by,by-sa',
      aspect_ratio: 'wide',
      size: 'large',
      mature: 'false',
      page_size: '12',
    });
  const res = await fetch(url, { headers: { 'user-agent': 'tvpc-app-bg-picker/1.0' } });
  if (!res.ok) {
    console.log(`  – 검색 실패(${res.status}): ${term}`);
    return [];
  }
  const data = await res.json();
  return data?.results ?? [];
}

/** 배경으로 쓰기 좋은가 — 너무 잘게 복잡한 사진은 글씨를 방해한다 */
async function looksCalm(buf) {
  const small = await sharp(buf).resize(64, 32).greyscale().raw().toBuffer();
  let mean = 0;
  for (const v of small) mean += v;
  mean /= small.length;
  let variance = 0;
  for (const v of small) variance += (v - mean) ** 2;
  const sd = Math.sqrt(variance / small.length);
  return { ok: sd < 78, sd: Math.round(sd), lum: Math.round(mean) };
}

for (const term of QUERIES) {
  const results = await search(term);
  await new Promise((r) => setTimeout(r, 600)); // 검색 서버 배려
  let kept = 0;
  for (const r of results) {
    if (kept >= 3) break;
    const src = r.url;
    if (!src) continue;
    try {
      const img = await fetch(src, { headers: { 'user-agent': 'tvpc-app-bg-picker/1.0' } });
      if (!img.ok) continue;
      const raw = Buffer.from(await img.arrayBuffer());
      const meta = await sharp(raw).metadata();
      if ((meta.width ?? 0) < 1200) continue;
      const buf = await sharp(raw).resize(W, H, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
      const calm = await looksCalm(buf);
      if (!calm.ok) {
        console.log(`  – 너무 복잡해 건너뜀 (결 ${calm.sd}): ${r.title ?? ''}`.slice(0, 90));
        continue;
      }
      n += 1;
      kept += 1;
      const name = `cand-${String(n).padStart(2, '0')}`;
      writeFileSync(`${OUT}/${name}.jpg`, buf);
      picked.push({
        name,
        term,
        title: r.title ?? '',
        license: `${r.license ?? ''} ${r.license_version ?? ''}`.trim().toUpperCase(),
        author: r.creator ?? '',
        page: r.foreign_landing_url ?? '',
        calm: calm.sd,
        lum: calm.lum,
      });
      console.log(`✓ ${name}  ${term}  |  결 ${calm.sd} 밝기 ${calm.lum}  |  ${r.license} | ${r.creator ?? ''}`);
    } catch {
      /* 한 장 실패는 넘어간다 */
    }
  }
}

writeFileSync(`${OUT}/list.json`, JSON.stringify(picked, null, 2));
console.log(`완료 — 후보 ${picked.length}장`);
