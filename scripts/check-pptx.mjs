/**
 * 주보 PPTX 시험 읽기(읽기 전용) — PDF로 읽은 것과 비교해 보려고 만든 도구.
 *
 *   node scripts/check-pptx.mjs <주보.pptx>
 *
 * 아직 앱에 쓰지 않는다. PPTX로 바꿀 만한지 눈으로 확인하는 용도다.
 */
import { readPptx } from './lib/pptx.mjs';

const file = process.env.PPTX || process.argv[2];
if (!file) {
  console.error('쓰는 법: node scripts/check-pptx.mjs <주보.pptx>');
  process.exit(1);
}

const slides = readPptx(file);
const texts = slides.flatMap((s) => s.shapes.filter((x) => x.kind === 'text'));
const tables = slides.flatMap((s) => s.shapes.filter((x) => x.kind === 'table'));

// ── 예배 순서 ────────────────────────────────────────────────────────
// 이름 칸을 먼저 찾는다 — 예배 순서에만 나오는 이름이 여러 개 들어 있는 글상자.
const NAME_HINTS = ['예배의 부름', '성경봉독', '설교', '축도', '기도', '찬양'];
const nameBox = texts
  .map((t) => ({
    t,
    hits: NAME_HINTS.filter((h) => t.lines.some((l) => l.trim() === h)).length,
  }))
  .sort((a, b) => b.hits - a.hits)[0];

if (!nameBox || nameBox.hits < 3) {
  console.log('예배 순서 이름 칸을 찾지 못했습니다.');
} else {
  const col = nameBox.t;
  // 같은 높이에서 오른쪽에 있는 글상자 둘 — ✻ 칸과 내용 칸
  const sameRow = texts
    .filter((t) => t !== col && Math.abs(t.y - col.y) < 0.2 && t.x > col.x)
    .sort((a, b) => a.x - b.x);
  const starCol = sameRow[0];
  const detailCol = sameRow[1] ?? sameRow[0];

  const nameIdx = col.lines
    .map((l, i) => [i, l.trim()])
    .filter(([, l]) => l)
    .map(([i, l]) => ({ i, name: l }));

  // 내용 칸을 빈 줄로 끊어 덩어리로 나눈다 (설교 제목처럼 두 줄짜리가 있다)
  const blocks = [];
  let cur = null;
  detailCol.lines.forEach((l, i) => {
    if (l.trim()) {
      if (!cur) cur = { i, lines: [] };
      cur.lines.push(l.trim());
    } else if (cur) {
      blocks.push(cur);
      cur = null;
    }
  });
  if (cur) blocks.push(cur);

  // 덩어리를 위에서부터, 그 줄 번호 이상인 가장 가까운 "아직 안 쓴 이름"에 붙인다
  const detailOf = new Map();
  let p = 0;
  for (const b of blocks) {
    while (p < nameIdx.length && nameIdx[p].i < b.i - 1) p++;
    if (p >= nameIdx.length) break;
    detailOf.set(nameIdx[p].i, b.lines.join(' ').replace(/\s{2,}/g, ' ').trim());
    p++;
  }
  const starAt = new Set(
    starCol.lines.map((l, i) => (l.includes('✻') || l.includes('*') ? i : -1)).filter((i) => i >= 0),
  );

  console.log(`[예배 순서] ${nameIdx.length}개\n`);
  for (const { i, name } of nameIdx) {
    const star = starAt.has(i) ? '✻ ' : '  ';
    console.log(`  ${star}${name.padEnd(12)} │ ${detailOf.get(i) ?? ''}`);
  }
}

// ── 표 ───────────────────────────────────────────────────────────────
for (const t of tables) {
  console.log(`\n[표] ${t.rows.length}행`);
  for (const r of t.rows) {
    console.log(`  | ${r.map((c) => (c === null ? '' : c)).join(' | ')}`);
  }
}

// ── 글상자 전체(어디에 뭐가 있는지) ──────────────────────────────────
if (process.env.VERBOSE) {
  console.log('\n[글상자 전체]');
  for (const t of texts) {
    console.log(`  y=${t.y.toFixed(2)} x=${t.x.toFixed(2)}`);
    for (const l of t.lines) if (l.trim()) console.log(`      ${l}`);
  }
}
