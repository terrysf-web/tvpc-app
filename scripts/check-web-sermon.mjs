/** 일회성 — 교회 홈페이지 설교 목록에서 한 건이 어떻게 적혀 있는지 본다(읽기 전용).
 *  사용법: FIND=제목일부 node scripts/check-web-sermon.mjs */
import { fetchText } from './lib/youtube.mjs';

const url = process.env.WEB_SERMONS_URL || 'https://tvpc.church/wp/sermons/';
const find = (process.env.FIND || '').trim();
const html = await fetchText(url);
console.log(`${url} — ${Math.round(html.length / 1024)}KB`);
if (!find) process.exit(0);

let i = html.indexOf(find);
if (i < 0) {
  console.log(`"${find}" 를 목록에서 찾지 못했습니다(오래돼 내려갔을 수 있습니다).`);
  process.exit(0);
}
let n = 0;
while (i >= 0 && n < 3) {
  n++;
  const chunk = html.slice(Math.max(0, i - 2500), i + 1200);
  console.log(`\n=== ${n}번째 자리 — 앞뒤 원문에서 날짜·주소만 뽑음 ===`);
  for (const m of chunk.matchAll(/\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}/g))
    console.log(`  날짜꼴: ${m[0]}`);
  for (const m of chunk.matchAll(/datetime="([^"]+)"/g)) console.log(`  datetime: ${m[1]}`);
  for (const m of chunk.matchAll(/https?:\/\/[^"'\s<>]*sermon[^"'\s<>]*/gi))
    console.log(`  주소: ${m[0]}`);
  for (const m of chunk.matchAll(/youtu(?:\.be\/|be\.com\/[^"']*v=)([\w-]{11})/g))
    console.log(`  유튜브: ${m[1]}`);
  i = html.indexOf(find, i + 1);
}
