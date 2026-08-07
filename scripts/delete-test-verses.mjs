/** 일회성 — 테스트로 직접 입력했던 verses 문서 3개(2026-07-07~09) 삭제. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const TARGET_IDS = ['2026-07-07', '2026-07-08', '2026-07-09'];

for (const id of TARGET_IDS) {
  const ref = db.collection('verses').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(id, '→ 이미 없음');
    continue;
  }
  await ref.delete();
  console.log(id, '→ 삭제 완료');
}
