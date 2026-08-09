/** 일회성 — 특정 날짜의 bulletins 문서 주요 필드를 확인(읽기 전용).
 * 사용법: TARGET_DATE=YYYY-MM-DD node scripts/check-bulletin-doc.mjs (비우면 최신 주보) */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const target = process.env.TARGET_DATE?.trim();
let date = target;
if (!date) {
  const snap = await db.collection('bulletins').orderBy('date', 'desc').limit(1).get();
  date = snap.docs[0]?.id;
}
console.log('조회 날짜:', date);
const doc = await db.doc(`bulletins/${date}`).get();
if (!doc.exists) {
  console.log('문서 없음');
  process.exit(0);
}
const d = doc.data();
console.log('date(문서 내부 필드):', d.date);
console.log('pageCount:', d.pageCount, 'pdfHash:', d.pdfHash);
console.log('updatedAt:', d.updatedAt?.toDate?.() ?? d.updatedAt);
console.log('\n=== order ===');
console.log(JSON.stringify(d.order, null, 2));
console.log('\n=== dawnReadings ===');
console.log(JSON.stringify(d.dawnReadings, null, 2));
console.log('\n=== fridayReading ===');
console.log(JSON.stringify(d.fridayReading, null, 2));
console.log('\n=== hymns (요약) ===');
console.log((d.hymns ?? []).map((h) => ({ number: h.number, titleKo: h.titleKo, titleEn: h.titleEn })));
console.log('\n=== scriptures (요약) ===');
console.log((d.scriptures ?? []).map((s) => ({ reference: s.reference, hasKo: !!s.textKo, hasEn: !!s.textEn })));
console.log('\n=== notices (제목만) ===');
console.log((d.notices ?? []).map((n) => n.title));

console.log('\n=== 새벽예배 QT 확인 (verses/2026-08-14, 2026-08-15) ===');
for (const vd of ['2026-08-14', '2026-08-15']) {
  const v = await db.doc(`verses/${vd}`).get();
  if (!v.exists) {
    console.log(`${vd}: 문서 없음`);
    continue;
  }
  const vv = v.data();
  console.log(`${vd}: reference=${vv.reference} source=${vv.source} passageTitle=${vv.passageTitle}`);
}
