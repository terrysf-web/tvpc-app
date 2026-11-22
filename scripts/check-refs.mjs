/** 일회성 — 저장된 성경 참조 표기 형식을 모아 본다(읽기 전용).
 *  English 탭에서 책 이름이 영어로 안 바뀌는 표기가 있는지 확인할 때 쓴다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BIBLE_BOOK_EN } from './data/bible-en.mjs';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();

const refs = new Set();
for (const d of (await db.collection('verses').get()).docs) {
  const r = d.get('reference');
  if (r) refs.add(String(r));
}
for (const d of (await db.collection('bulletins').get()).docs) {
  for (const s of d.get('scriptures') ?? []) if (s?.reference) refs.add(String(s.reference));
  if (d.get('sermon')?.scripture) refs.add(String(d.get('sermon').scripture));
}
for (const d of (await db.collection('sermons').get()).docs) {
  const r = d.get('scripture');
  if (r) refs.add(String(r));
}

const list = [...refs].sort();
console.log(`성경 참조 ${list.length}가지\n`);
const unknown = [];
for (const r of list) {
  const book = r.match(/^([가-힣0-9]+)/)?.[1] ?? '';
  const ok = !!BIBLE_BOOK_EN[book];
  if (!ok) unknown.push(r);
}
console.log(`사전에 있는 책: ${list.length - unknown.length}가지`);
console.log(`사전에 없어 한글로 남는 표기: ${unknown.length}가지`);
for (const r of unknown) console.log(`  · ${JSON.stringify(r)}`);
