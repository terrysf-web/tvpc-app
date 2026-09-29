/**
 * 말씀 한 건의 제목만 고치기.
 *
 * 말씀 등록 화면에서 제목을 잘못 치신 날을 바로잡을 때 쓴다(2026-09-29에
 * "예레미야 13장 강해"가 "예레미야 13징 깅래"로 들어갔다 — 자판이 밀린
 * 오타였다). 제목 한 칸만 바꾸고 본문·설교 녹음·묵상 등 나머지는 손대지
 * 않는다.
 *
 * 실행: GitHub Actions → "Set verse title (one-off)"
 *   DATE=YYYY-MM-DD, TITLE=새 제목
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const date = (process.env.DATE ?? '').trim();
const title = (process.env.TITLE ?? '').trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) {
  console.error('DATE(YYYY-MM-DD)와 TITLE이 필요합니다.');
  process.exit(1);
}

initializeApp({ credential: cert(sa) });
const ref = getFirestore().doc(`verses/${date}`);
const snap = await ref.get();
if (!snap.exists) {
  console.error(`${date} 말씀 문서가 없습니다.`);
  process.exit(1);
}

const before = snap.get('passageTitle') ?? '(없음)';
if (before === title) {
  console.log(`${date} 제목이 이미 "${title}"입니다 — 바꿀 것이 없습니다.`);
} else {
  // 제목 한 칸만 바꾼다 — merge라 본문·설교 녹음·묵상은 그대로 남는다
  await ref.set({ passageTitle: title }, { merge: true });
  console.log(`${date} 제목을 고쳤습니다.`);
  console.log(`  전: ${before}`);
  console.log(`  후: ${title}`);
}
console.log(`  (본문은 그대로: ${snap.get('reference') ?? '(없음)'})`);
