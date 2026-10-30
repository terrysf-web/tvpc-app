/** 일회성 — 채널 재생목록의 이름과 내용을 확인(읽기 전용). */
import { fetchPlaylist, fetchText } from './lib/youtube.mjs';

const handle = process.env.CHANNEL_HANDLE || '@tri-valley';
const html = await fetchText(`https://www.youtube.com/${handle}/playlists?hl=ko`);
const ids = [...new Set([...html.matchAll(/"playlistId":"(PL[\w-]{10,})"/g)].map((m) => m[1]))];
console.log(`${handle} 재생목록 ${ids.length}개\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const id of ids) {
  try {
    const { name, videos } = await fetchPlaylist(id);
    console.log(`── ${name || '(이름 없음)'} — ${videos.length}개`);
    console.log(`   ${id}`);
    for (const v of videos.slice(0, 3)) console.log(`     · ${v.title.slice(0, 64)}`);
  } catch (e) {
    console.log(`── ${id} — 읽지 못함: ${e.message}`);
  }
  await sleep(1500);
}
