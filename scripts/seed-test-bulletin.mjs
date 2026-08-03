/**
 * 일회성 스크립트 — 목사님께 "앱 스타일 주보" 목업을 실제 앱 화면으로 보여드리기 위해
 * 기존 8/2 주보(원본)는 건드리지 않고, 검증된 실제 데이터로 별도 테스트 주보를 하나 만든다.
 * 나중에 지우려면 Firestore 콘솔에서 이 스크립트가 만든 날짜의 문서만 지우면 된다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const SOURCE_DATE = '2026-08-02'; // 원본 — 페이지 이미지만 읽어서 복사, 수정하지 않음

// 기존에 등록된 어떤 "진짜" 주보보다도 이전 날짜를 찾아, 실제 사용자에게 "이번 주 주보"로
// 잘못 보이지 않게 한다(목록 맨 뒤로 가고, 기본으로는 열리지 않음). 이 스크립트를 다시 돌려도
// 매번 같은 날짜가 나오도록, 지난번에 만든 테스트 문서(source: 'test')는 기준에서 뺀다.
const existing = await db.collection('bulletins').orderBy('date', 'asc').limit(20).get();
const earliestReal = existing.docs.find((d) => d.get('source') !== 'test');
const earliest = earliestReal ? earliestReal.id : '2026-01-04';
const [ey, em, ed] = earliest.split('-').map(Number);
const testDateObj = new Date(Date.UTC(ey, em - 1, ed));
testDateObj.setUTCDate(testDateObj.getUTCDate() - 7);
const TEST_DATE = testDateObj.toISOString().slice(0, 10);
console.log(`테스트 주보 날짜: ${TEST_DATE} (원본 페이지는 ${SOURCE_DATE}에서 복사)`);

// 이전에 다른 날짜로 만들어 둔 테스트 문서가 있으면(스크립트 로직이 바뀌어 날짜가
// 달라진 경우 등) 정리해서 "테스트 주보"가 여러 개 남지 않게 한다.
const oldTests = await db.collection('bulletins').where('source', '==', 'test').get();
for (const d of oldTests.docs) {
  if (d.id === TEST_DATE) continue;
  const oldPages = await d.ref.collection('pages').get();
  await Promise.all(oldPages.docs.map((p) => p.ref.delete()));
  await d.ref.delete();
  console.log(`  · 이전 테스트 주보(${d.id}) 정리`);
}

const sermon = {
  title: '예배, 나를 내려놓고 주님을 닮아가는 시간입니다',
  scripture: '빌립보서 2:1-11',
  preacher: '허성영 목사',
};

const order = [
  { name: '성도의 교제', service1: '경배찬양 / 교회소식', service2: '교회 소식' },
  { name: '예배의 부름', shared: '인도자*' },
  {
    name: '경배와 기도',
    service1: '참회의 기도 / 신앙고백*\n찬송가 2장*\n[찬양 성부 성자 성령]\n김희주 집사',
    service2: '찬양팀*\n김희주 집사*\n성가대\n[사랑합니다 나의 하나님]',
  },
  { name: '성찬식', shared: '' },
  { name: '성경봉독', shared: '빌립보서 2:1-11' },
  { name: '설교', shared: '허성영 목사' },
  { name: '결단의 찬양', shared: '[예수 닮기를], [예수로 사네], [이 땅위에 오신]' },
  { name: '봉헌', shared: '' },
  { name: '축도', shared: '허성영 목사' },
];

const notices = [
  { title: '성찬식', body: '오늘 예배 중에 성찬식이 있습니다.' },
  { title: '새가족반 모임', body: '오늘 오후 1시 15분에 Room 9에서 모입니다. (대상: 4월~7월 등록자)' },
  { title: '피택자/임직자 교육', body: '오늘 오후 2시에 소 예배실에서 있습니다.' },
  { title: '여름성경학교 - VBS', body: '내일(3일)부터 오는 금요일(7일)까지 교회에서 진행됩니다.' },
  { title: '교회 청소', body: '오는 금요일(7일) 오후 7시에 교회 청소가 있습니다.' },
  {
    title: '공동의회',
    body: '공동의회를 다음 주일(9일) 2부 예배 후 본당에서 개최합니다. 안건: 안수집사 재신임 / 대상자: 안현숙, 안형환, Toni Cheng',
  },
  { title: '유초등부 학부모(PTA) 모임', body: '다음 주일(9일) 2부 예배 후 본당에서 모입니다.' },
  { title: '정기 당회', body: '다음 주일(9일) 오후 3시, 회의실에서 모입니다.' },
  { title: '샌프란시스코 노회', body: '다음 주 화요일(11일)에 본 교회에서 개최합니다.' },
  {
    title: '온가족 야외예배 및 체육대회',
    body: '16일(주일) 온가족 야외 예배 및 체육대회가 있습니다. (9시 30분 접수 시작) 체육대회 상품 도네이션 및 지원을 받습니다. 문의: 남선교회 회장 강경식',
  },
  {
    title: '한국학교 개강',
    body: '한국어와 한국문화를 쉽고 알체게 배우는 한국학교가 22일(토) 개강합니다. 대상: Kinder~12학년(지역사회 주민포함) 문의 및 등록: 김경화, 임난영',
  },
];

const offering = {
  columns: ['유초등부', '중고등부', '한어부', '영어부'],
  rows: [
    { label: '주일헌금', values: ['28.00', '17.00', '1,875.00', '150.00'] },
    { label: '십일조', values: ['–', '–', '3,518.00', '419.00'] },
    { label: '감사헌금', values: ['–', '–', '6,495.00', '200.00'] },
    { label: '선교헌금', values: ['–', '–', '180.00', '–'] },
    { label: 'VBS', values: ['–', '–', '–', '400.00'] },
  ],
  total: '13,282.00',
};

const duty = [
  {
    title: '주일',
    columns: ['8월 2일', '8월 9일', '8월 16일', '8월 23일'],
    rows: [
      { label: '기도', values: ['김희주', '정국휘', '마이크 김', '안형환'] },
      {
        label: '헌금',
        values: [
          '최현진[1부]\n양정윤[2부]',
          '최현진[1부]\n양정윤[2부]',
          '양정윤[야외예배]',
          '최현진[1부]\n양정윤[2부]',
        ],
      },
      { label: '안내', values: ['Cell 2', 'Cell 2', 'Cell 2', 'Cell 2'] },
      { label: '친교', values: ['Cell 13', 'Cell 1', '야외예배', 'Cell 2'] },
    ],
  },
  {
    title: '금요기도',
    columns: ['8월 7일', '8월 14일', '8월 21일', '8월 28일'],
    rows: [{ label: '기도', values: ['윤보미', '없음(당회수련회)', '김미현', '변승혜'] }],
  },
];

const staff = [
  { role: '담임목사', names: '허성영' },
  { role: '교역자', names: '안현신 전도사, 최재하 전도사, 안현숙 교육사' },
  { role: '시무장로', names: '권국환, 김무현, 문장석, 백대호, 조재희' },
  {
    role: '시무안수집사',
    names: '김희주, 박지영, 안현숙, 안형환, 우연희, 정국휘, Mike Kim, Stephanie Lee, Toni Cheng',
  },
];

// 원본(8/2) 페이지 이미지를 그대로 복사 — 원본 문서는 읽기만 하고 손대지 않는다.
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
  source: 'test',
  sermon,
  order,
  notices,
  offering,
  duty,
  staff,
  updatedAt: FieldValue.serverTimestamp(),
});

console.log(`완료: bulletins/${TEST_DATE} 에 테스트 주보를 만들었습니다 (원본 ${SOURCE_DATE}는 그대로).`);
console.log(`앱에서 열기: https://app.tvpc.church/bulletin?d=${TEST_DATE}`);
