/**
 * 웹페이지 구조 진단 도구 — URL을 받아 패턴 주변 HTML을 출력한다.
 * (개발용: 동기화 파서를 만들 때 실제 마크업 확인)
 *
 * 사용: PROBE_URL=... PROBE_PATTERN=... [PROBE_MODE=links] node scripts/probe.mjs
 *  - PROBE_MODE=links 면 페이지 안의 링크(주소·글자)를 죽 나열한다.
 *  - EUC-KR 페이지(두란노 등)는 charset을 보고 한글로 바로 읽는다.
 */
const url = process.env.PROBE_URL;
const pattern = process.env.PROBE_PATTERN || '';
const mode = process.env.PROBE_MODE || '';
if (!url) {
  console.error('PROBE_URL 환경변수가 필요합니다.');
  process.exit(1);
}

const res = await fetch(url, {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'accept-language': 'ko,en',
  },
  redirect: 'follow',
});
const buf = Buffer.from(await res.arrayBuffer());
// 문자셋 판별 — 응답 헤더 → meta charset 순
let charset = (res.headers.get('content-type') ?? '').match(/charset=([\w-]+)/i)?.[1];
if (!charset) {
  charset = buf.subarray(0, 2000).toString('latin1').match(/charset=["']?([\w-]+)/i)?.[1];
}
let html;
try {
  html = new TextDecoder(charset || 'utf-8').decode(buf);
} catch {
  html = buf.toString('utf8');
}
console.log(`HTTP ${res.status}, ${buf.length}B, charset=${charset || 'utf-8'}, 최종주소 ${res.url}`);

if (mode === 'raw') {
  console.log(html.replace(/\s+/g, ' '));
} else if (mode === 'links') {
  const seen = new Set();
  let n = 0;
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (seen.has(href)) continue;
    seen.add(href);
    if (++n > 100) break;
    console.log(`- "${text.slice(0, 40)}" → ${href}`);
  }
  console.log(`(링크 ${n}건)`);
  for (const m of html.matchAll(/<(?:iframe|frame)[^>]+src="([^"]+)"/g)) {
    console.log(`[frame] ${m[1]}`);
  }
} else if (pattern) {
  const re = new RegExp(pattern, 'g');
  let m;
  let n = 0;
  while ((m = re.exec(html)) && n < 5) {
    n++;
    const from = Math.max(0, m.index - 400);
    const to = Math.min(html.length, m.index + 600);
    console.log(`\n===== 매치 ${n} (오프셋 ${m.index}) =====`);
    console.log(html.slice(from, to).replace(/\s+/g, ' '));
  }
  if (n === 0) console.log('패턴 매치 없음');
} else {
  console.log(html.slice(0, 1500).replace(/\s+/g, ' '));
}
