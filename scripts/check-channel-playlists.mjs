/** 일회성 — 채널에 어떤 재생목록이 있는지 확인(읽기 전용). */
import { fetchText } from './lib/youtube.mjs';

const handle = process.env.CHANNEL_HANDLE || '@tri-valley';
const html = await fetchText(`https://www.youtube.com/${handle}/playlists?hl=ko`);

// "playlistId":"PL..." 와 가까이 붙은 제목을 함께 모은다
const found = new Map();
const re = /"playlistId":"(PL[\w-]{10,})"/g;
let m;
while ((m = re.exec(html))) {
  if (found.has(m[1])) continue;
  // 그 자리 앞뒤에서 제목을 찾는다
  const around = html.slice(Math.max(0, m.index - 3000), m.index + 3000);
  const t =
    around.match(/"title":\{"runs":\[\{"text":"([^"]+)"/)?.[1] ??
    around.match(/"title":\{"simpleText":"([^"]+)"/)?.[1] ??
    '(제목 못 찾음)';
  found.set(m[1], t);
}
console.log(`${handle} 재생목록 ${found.size}개\n`);
for (const [id, title] of found) console.log(`  ${id}  ${title}`);
