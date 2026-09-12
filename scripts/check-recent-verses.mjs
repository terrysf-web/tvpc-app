/** 일회성 점검 — 최근 말씀 문서의 날짜·본문·출처를 그대로 보여 준다(읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('verses').orderBy('date', 'desc').limit(14).get();
console.log(`최근 말씀 ${snap.size}건 (오늘 ${new Date().toISOString().slice(0, 10)} UTC)`);
for (const d of snap.docs) {
  const v = d.data();
  console.log(
    [
      d.id,
      `출처=${v.source ?? '(없음)'}`,
      `본문=${v.reference ?? '(없음)'}`,
      `제목=${v.passageTitle ?? '(없음)'}`,
      `절수=${Array.isArray(v.passage) ? v.passage.length : 0}`,
      v.sermonAudioUrl ? '설교있음' : '',
    ]
      .filter(Boolean)
      .join(' | '),
  );
}
