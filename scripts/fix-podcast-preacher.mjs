/**
 * 일회성 — 발표자 자동 인식(OCR)이 실패해 빈 값으로 남은 팟캐스트 문서의
 * preacher 필드를 수동으로 채운다. sync-sermons.mjs가 다음에 돌 때도
 * 이미 값이 있으면(기본값이 아니면) 덮어쓰지 않으므로 안전하게 유지된다.
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

const FIXES = {
  'yt-mBjBjXBziv8': '원승환 · 진선미', // 내가 예배를 방해하고 있다 (2026-08-08)
};

for (const [id, preacher] of Object.entries(FIXES)) {
  const ref = db.doc(`sermons/${id}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  ! ${id} 문서를 찾을 수 없습니다.`);
    continue;
  }
  await ref.update({ preacher });
  console.log(`  ✓ ${id} (${snap.get('title')}) preacher → "${preacher}"`);
}
console.log('완료');
process.exit(0);
