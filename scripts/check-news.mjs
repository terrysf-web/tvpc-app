/** 일회성 — 소식(news) 문서를 날짜순으로 확인(읽기 전용).
 *  소식 탭의 "행사" 카드가 어디서 왔는지, 실제 달력에 있는 일정인지 대조할 때 쓴다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const W = ['일', '월', '화', '수', '목', '금', '토'];
const from = (process.env.FROM || '').trim();
const to = (process.env.TO || '').trim();

const rows = (await db.collection('news').get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((e) => (!from || String(e.date ?? '') >= from) && (!to || String(e.date ?? '') <= to))
  .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));

console.log(`소식 ${rows.length}건\n`);
for (const e of rows) {
  const k = String(e.date ?? '');
  const w = /^\d{4}-\d{2}-\d{2}$/.test(k) ? W[new Date(`${k}T00:00:00Z`).getUTCDay()] : '?';
  console.log(
    `  ${k}(${w})  [${e.category ?? '-'}]  ${String(e.title ?? '')}\n` +
      `      문서 ${e.id}${e.url ? `\n      링크 ${e.url}` : ''}${e.imageUrl ? '\n      [포스터]' : ''}`,
  );
}
