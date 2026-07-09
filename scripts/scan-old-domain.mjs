/**
 * 교회 웹사이트(tvpc.church)에서 옛 도메인(pleasantonkorean.com) 잔존 여부 스캔.
 * 옛 도메인은 스팸(도박) 사이트로 넘어갔으므로, 남아 있는 링크/안내문을 찾아
 * 제거할 수 있게 페이지 목록과 문맥을 출력한다.
 *
 * GitHub Actions(.github/workflows/scan-old-domain.yml)에서 수동 실행.
 */
const NEEDLE = 'pleasantonkorean';
const MAX_PAGES = 80;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const seeds = [
  'https://tvpc.church/',
  'https://tvpc.church/wp/',
  'https://tvpc.church/wp/en/',
  'https://tvpc.church/ks/',
  'https://tvpc.church/xe/',
  // 검색엔진에서 이미 발견된 페이지들
  'https://tvpc.church/ks/?mod=document&page_id=995&uid=83',
  'https://tvpc.church/xe/LiveWorship/85758',
  'https://tvpc.church/xe/LiveWorship/85581',
];

const queue = [...seeds];
const visited = new Set();
const hits = [];

function contexts(html, needle) {
  const out = [];
  let i = 0;
  const lower = html.toLowerCase();
  while ((i = lower.indexOf(needle, i)) !== -1 && out.length < 3) {
    out.push(
      html
        .slice(Math.max(0, i - 80), i + needle.length + 80)
        .replace(/\s+/g, ' ')
        .trim(),
    );
    i += needle.length;
  }
  return out;
}

while (queue.length && visited.size < MAX_PAGES) {
  const url = queue.shift();
  const norm = url.split('#')[0];
  if (visited.has(norm)) continue;
  visited.add(norm);
  let html;
  try {
    const res = await fetch(norm, {
      headers: { 'user-agent': UA, 'accept-language': 'ko,en' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/(html|xml|text)/.test(type)) continue;
    html = await res.text();
  } catch {
    continue;
  }

  if (html.toLowerCase().includes(NEEDLE)) {
    hits.push({ url: norm, samples: contexts(html, NEEDLE) });
    console.log(`!! 발견: ${norm}`);
    for (const s of contexts(html, NEEDLE)) console.log(`     …${s}…`);
  }

  // 같은 사이트 내 링크 추출
  for (const m of html.matchAll(/href="([^"#]+)"/g)) {
    let next = m[1];
    if (next.startsWith('/')) next = 'https://tvpc.church' + next;
    if (!next.startsWith('https://tvpc.church') && !next.startsWith('http://tvpc.church')) continue;
    if (/\.(jpg|jpeg|png|gif|pdf|zip|css|js|ico|mp4|mp3)(\?|$)/i.test(next)) continue;
    if (!visited.has(next.split('#')[0])) queue.push(next);
  }
}

console.log('');
console.log(`스캔 완료: ${visited.size}페이지 확인, ${hits.length}페이지에서 옛 도메인 발견`);
if (hits.length) {
  console.log('--- 발견된 페이지 목록 ---');
  for (const h of hits) console.log(h.url);
} else {
  console.log('크롤 가능한 범위에서는 옛 도메인 언급이 없습니다.');
}
