/** 일회성 — manual(직접 등록) verses 문서들이 실제로 어떤 형태인지 확인(읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('verses').get();
for (const d of snap.docs) {
  const v = d.data();
  if (v.source === 'auto') continue;
  console.log('---', d.id, '---');
  console.log('source:', v.source ?? null);
  console.log('imageUrl:', v.imageUrl ?? null);
  console.log('reference:', v.reference ?? null);
  console.log('passage 존재:', Array.isArray(v.passage) ? `배열(${v.passage.length}절)` : typeof v.passage);
  if (Array.isArray(v.passage) && v.passage.length > 0) {
    console.log('passage[0]:', JSON.stringify(v.passage[0]));
  }
}
