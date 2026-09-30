/** 일회성 점검 — 앨범 명부 줄을 저장된 차례 그대로 보여준다(읽기 전용). */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const meta = await db.doc('albums/current').get();
console.log('소개 페이지:', meta.get('pageCount'), '| 명부 줄:', meta.get('rowCount'));
console.log('셀 목록:', (meta.get('cells') ?? []).join(', '));
console.log('원본:', meta.get('sourceUrl'));
console.log('변환 시각:', meta.get('updatedAt')?.toDate?.().toISOString());

const snap = await db.collection('albums/current/rows').orderBy('order').get();
console.log(`\n=== 줄 ${snap.size}개 (저장된 차례) ===`);
const perCell = new Map();
for (const d of snap.docs) {
  const v = d.data();
  perCell.set(v.cell, (perCell.get(v.cell) ?? 0) + 1);
  const img = String(v.image ?? '');
  console.log(
    `${String(v.order).padStart(3)} [${v.cell}${v.extra ? ' + ' + v.extra : ''}] ${v.names || '(이름 없음)'} | 높이 ${v.h} | 그림 ${Math.round(img.length / 1024)}KB`,
  );
}
console.log('\n=== 셀별 줄 수 ===');
for (const [c, n] of [...perCell.entries()].sort()) console.log(`${c}: ${n}`);
