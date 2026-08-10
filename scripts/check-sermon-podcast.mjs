/**
 * 일회성 진단 — 팟캐스트로 등록된 설교 문서들의 youtubeId/sermonUrl/category를
 * 확인한다. "목록엔 뜨는데 눌러도 안 열린다"는 문제의 원인 파악용.
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

const snap = await db.collection('sermons').where('category', '==', 'podcast').get();
console.log(`팟캐스트 문서 ${snap.size}건\n`);
const docs = snap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
for (const d of docs) {
  console.log(`id: ${d.id}`);
  console.log(`  title: ${d.title}`);
  console.log(`  date: ${d.date}`);
  console.log(`  category: ${d.category}`);
  console.log(`  youtubeId: ${d.youtubeId ?? '(없음)'}`);
  console.log(`  sermonUrl: ${d.sermonUrl ?? '(없음)'}`);
  console.log(`  imageUrl: ${d.imageUrl ?? '(없음)'}`);
  console.log(`  preacher: "${d.preacher ?? ''}"`);
  console.log(`  service/subtitle: "${d.service ?? ''}" / "${d.subtitle ?? ''}"`);
  if (d.youtubeId) console.log(`  → https://www.youtube.com/watch?v=${d.youtubeId}`);
  console.log('');
}
process.exit(0);
