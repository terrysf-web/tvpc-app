/**
 * 배경 사진 출처 문구만 저장 — 그림은 손대지 않는다.
 * 관리자 화면에서도 할 수 있지만, 서버에서 한 번에 넣을 때 쓴다.
 *
 *   WHICH=original CREDIT="Canva" node scripts/set-bg-credit.mjs
 *   WHICH=sunday CREDIT="Canva" node scripts/set-bg-credit.mjs
 *
 * 필요 시크릿: FIREBASE_SERVICE_ACCOUNT
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const WHICH = process.env.WHICH;
const CREDIT = process.env.CREDIT;
if (WHICH !== 'original' && WHICH !== 'sunday') {
  console.error('WHICH은 original 또는 sunday 여야 합니다.');
  process.exit(1);
}
if (!CREDIT) {
  console.error('CREDIT(출처 문구)이 필요합니다.');
  process.exit(1);
}

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();

await db.doc(`verseBg/${WHICH}`).set({ credit: CREDIT.trim() }, { merge: true });
console.log(`완료 — verseBg/${WHICH} credit = "${CREDIT.trim()}"`);
