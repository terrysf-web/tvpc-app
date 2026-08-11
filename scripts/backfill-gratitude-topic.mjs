/**
 * 일회성 — 감사일기 알림 종류를 새로 추가하면서, 이미 등록된 기기에는
 * topics에 'gratitude'가 없다. 새 알림 종류는 기본으로 켜진 상태로
 * 시작하게(다른 알림들과 같은 기본값) 기존 기기에도 'gratitude'를 넣어준다.
 * topics 필드 자체가 없는 기기(드묾)는 ['verse','gratitude']로 채운다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();

const snap = await db.collection('pushTokens').get();
console.log(`등록 기기 ${snap.size}대`);

let fixed = 0;
for (const d of snap.docs) {
  const topics = d.get('topics');
  if (!Array.isArray(topics)) {
    await d.ref.update({ topics: ['verse', 'gratitude'] });
    fixed++;
  } else if (!topics.includes('gratitude')) {
    await d.ref.update({ topics: FieldValue.arrayUnion('gratitude') });
    fixed++;
  }
}
console.log(`gratitude 추가: ${fixed}대`);
process.exit(0);
