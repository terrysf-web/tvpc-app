/**
 * 일회성 — 감사일기 알림을 기본값 off로 바꾸면서, 이전 백필
 * (backfill-gratitude-topic.mjs)로 기존 등록 기기에 조용히 켜져 있던
 * gratitude를 다시 뺀다. verse 등 다른 topics는 그대로 둔다.
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

const snap = await db.collection('pushTokens').where('topics', 'array-contains', 'gratitude').get();
console.log(`gratitude 켜진 기기 ${snap.size}대`);

let fixed = 0;
for (const d of snap.docs) {
  await d.ref.update({ topics: FieldValue.arrayRemove('gratitude') });
  fixed++;
}
console.log(`gratitude 뺌: ${fixed}대`);
process.exit(0);
