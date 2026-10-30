/**
 * 예배 구분을 날짜에 맞춘다 — 일요일이 아니면 특별예배.
 *
 * 새벽·금요성령집회·수요예배는 그 자체가 정해진 예배라 그대로 둔다.
 * 나머지는 날짜의 요일로 정한다: 일요일이면 주일예배, 아니면 특별예배.
 * 월요일·금요일에 "주일예배"가 있을 수는 없다.
 *
 * 동기화는 홈페이지 최근 27건만 다시 손대므로, 그보다 오래된 설교는
 * 한 번 훑어 줘야 한다. 유튜브에 묻지 않고 저장된 값만 보므로 빠르다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const APPLY = process.env.APPLY === '1';
const W = ['일', '월', '화', '수', '목', '금', '토'];

/** 그 자체가 정해진 예배라 요일로 다시 정하지 않는다 */
const KEEP = new Set(['새벽기도회', '금요성령집회', '수요예배']);

const snap = await db.collection('sermons').get();
const rows = snap.docs
  .map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
  .filter((s) => (s.category ?? 'sermon') === 'sermon')
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

console.log(`설교 ${rows.length}편${APPLY ? ' (고칩니다)' : ' (보기만 합니다)'}\n`);
let changed = 0;
for (const s of rows) {
  if (KEEP.has(s.service)) continue;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.date))) {
    console.log(`  ? ${s.date}  날짜를 알 수 없어 그대로 둡니다 — ${s.title}`);
    continue;
  }
  const d = new Date(`${s.date}T00:00:00Z`).getUTCDay();
  const want = d === 0 ? '주일예배' : '특별예배';
  if (s.service === want) continue;
  changed++;
  console.log(`  ↻ ${s.date}(${W[d]})  "${s.service ?? '-'}" → "${want}"   ${s.title}`);
  if (APPLY) await s.ref.update({ service: want, subtitle: want });
}
console.log(`\n바뀜 ${changed}편${APPLY ? '' : ' — 아직 고치지 않았습니다'}`);
