/** 일회성 — 사역자 화면에 뜨는 '자동 확인 상태'를 그대로 본다(읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const snap = await getFirestore().doc('syncStatus/bulletin').get();
if (!snap.exists) {
  console.log('syncStatus/bulletin 문서가 없습니다.');
  process.exit(0);
}
const d = snap.data();
const when = (v) => (v?.toDate ? v.toDate().toISOString() : (v ?? '—'));
console.log(`주보 날짜(bulletinDate): ${d.bulletinDate ?? '—'}`);
console.log(`마지막 확인(at)        : ${when(d.at)}`);
console.log(`메모(note)             : ${d.note ?? '—'}`);
console.log(`\n헌금 경고: ${d.offeringWarning ?? '(없음)'}`);
console.log(`  적힌 때 : ${when(d.offeringWarnedAt)}`);
console.log(`  주보날짜: ${d.offeringWarningDate ?? '(안 적혀 있음)'}`);
console.log(`\n주보 읽기 문제 ${(d.troubles ?? []).length}건:`);
for (const t of d.troubles ?? []) console.log(`  · ${t}`);
console.log(`  적힌 때 : ${when(d.troubledAt)}`);
console.log(`  주보날짜: ${d.troublesDate ?? '(안 적혀 있음)'}`);
console.log(`\n말씀 등록 실패 ${(d.verseFailures ?? []).length}건: ${(d.verseFailures ?? []).join(', ') || '없음'}`);
