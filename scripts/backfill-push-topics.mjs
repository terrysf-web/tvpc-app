/**
 * 일회성 — 알림 종류 선택 기능을 추가하면서, 이미 등록된 기기(pushTokens)에는
 * topics 필드가 없다. 그대로 두면 "오늘의 말씀" 발송 쿼리(array-contains
 * 'verse')에서 빠지게 되므로, 기존 기기는 지금까지 하던 대로 오늘의 말씀도
 * 받고 있었다는 뜻으로 topics: ['verse']를 채워 넣어 동작이 안 바뀌게 한다.
 * (긴급 공지는 topics와 무관하게 항상 전체 발송이라 영향 없음.)
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  if (d.get('topics')) continue; // 이미 있으면(새로 등록된 기기) 건드리지 않음
  await d.ref.update({ topics: ['verse'] });
  fixed++;
}
console.log(`topics 채움: ${fixed}대`);
process.exit(0);
