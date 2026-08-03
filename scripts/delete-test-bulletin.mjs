/** 일회성 — 시연용으로 만들었던 테스트 주보(source: 'test')를 정리한다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const tests = await db.collection('bulletins').where('source', '==', 'test').get();
if (tests.empty) {
  console.log('테스트 주보가 없습니다.');
  process.exit(0);
}
for (const d of tests.docs) {
  const pages = await d.ref.collection('pages').get();
  await Promise.all(pages.docs.map((p) => p.ref.delete()));
  await d.ref.delete();
  console.log(`삭제됨: bulletins/${d.id}`);
}
