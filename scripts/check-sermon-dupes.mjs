/** 일회성 — 같은 설교가 여러 번 올라와 있는지 확인(읽기 전용).
 *  DATE=YYYY-MM-DD를 주면 그 날짜만, 비우면 전체에서 겹치는 것만 본다. */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();

const only = (process.env.DATE || '').trim();
const find = (process.env.FIND || '').trim();
const snap = await db.collection('sermons').get();
const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const show = (s) =>
  console.log(
    [
      `  ${s.id}`,
      `     날짜 ${s.date}  분류 ${s.category ?? 'sermon'}  예배 ${s.service ?? '-'}`,
      `     제목 ${s.title}`,
      `     설교자 ${s.preacher ?? '-'}  본문 ${s.scripture || '-'}`,
      `     유튜브 ${s.youtubeId ?? '-'}  이미지 ${s.imageUrl ? '있음' : '없음'}`,
    ].join('\n'),
  );

if (find) {
  const n = (t) => String(t).replace(/\s/g, '').toLowerCase();
  const rows = all
    .filter((s) => n(s.title).includes(n(find)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  console.log(`=== 제목에 "${find}" 들어간 문서 ${rows.length}개 ===`);
  rows.forEach(show);
} else if (only) {
  const rows = all.filter((s) => s.date === only);
  console.log(`=== ${only} 문서 ${rows.length}개 ===`);
  rows.forEach(show);
} else {
  // 같은 날 + 거의 같은 제목이면 겹친 것으로 본다
  const key = (s) =>
    `${s.date}|${String(s.title).replace(/[\s()[\]/·,.-]/g, '').toLowerCase().slice(0, 24)}`;
  const groups = new Map();
  for (const s of all) {
    const k = key(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1);
  console.log(`sermons 문서 ${all.length}개 중 겹치는 묶음 ${dupes.length}개\n`);
  for (const g of dupes) {
    console.log(`── ${g[0].date}  "${g[0].title.slice(0, 50)}" — ${g.length}개 ──`);
    g.forEach(show);
    console.log('');
  }
}
