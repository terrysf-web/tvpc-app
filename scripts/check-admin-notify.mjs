/** 일회성 — 사역자 알림이 실제로 누구에게 가는지 확인(읽기 전용).
 *
 * 목회자(role === 'pastor')는 받지 않아야 한다. role이 안 적혀 있으면
 * 목회자인데도 받게 되므로, 빠진 사람이 없는지 눈으로 본다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();

const admins = (await db.collection('admins').get()).docs.map((d) => ({
  email: String(d.data().email || d.id).toLowerCase(),
  role: d.data().role ?? null,
  name: d.data().name ?? '',
}));
console.log(`admins 문서 ${admins.length}개\n`);
for (const a of admins)
  console.log(`  ${a.role === 'pastor' ? '✕ 안 보냄' : '→ 보냄  '}  role=${a.role ?? '(없음)'}  ${a.email}  ${a.name}`);

const targets = admins.filter((a) => a.role !== 'pastor').map((a) => a.email).slice(0, 30);
console.log(`\n알림 대상 이메일 ${targets.length}개: ${targets.join(', ') || '없음'}`);
if (targets.length === 0) process.exit(0);

const toks = (await db.collection('pushTokens').where('email', 'in', targets).get()).docs;
console.log(`\n그중 알림 켠 기기 ${toks.length}대:`);
for (const t of toks) console.log(`  · ${t.get('email')}  ${t.get('name') ?? ''}  (${String(t.get('ua') ?? '').slice(0, 44)})`);

// 목회자 기기가 섞여 있지 않은지 반대로도 확인
const pastors = admins.filter((a) => a.role === 'pastor').map((a) => a.email);
if (pastors.length) {
  const pt = (await db.collection('pushTokens').where('email', 'in', pastors.slice(0, 30)).get()).docs;
  console.log(`\n목회자 기기 ${pt.length}대 — 위 목록에 없어야 합니다:`);
  for (const t of pt) console.log(`  · ${t.get('email')}  ${t.get('name') ?? ''}`);
}
