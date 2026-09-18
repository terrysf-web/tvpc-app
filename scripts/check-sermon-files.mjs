/** 일회성 점검 — 설교 녹음·표지·영상 파일이 언제 올라왔는지(읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa), storageBucket: `${sa.project_id}.firebasestorage.app` });
const bucket = getStorage().bucket();

for (const prefix of ['sermonAudio/', 'sermonCover/', 'sermonVideo/']) {
  const [files] = await bucket.getFiles({ prefix });
  console.log(`\n=== ${prefix} (${files.length}개) ===`);
  for (const f of files.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const mb = Math.round(Number(f.metadata?.size ?? 0) / 1048576);
    console.log(`  ${f.name}  ${mb}MB  올린 시각 ${f.metadata?.timeCreated}`);
  }
}
