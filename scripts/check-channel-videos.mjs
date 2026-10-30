/** 일회성 — 채널 "동영상" 탭을 통째로 읽어 본다(읽기 전용). */
import { fetchChannelVideos } from './lib/youtube.mjs';

const channelId = process.env.CHANNEL_ID || 'UCZrRfMxUpuVv7e4JqlesJ1w';
console.log(`채널 ${channelId}`);
const videos = await fetchChannelVideos(channelId);
const dated = videos.filter((v) => /\[\d{1,2}\/\d{1,2}\/\d{4}\]/.test(v.title));
console.log(`영상 ${videos.length}개 — 그중 제목에 날짜가 적힌 것 ${dated.length}개\n`);
videos.slice(0, 45).forEach((v, i) =>
  console.log(`${String(i + 1).padStart(3)}. ${v.id}  ${v.title.slice(0, 70)}`),
);
if (videos.length > 45) console.log(`… 외 ${videos.length - 45}개`);
