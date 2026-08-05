/** 일회성 — 긴급 알림(alerts) 컬렉션 전체를 확인용으로 출력한다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('alerts').get();
if (snap.empty) {
  console.log('alerts 컬렉션이 비어 있습니다.');
  process.exit(0);
}
for (const d of snap.docs) {
  const a = d.data();
  console.log(
    `- id=${d.id} status=${a.status} title="${a.title ?? ''}" body="${(a.body ?? '').slice(0, 60)}" createdAt=${a.createdAt ? new Date(Number(a.createdAt)).toISOString() : ''}`,
  );
}

const newsSnap = await db.collection('news').where('alert', '==', true).get();
console.log(`\nnews 컬렉션의 alert:true 문서 ${newsSnap.size}건:`);
for (const d of newsSnap.docs) {
  const n = d.data();
  console.log(`- id=${d.id} title="${n.title ?? ''}" body="${(n.body ?? '').slice(0, 60)}" date=${n.date ?? ''}`);
}
