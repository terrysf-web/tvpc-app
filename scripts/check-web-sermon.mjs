/**
 * 일회성 — 교회 홈페이지 설교 목록을 있는 그대로 훑는다(읽기 전용).
 *
 * 몇 페이지까지 있는지, 카드 하나에 날짜가 몇 개나 적혀 있는지(그래서
 * 엉뚱한 날짜를 집은 건 아닌지) 확인한다.
 */
import { fetchText } from './lib/youtube.mjs';

const base = (process.env.WEB_SERMONS_URL || 'https://tvpc.church/wp/sermons/').replace(/\/+$/, '');
const maxPages = Number(process.env.PAGES || 12);
const show = Number(process.env.SHOW || 0); // 첫 N개 카드의 날짜 후보를 자세히

const all = [];
for (let p = 1; p <= maxPages; p++) {
  const url = p === 1 ? `${base}/` : `${base}/page/${p}/`;
  let html;
  try {
    html = await fetchText(url, 2);
  } catch (e) {
    console.log(`${p}페이지: 없음 (${e.message.replace(/^.*→ /, '')})`);
    break;
  }
  const cards = html.split(/<li class=['"]sermon-archive-single['"]/).slice(1);
  if (cards.length === 0) {
    console.log(`${p}페이지: 설교 카드 0개 — 여기서 끝`);
    break;
  }
  console.log(`${p}페이지: ${cards.length}건`);
  for (const part of cards) {
    const end = part.indexOf('</li>');
    const block = end >= 0 ? part.slice(0, end) : part;
    const title = (block.match(/<h2>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/)?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .trim();
    // 카드 안에 적힌 모든 "YYYY년 M월 D일"과 그 앞의 class 이름
    const dates = [...block.matchAll(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g)].map((m) => {
      const before = block.slice(Math.max(0, m.index - 160), m.index);
      const cls = [...before.matchAll(/class=['"]([^'"]+)['"]/g)].pop()?.[1] ?? '?';
      return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}  (${cls})`;
    });
    all.push({ page: p, title, dates, block });
  }
  await new Promise((r) => setTimeout(r, 600));
}

console.log(`\n=== 모두 ${all.length}건 ===`);
for (const it of all)
  console.log(`  ${it.dates[0]?.split(' ')[0] ?? '날짜없음'}  ${it.title.slice(0, 48)}${it.dates.length > 1 ? `   ← 카드에 날짜 ${it.dates.length}개` : ''}`);

if (show > 0) {
  console.log(`\n=== 앞 ${show}건의 날짜 후보 자세히 ===`);
  for (const it of all.slice(0, show)) {
    console.log(`\n── ${it.title.slice(0, 50)}`);
    for (const d of it.dates) console.log(`     ${d}`);
  }
}
