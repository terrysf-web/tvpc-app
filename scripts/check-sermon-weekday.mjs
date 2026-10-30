/** 일회성 — 설교 날짜의 요일을 확인(읽기 전용).
 *  예배 구분을 요일로 정하기 전에, 주일이 아닌 날로 들어가 있는 설교가
 *  무엇인지 먼저 본다. 날짜가 잘못 들어간 설교가 섞여 있으면 엉뚱한
 *  것까지 "특별예배"가 되므로. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const W = ['일', '월', '화', '수', '목', '금', '토'];

const snap = await db.collection('sermons').get();
const rows = snap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((s) => (s.category ?? 'sermon') === 'sermon')
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

const dow = (d) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Date(`${d}T00:00:00Z`).getUTCDay() : null;

const nonSunday = rows.filter((s) => {
  const w = dow(s.date);
  return w !== null && w !== 0 && !/새벽/.test(s.title ?? '');
});
console.log(`설교 ${rows.length}편 중 주일이 아닌 날 ${nonSunday.length}편 (새벽 제외)`);
console.log('— 이 설교들이 "특별예배"로 바뀝니다 —\n');
for (const s of nonSunday)
  console.log(
    `  ${s.date}(${W[dow(s.date)]})  "${s.service ?? '-'}"  ${s.title}\n` +
      `      문서 ${s.id}   유튜브 ${s.youtubeId ?? '(없음)'}   홈페이지 ${s.sermonUrl ? '있음' : '없음'}`,
  );

const noDate = rows.filter((s) => dow(s.date) === null);
if (noDate.length) {
  console.log(`\n날짜가 이상한 설교 ${noDate.length}편 (구분을 건드리지 않습니다):`);
  for (const s of noDate) console.log(`  ${s.date}  ${s.title}`);
}
