/**
 * 주보 PPTX 읽기 — Canva에서 PowerPoint로 내보낸 주보에서 글자와 표를 꺼낸다.
 *
 * PDF는 "글자 + 좌표"뿐이라 띄어쓰기도 칸도 좌표로 되짚어야 했다. PPTX는
 * 글자·문단·표가 그대로 들어 있어 되짚을 일이 없다. 빈 문단도 그대로 와서,
 * 예배 순서의 이름 칸·✻ 칸·내용 칸이 줄 번호로 서로 맞춰진다.
 *
 * 바깥 라이브러리를 쓰지 않는다 — unzip 과 Node 기본 기능만 쓴다.
 */
import { execFileSync } from 'node:child_process';

const EMU = 914400; // 1인치

const xmlDecode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** 압축 파일 안의 한 항목을 글자로 꺼낸다 */
function entry(file, name) {
  return execFileSync('unzip', ['-p', file, name], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
}

/** 슬라이드 파일 이름들 — ppt/slides/slide1.xml, slide2.xml … 순서대로 */
export function slideNames(file) {
  const list = execFileSync('unzip', ['-Z1', file], { maxBuffer: 8 * 1024 * 1024 })
    .toString('utf8')
    .split('\n')
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return list.sort(
    (a, b) => Number(a.match(/(\d+)\.xml/)[1]) - Number(b.match(/(\d+)\.xml/)[1]),
  );
}

/** <a:t>…</a:t> 들을 이어 붙여 한 문단의 글자로 */
const runsText = (xml) =>
  [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => xmlDecode(m[1])).join('');

/** 한 덩어리(도형/표) 안의 문단들 — 빈 문단도 그대로 남긴다(줄 맞춤에 쓴다) */
const paragraphs = (xml) =>
  [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>|<a:p\s*\/>/g)].map((m) =>
    m[1] ? runsText(m[1]) : '',
  );

/** 도형의 왼쪽 위 좌표(인치) */
function offsetOf(xml) {
  const m = xml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
  if (!m) return { x: 0, y: 0 };
  return { x: Number(m[1]) / EMU, y: Number(m[2]) / EMU };
}

/** 표 하나 — 행마다 칸 글자 배열. 가로로 합쳐진 칸(gridSpan)은 빈 칸으로 채운다 */
function parseTable(xml) {
  const rows = [];
  for (const tr of xml.matchAll(/<a:tr(?:\s[^>]*)?>([\s\S]*?)<\/a:tr>/g)) {
    const cells = [];
    for (const tc of tr[1].matchAll(/<a:tc(?:\s([^>]*))?>([\s\S]*?)<\/a:tc>/g)) {
      const attrs = tc[1] ?? '';
      // 합쳐진 칸의 오른쪽 자리(hMerge) — Canva는 여기에도 같은 글자를 복사해
      // 넣는다. 그대로 두면 합계가 칸마다 하나씩 있는 것처럼 보인다.
      if (/hMerge="(?:1|true)"/.test(attrs)) {
        cells.push(null);
        continue;
      }
      const text = paragraphs(tc[2])
        .map((p) => p.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      // gridSpan 으로 몇 칸을 먹는지 적혀 있지만, 먹힌 칸들도 hMerge="1" 로
      // 따로 들어 있다 — 여기서 또 채우면 칸 수가 두 배가 된다.
      cells.push(text);
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * 슬라이드 하나를 읽어, 글상자와 표를 위에서 아래·왼쪽에서 오른쪽 순으로 돌려준다.
 *   { kind: 'text', x, y, lines: string[] }   lines 에는 빈 줄도 들어 있다
 *   { kind: 'table', x, y, rows: (string|null)[][] }
 */
export function readSlide(file, name) {
  const xml = entry(file, name);
  const tree = xml.match(/<p:spTree[\s\S]*<\/p:spTree>/)?.[0] ?? xml;
  const out = [];
  // 도형(p:sp)·그래픽틀(p:graphicFrame) 각각을 통째로 잘라 본다
  const chunks = [
    ...tree.matchAll(/<p:sp>[\s\S]*?<\/p:sp>|<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g),
  ].map((m) => m[0]);
  for (const chunk of chunks) {
    const { x, y } = offsetOf(chunk);
    const tbl = chunk.match(/<a:tbl>[\s\S]*<\/a:tbl>/)?.[0];
    if (tbl) {
      const rows = parseTable(tbl);
      if (rows.length) out.push({ kind: 'table', x, y, rows });
      continue;
    }
    const body = chunk.match(/<p:txBody>[\s\S]*<\/p:txBody>/)?.[0];
    if (!body) continue;
    const lines = paragraphs(body);
    if (!lines.some((l) => l.trim())) continue;
    out.push({ kind: 'text', x, y, lines });
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

/** PPTX 전체 — 슬라이드별 덩어리 목록 */
export function readPptx(file) {
  return slideNames(file).map((n) => ({ name: n, shapes: readSlide(file, n) }));
}
