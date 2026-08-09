/** 일회성 — 저장된 주보 문서들을 날짜순으로 훑어, 찬송가 가사·성경 본문이 통째로
 * 인쇄된(=야외예배 등 특별 주보 형식) 문서를 찾는다(읽기 전용).
 * 사용법: node scripts/list-bulletins.mjs */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('bulletins').orderBy('date', 'desc').get();
console.log(`총 ${snap.size}건`);
for (const doc of snap.docs) {
  const d = doc.data();
  const hymnCount = (d.hymns ?? []).length;
  const scriptureCount = (d.scriptures ?? []).length;
  const orderCount = (d.order ?? []).length;
  const flag = hymnCount > 0 || scriptureCount > 0 ? '  ← 가사/본문 있음' : '';
  console.log(
    `${doc.id}  source=${d.source ?? 'real'}  order=${orderCount}  hymns=${hymnCount}  scriptures=${scriptureCount}${flag}`,
  );
}
