/**
 * 일회성 진단 스크립트 — 현재 Firestore에 올라온 최신 주보 페이지 이미지를
 * 그대로 파일로 꺼내 GitHub Actions 아티팩트로 올린다.
 * (앱 스타일 텍스트 카드로 옮기기 위해 실제 주보 내용을 확인하는 용도)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('bulletins').orderBy('date', 'desc').limit(1).get();
if (snap.empty) {
  console.log('저장된 주보가 없습니다.');
  process.exit(0);
}
const date = snap.docs[0].id;
console.log('최신 주보 날짜:', date);

const pagesSnap = await db.collection('bulletins').doc(date).collection('pages').orderBy('order').get();
mkdirSync('dump', { recursive: true });
pagesSnap.docs.forEach((d, i) => {
  const image = String(d.get('image') ?? '');
  const m = image.match(/^data:image\/jpeg;base64,(.+)$/);
  if (!m) {
    console.log(`page ${i}: 이미지 형식이 예상과 다릅니다.`);
    return;
  }
  writeFileSync(`dump/page-${String(i).padStart(3, '0')}.jpg`, Buffer.from(m[1], 'base64'));
  console.log(`page ${i} 저장됨 (${image.length} chars)`);
});
