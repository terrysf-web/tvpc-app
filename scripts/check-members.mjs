/** 일회성 점검 — 교인 명단을 상태별로 보여준다(읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection('members').get();
const byStatus = new Map();
for (const d of snap.docs) {
  const v = d.data();
  const s = String(v.status ?? '(없음)');
  if (!byStatus.has(s)) byStatus.set(s, []);
  byStatus.get(s).push({ id: d.id, ...v });
}

console.log(`교인 문서 ${snap.size}개\n`);
for (const [status, list] of [...byStatus.entries()].sort()) {
  console.log(`=== ${status} (${list.length}명) ===`);
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
  for (const m of list) {
    const marks = [
      m.guestAt ? `손님처리 ${new Date(m.guestAt).toLocaleString('ko-KR')}` : '',
      m.promotedAt ? `정교인승격 ${new Date(m.promotedAt).toLocaleString('ko-KR')}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    console.log(`  ${m.name} <${m.email}>${marks ? '  — ' + marks : ''}`);
  }
  console.log('');
}

const q = (process.env.FIND || '').trim().toLowerCase();
if (q) {
  console.log(`=== "${q}" 로 찾기 ===`);
  for (const d of snap.docs) {
    const v = d.data();
    if (`${v.name} ${v.email}`.toLowerCase().includes(q)) {
      console.log(JSON.stringify({ id: d.id, ...v }, null, 2));
    }
  }
}
