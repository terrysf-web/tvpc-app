/** 일회성 — welcome/motto 문서의 현재 표어 구절 내용을 확인한다 (읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.doc('welcome/motto').get();
if (!snap.exists) {
  console.log('welcome/motto 문서가 없습니다.');
} else {
  const d = snap.data();
  console.log(JSON.stringify(d, null, 2));
}
