/** 일회성 점검 — 특정 날짜 말씀 문서의 모든 항목과 설교 파일 정보(읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const date = process.env.DATE || new Date().toISOString().slice(0, 10);
initializeApp({ credential: cert(sa), storageBucket: `${sa.project_id}.firebasestorage.app` });

const snap = await getFirestore().doc(`verses/${date}`).get();
if (!snap.exists) {
  console.log(`${date} 말씀 문서가 없습니다.`);
} else {
  const v = snap.data();
  console.log(`=== verses/${date} ===`);
  for (const [k, val] of Object.entries(v)) {
    const shown =
      Array.isArray(val) ? `[${val.length}개]` : typeof val === 'string' ? val.slice(0, 120) : val;
    console.log(`${k}: ${shown}`);
  }
  console.log('업데이트 시각(문서):', snap.updateTime?.toDate?.().toISOString());
  console.log('생성 시각(문서):', snap.createTime?.toDate?.().toISOString());
}

const [files] = await getStorage().bucket().getFiles({ prefix: `sermonAudio/${date}` });
for (const f of files) {
  const [m] = await f.getMetadata();
  console.log(`=== ${f.name} ===`);
  console.log('올린 시각:', m.timeCreated, '| 크기:', Math.round((m.size ?? 0) / 1024 / 1024) + 'MB');
  console.log('형식:', m.contentType);
}
