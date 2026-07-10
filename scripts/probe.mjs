/**
 * 웹페이지 구조 진단 도구 — URL을 받아 패턴 주변 HTML을 출력한다.
 * (개발용: 동기화 파서를 만들 때 실제 마크업 확인)
 *
 * 사용: PROBE_URL=... PROBE_PATTERN=... node scripts/probe.mjs
 */
const url = process.env.PROBE_URL;
const pattern = process.env.PROBE_PATTERN || '';
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
const html = await res.text();
console.log(`HTTP ${res.status}, ${html.length}B`);

if (pattern) {
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
