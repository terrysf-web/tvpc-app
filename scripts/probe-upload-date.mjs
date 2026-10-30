/** 일회성 — 유튜브 시청 페이지에서 업로드 날짜가 어떤 모양으로 들어 있는지 확인.
 *  사용법: VIDEO_IDS=id1,id2 node scripts/probe-upload-date.mjs */
import { fetchText } from './lib/youtube.mjs';

const ids = (process.env.VIDEO_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
for (const id of ids) {
  console.log(`\n=== ${id} ===`);
  let html;
  try {
    html = await fetchText(`https://www.youtube.com/watch?v=${id}&hl=ko`);
  } catch (e) {
    console.log(`  ! 받지 못함: ${e.message}`);
    continue;
  }
  console.log(`  페이지 ${Math.round(html.length / 1024)}KB`);
  const len = html.match(/"lengthSeconds":"(\d+)"/);
  const views = html.match(/"views":\{"simpleText":"([^"]+)"/);
  const title = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
  if (title) console.log(`  제목 ${title[1]}`);
  if (len) console.log(`  길이 ${Math.floor(len[1] / 60)}분 ${len[1] % 60}초`);
  if (views) console.log(`  ${views[1]}`);
  const pats = {
    'uploadDate":"YYYY-MM-DD': /"uploadDate":"(\d{4}-\d{2}-\d{2})/,
    'itemprop datePublished': /itemprop="datePublished" content="(\d{4}-\d{2}-\d{2})/,
    'publishDate":"YYYY-MM-DD': /"publishDate":"(\d{4}-\d{2}-\d{2})/,
    'itemprop uploadDate': /itemprop="uploadDate" content="(\d{4}-\d{2}-\d{2})/,
    'meta uploadDate': /<meta[^>]+uploadDate[^>]+content="(\d{4}-\d{2}-\d{2})/,
    'dateText simpleText': /"dateText":\{"simpleText":"([^"]+)"/,
    'publishDate 한글': /"publishDate":\{"simpleText":"([^"]+)"/,
    'uploadDate 한글': /"uploadDate":\{"simpleText":"([^"]+)"/,
  };
  for (const [name, re] of Object.entries(pats)) {
    const m = html.match(re);
    console.log(`  ${m ? '✓' : '✗'} ${name}${m ? ` → ${m[1]}` : ''}`);
  }
  for (const key of ['uploadDate', 'publishDate', 'dateText']) {
    const i = html.indexOf(key);
    if (i >= 0) console.log(`  [${key} 앞뒤] …${html.slice(i - 40, i + 90).replace(/\s+/g, ' ')}…`);
  }
}
