/** 일회성 — 일정(events)을 날짜순으로 확인(읽기 전용).
 *  "주일"이 들어간 일정이 일요일이 아니면 표시한다 — 주일은 늘 일요일이다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const W = ['일', '월', '화', '수', '목', '금', '토'];
const from = (process.env.FROM || '').trim();
const to = (process.env.TO || '').trim();

const rows = (await db.collection('events').get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((e) => (!from || String(e.sortKey) >= from) && (!to || String(e.sortKey) <= to))
  .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));

console.log(`일정 ${rows.length}건\n`);
const bad = [];
for (const e of rows) {
  const k = String(e.sortKey ?? '');
  const w = /^\d{4}-\d{2}-\d{2}$/.test(k) ? W[new Date(`${k}T00:00:00Z`).getUTCDay()] : '?';
  const wrong = /주일/.test(String(e.title ?? '')) && w !== '일' && w !== '?';
  if (wrong) bad.push(e);
  console.log(
    `  ${k}(${w})  ${String(e.title ?? '')}${wrong ? '   ← 주일인데 일요일이 아님' : ''}\n` +
      `      문서 ${e.id}   날짜표기 "${e.dateLabel ?? ''}"   ${e.detail ? `세부 "${e.detail}"` : ''}`,
  );
}
if (bad.length) {
  console.log(`\n! "주일"인데 일요일이 아닌 일정 ${bad.length}건:`);
  for (const e of bad) console.log(`  · ${e.sortKey}  ${e.title}  (${e.id})`);
} else {
  console.log('\n"주일" 일정은 모두 일요일입니다.');
}
