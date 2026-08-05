/** 일회성 — 테스트용으로 보냈던 긴급 알림(alerts) 2건과, 그중 하나가
 * 소식 탭에 자동 등록된 news 문서를 정리한다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const ids = ['a-1784920656065', 'a-1784923309232'];
for (const id of ids) {
  const ref = db.doc(`alerts/${id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`alerts/${id}: 이미 없음`);
    continue;
  }
  await ref.delete();
  console.log(`삭제됨: alerts/${id} ("${snap.get('title')}")`);
}

const newsRef = db.doc('news/n-a-1784923309232');
const newsSnap = await newsRef.get();
if (newsSnap.exists) {
  await newsRef.delete();
  console.log(`삭제됨: news/n-a-1784923309232 ("${newsSnap.get('title')}")`);
} else {
  console.log('news/n-a-1784923309232: 이미 없음');
}
