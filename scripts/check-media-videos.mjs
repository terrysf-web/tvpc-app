/** 일회성 — 교회 미디어 "영상" 탭에 무엇이 보이는지 확인(읽기 전용).
 *
 * 영상 탭은 교회가 유튜브에 만들어 둔 "교회 영상" 재생목록을 그대로
 * 보여준다(churchVideo 표시, churchVideoOrder 차례). 재생목록에 넣고
 * 빼는 것이 곧 앱에 올리고 내리는 일이다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();

const snap = await db.collection('sermons').get();
const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const by = (c) => all.filter((s) => (s.category ?? 'sermon') === c);
console.log(`sermons 문서 ${all.length}개`);
for (const c of ['sermon', 'podcast', 'praise', 'etc'])
  console.log(`  ${c}: ${by(c).length}개`);

const shown = all
  .filter((s) => s.churchVideo)
  .sort((a, b) => (a.churchVideoOrder ?? 0) - (b.churchVideoOrder ?? 0));
console.log(`\n=== 영상 탭 (교회 영상 재생목록) ${shown.length}개 ===`);
const today = new Date().toISOString().slice(0, 10);
let suspect = 0;
shown.forEach((s, i) => {
  const flag = s.date === today ? '  ← 날짜 확인 필요' : '';
  if (flag) suspect++;
  console.log(`${String(i + 1).padStart(3)}. ${s.date}  ${s.title}${flag}`);
});
if (suspect) console.log(`\n! 오늘 날짜로 된 영상 ${suspect}개 — 업로드 날짜를 못 읽었을 수 있습니다.`);

const off = all.filter(
  (s) => !s.churchVideo && ['praise', 'etc'].includes(s.category ?? 'sermon'),
);
console.log(`\n=== 재생목록에 없어 영상 탭에 안 나오는 찬양·기타 ${off.length}개 ===`);
for (const s of off.sort((a, b) => String(b.date).localeCompare(String(a.date))))
  console.log(`  ${s.date}  [${s.category}] ${s.title}`);
