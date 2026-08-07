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
  if (src === 'auto') auto.push(d.id);
  else manual.push(d.id);
}
auto.sort();
manual.sort();
console.log('전체 문서 수:', snap.size);
console.log('auto(자동 등록) 문서 수:', auto.length);
console.log('auto 날짜 범위:', auto[0], '~', auto[auto.length - 1]);
console.log('auto 날짜 목록:', JSON.stringify(auto));
console.log('manual(직접 등록) 문서 수:', manual.length);
console.log('manual 날짜 목록:', JSON.stringify(manual));
