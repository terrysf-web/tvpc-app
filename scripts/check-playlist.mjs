/** 일회성 — 유튜브 재생목록에 무엇이 들어 있는지 그대로 확인(읽기 전용).
 *  사용법: LIST_ID=PL... node scripts/check-playlist.mjs */
import { fetchPlaylist } from './lib/youtube.mjs';

const listId = (process.env.LIST_ID || '').trim();
if (!listId) {
  console.error('LIST_ID가 필요합니다.');
  process.exit(1);
}
const { name, videos } = await fetchPlaylist(listId);
console.log(`재생목록: ${name || '(제목 없음)'}`);
console.log(`영상 ${videos.length}개\n`);
videos.forEach((v, i) => {
  const mm = v.seconds ? ` (${Math.floor(v.seconds / 60)}분)` : '';
  console.log(`${String(i + 1).padStart(3)}. ${v.id}  ${v.title}${mm}`);
});
