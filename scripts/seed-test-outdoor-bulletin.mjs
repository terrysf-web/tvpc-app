/**
 * 일회성 스크립트 — 방금 만든 "1부/2부 탭 → 한글/English 전환" 기능을 실제
 * 앱 화면으로 미리 보여드리기 위해, 작년(2025-08-17) 실제 야외예배 주보의
 * 내용을 그대로 옮겨 별도 테스트 주보를 하나 만든다. 실제 주보에는 손대지
 * 않는다. seed-test-bulletin.mjs와 같은 방식 — 나중에 지우려면 Firestore
 * 콘솔에서 이 스크립트가 만든 날짜의 문서만 지우면 된다.
 *
 * 날짜는 눈에 띄지 않게 먼 과거로 숨기는 대신, 올해 실제 야외예배가 있는
 * 날짜(OUTDOOR_DATE)에 그대로 만든다 — source가 'test-outdoor'라 관리자가
 * 아니면 어차피 안 보이고(client + firestore.rules 양쪽에서 막음), 그 날짜가
 * 되면 실제 주보 동기화가 이 문서를 그대로 덮어써서 자연스럽게 진짜 내용으로
 * 바뀐다.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

// sync-bulletin.mjs의 fillMissingKoreanScripture와 같은 방식 — 인쇄본에 한글이
// 없던 구절(작년 야외예배 주보의 창세기 1:26-27은 영어만 인쇄됨)도 실제
// 개역개정 데이터로 채워서, "한글 서비스에도 개역개정이 있어야 한다"는 수정이
// 목업에도 똑같이 반영되게 한다(기억으로 대충 옮겨 적지 않음).
const scriptDir = new URL('.', import.meta.url).pathname;
const bible = JSON.parse(gunzipSync(readFileSync(`${scriptDir}data/gae.json.gz`)).toString());
function koreanVerses(book, ch, v1, v2) {
  const verses = bible[book]?.[ch - 1];
  if (!verses) return null;
  const picked = [];
  for (let v = v1; v <= v2; v++) if (verses[v - 1]) picked.push(`${v}. ${verses[v - 1]}`);
  return picked.length ? picked.join(' ') : null;
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const SOURCE_DATE = '2026-08-09'; // 페이지 이미지만 복사(내용과 무관) — 원본은 손대지 않음
const OUTDOOR_DATE = process.env.OUTDOOR_DATE?.trim() || '2026-08-16';
const TEST_DATE = OUTDOOR_DATE;
console.log(`테스트(야외예배) 주보 날짜: ${TEST_DATE} (원본 페이지는 ${SOURCE_DATE}에서 복사)`);

const oldTests = await db.collection('bulletins').where('source', '==', 'test-outdoor').get();
for (const d of oldTests.docs) {
  if (d.id === TEST_DATE) continue;
  const oldPages = await d.ref.collection('pages').get();
  await Promise.all(oldPages.docs.map((p) => p.ref.delete()));
  await d.ref.delete();
  console.log(`  · 이전 테스트(야외예배) 주보(${d.id}) 정리`);
}

// ── 작년 실제 야외예배 주보(2025-08-17) 내용 그대로 ──────────────────
const sermon = {
  title: '"보시기에 참 좋았더라" (It was very good!)',
  scripture: '창세기 1:31',
  preacher: '허성영 목사 / 최재하 전도사',
};

// 1부/2부 구분 없이 shared만 있는 단일 예배 — 방금 만든 한글/English 전환이
// 이 order를 보고 켜진다.
const order = [
  { name: '예배의 부름', shared: '인도자*' },
  { name: '참회의 기도/신앙고백', shared: '*' },
  { name: '찬송 / 헌금', shared: '찬송가 28장 [복의 근원 강림하사]*' },
  {
    name: '어린이 설교',
    shared: '"Made in His Image" / 창세기 [Genesis] 1:26-27 · 최재하 전도사',
  },
  { name: '교회소식 / 새가족환영', shared: '' },
  { name: '기도', shared: 'Mike Kim 집사' },
  { name: '성경봉독', shared: '창세기 [Genesis] 1:31' },
  { name: '설교', shared: '"보시기에 참 좋았더라" (It was very good!) · 허성영 목사 / 최재하 전도사' },
  { name: '찬송', shared: '찬송가 478장 [참 아름다워라]*' },
  { name: '축도', shared: '허성영 담임목사*' },
];

const hymns = [
  {
    number: '28',
    titleKo: '복의 근원 강림하사',
    titleEn: 'Come, Thou Fount of Every Blessing',
    lyricsKo:
      '1. 복의 근원 강림하사 찬송하게 하소서\n' +
      '한량없이 자비하심 측량 할 길 없도다\n' +
      '천사들의 찬송가를 내게 가르치소서\n' +
      '구속하신 그 사랑을 항상 찬송합니다.\n\n' +
      '2. 주의 크신 도움받아 이때까지 왔으니\n' +
      '이와 같이 천국에도 이르기를 바라네\n' +
      '하나님의 품을 떠나 죄에 빠진 우리를\n' +
      '예수 구원하시려고 보혈 흘려 주셨네\n\n' +
      '3. 주의 귀한 은혜받고 일생 빚진 자 되네\n' +
      '주의 은혜 사슬되사 나를 주께 매소서\n' +
      '우리 맘은 연약하여 범죄하기 쉬우니\n' +
      '하나님이 받으시고 천국인을 치소서 아멘',
    lyricsEn:
      "(1) Come, Thou Fount of ev'ry blessing, tune my heart to sing Thy grace;\n" +
      'Streams of mercy, never ceasing, Call for songs of loudest praise.\n' +
      'Teach me some melodious sonnet, Sung by flaming tongues above;\n' +
      "Praise the mount! I'm fixed up on it, Mount of God's unchanging love,\n\n" +
      "(2) Here I raise my Ebenezer; Hither by Thy help I'm come;\n" +
      'And I hope, by Thy good pleasure, Safely to arrive at home.\n' +
      "Jesus sought me when a stranger, Wand'ring from the fold of God;\n" +
      'He, to rescue me from danger, Interposed His precious blood.\n\n' +
      "(3) O to grace how great a debtor Daily I'm constrained to be;\n" +
      "Let your goodness like a fetter, Bind my wand'ring heart to Thee.\n" +
      "Prone to wander, Lord, I feel it, Prone to leave the God I love;\n" +
      "Here's my heart, O take and seal it, Seal it for Thy courts above. A-men.",
  },
  {
    number: '478',
    titleKo: '참 아름다워라',
    titleEn: "This Is My Father's World",
    lyricsKo:
      '1. 참 아름다워라 주님의 세계는\n' +
      '저 솔로몬의 옷보다 더 고운 백합화\n' +
      '주 찬송하는 듯 저 맑은 새소리\n' +
      '내 아버지의 지으신 그 솜씨 깊도다\n\n' +
      '2. 참 아름다워라 주님의 세계는\n' +
      '저 아침해와 저녁놀 밤하늘 빛난 별\n' +
      '망망한 바다와 늘 푸른 봉우리\n' +
      '다 주 하나님 영광을 잘 드러내도다\n\n' +
      '3. 참 아름다워라 주님의 세계는\n' +
      '저 산에 부는 바람과 잔잔한 시냇물\n' +
      '그 소리 가운데 주 음성 들리니\n' +
      '주 하나님의 큰 뜻을 나 알듯 하도다 아멘',
    lyricsEn:
      "(1) This is my Father's world, And to my listening ears,\n" +
      'All nature sings, and round me rings The music of the spheres.\n' +
      "This is my Father's world: I rest me in the thought\n" +
      "Of rocks and trees, of skies and seas; His hand the wonders wrought.\n\n" +
      "(2) This is my Father's world, The birds their carols raise,\n" +
      "The morning light, the lily white, Declare their Maker's praise.\n" +
      "This is my Father's world: He shines in all that's fair,\n" +
      'In the rustling grass I hear him pass, He speaks to me everywhere.\n\n' +
      "(3) This is my Father's world, O let me ne'er forget\n" +
      'That though the wrong seems oft so strong, God is the Ruler yet,\n' +
      "This is my Father's world: The battle is not done\n" +
      "Jesus who died shall be satisfied, And earth and heaven be one. A-men.",
  },
];

const scriptures = [
  {
    reference: '창세기 1:26-27',
    // 작년 원본엔 이 구절 한글이 인쇄돼 있지 않았지만(영어만), 개역개정
    // 데이터로 채워 넣는다 — 한글 서비스에서도 개역개정이 있어야 하니까.
    textKo: koreanVerses('창세기', 1, 26, 27),
    textEn:
      '26. Then God said, "Let us make man in our image, in our likeness, and let them rule over ' +
      'the fish of the sea and the birds of the air, over the livestock, over all the earth, and ' +
      'over all the creatures that move along the ground."\n' +
      '27. So God created man in his own image, in the image of God he created him; male and ' +
      'female he created them.',
  },
  {
    reference: '창세기 1:31',
    textKo:
      '하나님이 그 지으신 모든 것을 보시니 보시기에 심히 좋았더라 저녁이 되며 아침이 되니 이는 여섯째 날이니라',
    textEn:
      'God saw all that he had made, and it was very good. And there was evening, and there was ' +
      'morning--the sixth day.',
  },
];

const notices = [
  {
    title: '야외예배 및 체육대회',
    body:
      '오늘 주일 예배는 야외예배로 드립니다. 일정: 9시 30분 이름표 배부 · 10시 예배 · ' +
      '11시 셀별 인사 및 체육대회 · 1시 점심 및 친교',
  },
  {
    title: '새가족반 모임',
    body: '다음 주일 오후 1시 15분에 Room 9에서 있습니다. 대상은 4월부터 7월까지 등록하신 분들입니다.',
  },
  { title: '임직자 교육', body: '다음 주일 오후 2시에 있습니다.' },
  {
    title: '세례 신청',
    body:
      '세례(입교/유아세례 포함)를 받고자 하시는 분은 8월 말까지 신청하여 주시기 바랍니다. ' +
      '(세례자 교육: KM - 허성영 목사님 / EM - 조재희 장로님 / 중고등부 - 최재하 전도사님)',
  },
  {
    title: '교회 봉사자 모집',
    body: '주님의 몸 된 교회를 섬길 일꾼을 모집합니다. 방송팀, 주일학교 교사.',
  },
];

// 작년엔 평소 없던 "목적헌금" 항목이 있었다 — 헌금표는 어떤 이름의 줄이 와도
// 그대로 옮겨지는지 같이 확인할 수 있게 그대로 둔다.
const offering = {
  columns: ['유초등부', '중고등부', '한어부', '영어부'],
  rows: [
    { label: '주일헌금', values: ['31.00', '20.00', '1,701.00', '66.00'] },
    { label: '십일조', values: ['–', '–', '5,035.00', '1,200.00'] },
    { label: '감사헌금', values: ['–', '–', '1,550.00', '–'] },
    { label: '선교헌금', values: ['–', '–', '175.00', '–'] },
    { label: '목적헌금', values: ['50.00', '–', '400.00', '–'] },
    { label: 'VBS', values: ['–', '–', '180.00', '–'] },
  ],
  total: '10,408.00',
};

const duty = [
  {
    title: '주일',
    columns: ['8월 16일', '8월 23일', '8월 30일', '9월 6일'],
    rows: [
      { label: '기도', values: ['Mike Kim 집사', '김희주 집사', '김희주 집사', '안형환 집사'] },
      { label: '안내', values: ['Cell 5', 'Cell 5', 'Cell 5', 'Cell 6'] },
      { label: '친교', values: ['야외 예배', 'Cell 14', 'Cell 15', 'Cell 2'] },
    ],
  },
];

const staff = [
  { role: '담임목사', names: '허성영' },
  { role: '교역자', names: '안현신 전도사, 최재하 전도사, 안현숙 교육사' },
];

// 원본 페이지 이미지를 그대로 복사(카드 UI 확인용이라 내용은 무관) — 원본 문서는 손대지 않는다.
const srcPages = await db.collection('bulletins').doc(SOURCE_DATE).collection('pages').orderBy('order').get();
if (srcPages.empty) {
  console.error(`✗ 원본 주보(${SOURCE_DATE})의 페이지 이미지를 찾을 수 없습니다.`);
  process.exit(1);
}

const oldTestPages = await db.collection('bulletins').doc(TEST_DATE).collection('pages').get();
await Promise.all(oldTestPages.docs.map((d) => d.ref.delete()));

for (const d of srcPages.docs) {
  await db
    .collection('bulletins')
    .doc(TEST_DATE)
    .collection('pages')
    .doc(d.id)
    .set({ order: d.get('order'), image: d.get('image'), w: d.get('w'), h: d.get('h') });
}

await db.doc(`bulletins/${TEST_DATE}`).set({
  date: TEST_DATE,
  pageCount: srcPages.size,
  source: 'test-outdoor',
  sermon,
  order,
  hymns,
  scriptures,
  notices,
  offering,
  duty,
  staff,
  updatedAt: FieldValue.serverTimestamp(),
});

console.log(`완료: bulletins/${TEST_DATE} 에 테스트(야외예배) 주보를 만들었습니다.`);
console.log(`앱에서 열기: https://app.tvpc.church/bulletin?d=${TEST_DATE}`);
