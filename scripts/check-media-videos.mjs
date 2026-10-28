/** 일회성 — 교회 미디어 "영상" 탭에 무엇이 보이고 무엇이 안 보이는지 확인(읽기 전용).
 *
 * 영상 탭은 설교·팟캐스트를 뺀 나머지(찬양·기타)만 보여준다. 거기서 다시
 * "은혜안에"가 들어간 제목은 찬양 탭으로 보내는데, 찬양 탭을 숨기면 그
 * 영상들이 앱 어디에도 안 나온다. 그 숨은 것들을 그대로 드러낸다. */
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

const isEunhyeane = (s) => /은혜안에/.test(s.title ?? '') && !!s.youtubeId;
const pool = all.filter((s) => ['praise', 'etc'].includes(s.category ?? 'sermon'));
const shown = pool.filter((s) => !isEunhyeane(s));
const hidden = pool.filter(isEunhyeane);
const sort = (a, b) => String(b.date).localeCompare(String(a.date));

console.log(`\n=== 영상 탭에 보이는 것 (${shown.length}개) ===`);
for (const s of shown.sort(sort)) console.log(`  ${s.date}  [${s.category}] ${s.title}`);

console.log(`\n=== 찬양 탭으로 보내져 지금 안 보이는 것 (${hidden.length}개) ===`);
for (const s of hidden.sort(sort)) console.log(`  ${s.date}  [${s.category}] ${s.title}`);

const pv = await db.collection('praiseVideos').get();
console.log(`\n=== praiseVideos(은혜안에 채널) ${pv.size}개 — 찬양 탭에만 나오므로 지금 전부 안 보임 ===`);
for (const d of pv.docs.map((d) => d.data()).sort(sort).slice(0, 15))
  console.log(`  ${d.date}  ${d.title}`);
if (pv.size > 15) console.log(`  … 외 ${pv.size - 15}개`);
