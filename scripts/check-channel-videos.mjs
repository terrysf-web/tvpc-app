/** 일회성 — 채널 "동영상" 탭을 통째로 읽어 본다(읽기 전용). */
import { fetchChannelVideos, fetchText } from './lib/youtube.mjs';

const handle = process.env.CHANNEL_HANDLE || '@tri-valley';
const page = await fetchText(`https://www.youtube.com/${handle}`);
const channelId = (page.match(/"channelId":"(UC[\w-]+)"/) || [])[1];
console.log(`채널 ${handle} → ${channelId}`);
const videos = await fetchChannelVideos(channelId);
console.log(`영상 ${videos.length}개\n`);
const dated = videos.filter((v) => /\[\d{1,2}\/\d{1,2}\/\d{4}\]/.test(v.title));
console.log(`제목에 날짜가 적힌 영상 ${dated.length}개\n`);
videos.slice(0, 40).forEach((v, i) => console.log(`${String(i + 1).padStart(3)}. ${v.id}  ${v.title.slice(0, 70)}`));
if (videos.length > 40) console.log(`… 외 ${videos.length - 40}개`);
