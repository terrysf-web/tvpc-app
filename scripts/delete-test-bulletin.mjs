/** 일회성 — 시연·미리보기용으로 만들었던 테스트 주보(source가 'test'로
 * 시작하는 문서 전부 — 'test', 'test-outdoor' 등)를 정리한다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// Firestore엔 "시작 문자열" 쿼리가 없어 범위로 흉내낸다: 'test' ≤ source < 'test'+(유니코드 최댓값 근처 문자)
const PREFIX_UPPER_BOUND = `test${String.fromCharCode(0xf8ff)}`;
const tests = await db
  .collection('bulletins')
  .where('source', '>=', 'test')
  .where('source', '<', PREFIX_UPPER_BOUND)
  .get();
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
