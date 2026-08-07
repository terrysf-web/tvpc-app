/** 일회성 — verses 컬렉션의 auto 문서 날짜 범위·개수 확인(읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('verses').get();
let auto = [];
let manual = [];
for (const d of snap.docs) {
  const src = d.get('source');
  if (src === 'auto') auto.push({ id: d.id, translation: d.get('translation') ?? null });
  else manual.push(d.id);
}
auto.sort((a, b) => (a.id < b.id ? -1 : 1));
manual.sort();
console.log('전체 문서 수:', snap.size);
console.log('auto(자동 등록) 문서 수:', auto.length);
console.log('auto 날짜 범위:', auto[0]?.id, '~', auto[auto.length - 1]?.id);
console.log('auto 날짜별 번역본:', JSON.stringify(auto));
const notGae = auto.filter((a) => a.translation !== 'gae');
console.log('개역개정이 아닌 문서 수:', notGae.length, notGae.map((a) => a.id));
console.log('manual(직접 등록) 문서 수:', manual.length);
console.log('manual 날짜 목록:', JSON.stringify(manual));
