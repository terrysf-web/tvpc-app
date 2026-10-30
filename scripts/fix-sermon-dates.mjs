/**
 * 설교 날짜를 유튜브에 맞춰 바로잡는다.
 *
 * 홈페이지 목록에서 만든 설교(web-...)는 홈페이지에 적힌 날짜를 썼는데,
 * 그게 글을 올린 날이라 실제 예배일과 다를 때가 있다. 교회는 유튜브
 * 제목에 [MM/DD/YYYY]로 예배일을 적으므로 그게 진짜다.
 *
 * 홈페이지 목록은 최근 27건만 남아 있어서 지난 설교는 동기화가 다시
 * 손대지 않는다. 그래서 이 도구로 한 번 훑는다.
 *
 * APPLY=1이 없으면 무엇이 바뀌는지 보여주기만 한다(기본값).
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchText } from './lib/youtube.mjs';

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const APPLY = process.env.APPLY === '1';
const W = ['일', '월', '화', '수', '목', '금', '토'];
const dow = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? W[new Date(`${d}T00:00:00Z`).getUTCDay()] : '?');

function fromKoreanDate(text) {
  const m = String(text).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}

/** 영상의 실제 예배일 — 제목의 [MM/DD/YYYY] 우선, 없으면 올린 날짜 */
async function videoDate(id) {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${id}&hl=ko`, 2);
    const t = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/)?.[1] ?? '';
    const m = t.match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
    if (m) return { date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, from: '제목', title: t };
    const iso = html.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/) || html.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/);
    if (iso) return { date: iso[1], from: '올린날', title: t };
    const ko = html.match(/"publishDate":\{"simpleText":"([^"]+)"/) || html.match(/"dateText":\{"simpleText":"([^"]+)"/);
    const d = ko ? fromKoreanDate(ko[1]) : null;
    return d ? { date: d, from: '올린날', title: t } : null;
  } catch {
    return null;
  }
}

const snap = await db.collection('sermons').get();
const rows = snap.docs
  .map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
  .filter((s) => (s.category ?? 'sermon') === 'sermon' && s.youtubeId)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

console.log(`설교 ${rows.length}편 확인${APPLY ? ' (고칩니다)' : ' (보기만 합니다 — 고치려면 APPLY)'}\n`);
let changed = 0;
let unread = 0;
for (const s of rows) {
  const v = await videoDate(s.youtubeId);
  if (!v) {
    unread++;
    console.log(`  ? ${s.date}  ${s.title} — 유튜브를 읽지 못했습니다(그대로 둡니다)`);
    continue;
  }
  if (v.date === s.date) continue;
  changed++;
  console.log(
    `  ↻ ${s.date}(${dow(s.date)}) → ${v.date}(${dow(v.date)})  [${v.from}]  ${s.title}\n` +
      `      문서 ${s.id}   유튜브 제목 ${v.title.slice(0, 60)}`,
  );
  if (!APPLY) continue;

  // web-{날짜}-{해시} 문서는 번호에 날짜가 박혀 있어 새 번호로 옮긴다
  const m = s.id.match(/^web-\d{4}-\d{2}-\d{2}-([0-9a-f]{6})$/);
  if (m) {
    const { ref, id, ...data } = s;
    await db.doc(`sermons/web-${v.date}-${m[1]}`).set({ ...data, date: v.date }, { merge: true });
    await ref.delete();
    console.log(`      → web-${v.date}-${m[1]} 로 옮기고 옛 문서를 지웠습니다`);
  } else {
    await s.ref.update({ date: v.date });
  }
}
console.log(`\n바뀜 ${changed}편${unread ? `, 못 읽음 ${unread}편` : ''}${APPLY ? '' : ' — 아직 아무것도 고치지 않았습니다'}`);
