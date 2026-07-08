/**
 * content/ 폴더의 JSON 파일들을 Firestore에 업로드.
 *
 *   content/verses/2026-07-13.json  →  verses/2026-07-13 문서
 *   content/news/식별자.json         →  news/식별자 문서
 *   content/events/식별자.json       →  events/식별자 문서
 *
 * 파일을 추가/수정해서 푸시하면 GitHub Actions(sync-content.yml)가
 * 자동으로 업로드한다. 파일명이 문서 ID가 된다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();

const COLLECTIONS = ['verses', 'news', 'events'];
let total = 0;

for (const col of COLLECTIONS) {
  const dir = join('content', col);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const id = file.replace(/\.json$/, '');
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    await db.doc(`${col}/${id}`).set(data, { merge: true });
    console.log(`  ✓ ${col}/${id}`);
    total++;
  }
}

console.log(`완료: ${total}개 문서 업로드`);
process.exit(0);
