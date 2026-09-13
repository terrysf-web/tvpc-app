/**
 * 저장소에 있는 설교 녹음을 그날 말씀에 다시 이어 붙인다.
 *
 * 주보 동기화가 그날 말씀을 통째로 다시 쓰면서 설교 녹음 주소까지 지워
 * 버린 일이 있었다(2026-09-11). 파일 자체는 저장소에 그대로 있으므로,
 * 파일 이름 앞의 날짜로 다시 이어 주면 된다.
 *
 * 이미 주소가 들어 있는 날짜는 건드리지 않는다. 한 날짜에 파일이 여러 개면
 * 가장 나중에 올린 것을 쓴다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const bucketName = `${sa.project_id}.firebasestorage.app`;
initializeApp({ credential: cert(sa), storageBucket: bucketName });
const db = getFirestore();
const bucket = getStorage().bucket();

const [files] = await bucket.getFiles({ prefix: 'sermonAudio/' });

/** 날짜별로 가장 나중에 올린 파일 하나씩 */
const latest = new Map();
for (const f of files) {
  const m = f.name.match(/sermonAudio\/(\d{4}-\d{2}-\d{2})-(\d+)\./);
  if (!m) continue;
  const [, date, stamp] = m;
  const cur = latest.get(date);
  if (!cur || Number(stamp) > cur.stamp) latest.set(date, { file: f, stamp: Number(stamp) });
}

console.log(`저장소의 설교 녹음 ${latest.size}일치`);

for (const [date, { file }] of [...latest].sort()) {
  const ref = db.doc(`verses/${date}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  – ${date}: 그날 말씀 문서가 없어 건너뜁니다 (${file.name})`);
    continue;
  }
  if (String(snap.get('sermonAudioUrl') ?? '').trim()) {
    console.log(`  · ${date}: 이미 이어져 있습니다`);
    continue;
  }

  // 앱이 쓰는 주소에는 내려받기 토큰이 필요하다 — 파일에 있으면 그대로 쓰고,
  // 없으면(콘솔에서 올린 파일 등) 새로 붙여 준다.
  const [meta] = await file.getMetadata();
  let token = meta.metadata?.firebaseStorageDownloadTokens;
  if (!token) {
    token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    file.name,
  )}?alt=media&token=${token}`;

  await ref.set({ sermonAudioUrl: url }, { merge: true });
  console.log(`  ✓ ${date}: ${file.name} 다시 이었습니다`);
}

console.log('끝났습니다.');
