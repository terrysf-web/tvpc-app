import type {
  EventDoc,
  NewsDoc,
  OfferingRecord,
  PrayerDoc,
  SermonDoc,
  VerseDoc,
} from '../types';

/**
 * Firebase가 설정되지 않았을 때(또는 오프라인 첫 실행 시) 사용하는 번들 샘플 데이터.
 * 내용은 하이파이 프로토타입의 카피를 따른다.
 */

export const sampleVerse: VerseDoc = {
  id: 'sample-verse',
  date: new Date().toISOString().slice(0, 10),
  reference: '시편 23:1',
  heroText: '여호와는 나의 목자시니\n내게 부족함이\n없으리로다',
  passageTitle: '시편 23:1–6',
  passage: [
    { verse: 1, text: '여호와는 나의 목자시니 내가 부족함이 없으리로다' },
    { verse: 2, text: '그가 나를 푸른 초장에 누이시며 쉴만한 물 가으로 인도하시는도다' },
    { verse: 3, text: '내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다' },
    {
      verse: 4,
      text: '내가 사망의 음침한 골짜기로 다닐지라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라 주의 지팡이와 막대기가 나를 안위하시나이다',
    },
    {
      verse: 5,
      text: '주께서 내 원수의 목전에서 내게 상을 베푸시고 기름으로 내 머리에 바르셨으니 내 잔이 넘치나이다',
    },
    {
      verse: 6,
      text: '나의 평생에 선하심과 인자하심이 정녕 나를 따르리니 내가 여호와의 집에 영원히 거하리로다',
    },
  ],
  meditation:
    '다윗은 왕이 되기 전, 들에서 양을 치던 목자였습니다. 그는 목자가 양을 위해 무엇을 하는지 누구보다 잘 알았습니다. 양은 스스로 길을 찾지 못하고, 스스로를 지키지 못합니다. 그러나 좋은 목자가 있다면 양은 아무것도 걱정할 필요가 없습니다.\n\n"내게 부족함이 없으리로다"라는 고백은 모든 것이 풍족하다는 뜻이 아니라, 목자 되신 여호와께서 채우시기에 더 바랄 것이 없다는 신뢰의 고백입니다. 오늘 나의 목자가 누구인지 돌아보십시오. 내 힘과 계획이 아니라 주님의 인도하심을 따라갈 때, 우리는 푸른 초장과 쉴 만한 물가를 만나게 됩니다.',
  application: [
    '오늘 내가 스스로 해결하려고 붙들고 있는 걱정 하나를 목자 되신 주님께 맡겨봅시다.',
    '하루를 시작하며 "여호와는 나의 목자시니"를 소리 내어 고백해봅시다.',
    '주님이 채워주셨던 지난 은혜 세 가지를 적어보고 감사해봅시다.',
  ],
  prayer:
    '선하신 목자 되신 하나님, 오늘도 저를 푸른 초장으로 인도해 주시니 감사합니다. 제 힘으로 살아가려는 고집을 내려놓고, 주님의 지팡이와 막대기가 주는 안위를 신뢰하게 하소서. 부족함을 두려워하지 않고 채우시는 주님을 바라보며 하루를 살게 하소서. 예수님의 이름으로 기도합니다. 아멘.',
  imageUrl: null,
};

export const sampleSermons: SermonDoc[] = [
  {
    id: 'sermon-1',
    title: '담장을 넘어 Over the Wall',
    subtitle: '창세기 시리즈 #5',
    preacher: '허성영 담임목사',
    scripture: '창세기 49:22–26',
    date: '2026-06-28',
    service: '주일 1부 예배',
    duration: '38:45',
    series: '창세기 시리즈',
    youtubeId: null,
    imageUrl: null,
    featured: true,
  },
  {
    id: 'sermon-2',
    title: '광야에서 만나는 하나님',
    subtitle: '창세기 시리즈 #4',
    preacher: '허성영 담임목사',
    scripture: '창세기 16:7–14',
    date: '2026-06-21',
    service: '주일 1부 예배',
    duration: '41:12',
    series: '창세기 시리즈',
    youtubeId: null,
    imageUrl: null,
  },
  {
    id: 'sermon-3',
    title: '벧엘로 올라가자',
    subtitle: '창세기 시리즈 #3',
    preacher: '허성영 담임목사',
    scripture: '창세기 35:1–7',
    date: '2026-06-14',
    service: '주일 1부 예배',
    duration: '36:03',
    series: '창세기 시리즈',
    youtubeId: null,
    imageUrl: null,
  },
  {
    id: 'sermon-4',
    title: '두려워하지 말라',
    subtitle: '수요기도회 말씀',
    preacher: '박은혜 부목사',
    scripture: '이사야 41:10',
    date: '2026-06-10',
    service: '수요기도회',
    duration: '28:30',
    series: '이사야 묵상',
    youtubeId: null,
    imageUrl: null,
  },
  {
    id: 'sermon-5',
    title: '기쁨의 회복',
    subtitle: '금요찬양예배 말씀',
    preacher: '허성영 담임목사',
    scripture: '빌립보서 4:4–7',
    date: '2026-06-05',
    service: '금요찬양예배',
    duration: '32:18',
    series: '빌립보서 강해',
    youtubeId: null,
    imageUrl: null,
  },
];

export const sampleNews: NewsDoc[] = [
  {
    id: 'news-1',
    category: 'notice',
    title: '2026 하반기 제자훈련 수강생 모집',
    date: '2026-07-03',
    imageUrl: null,
  },
  {
    id: 'news-2',
    category: 'event',
    title: '전교인 여름 수련회 등록 안내 (8/14–16)',
    date: '2026-07-01',
    imageUrl: null,
  },
  {
    id: 'news-3',
    category: 'notice',
    title: '7월 둘째 주 주보가 업로드되었습니다',
    date: '2026-06-30',
    imageUrl: null,
  },
  {
    id: 'news-4',
    category: 'event',
    title: '금요찬양예배 — 찬양팀과 함께하는 밤',
    date: '2026-06-27',
    imageUrl: null,
  },
  {
    id: 'news-5',
    category: 'notice',
    title: '새가족부 여름 환영 모임 안내',
    date: '2026-06-25',
    imageUrl: null,
  },
];

export const sampleEvents: EventDoc[] = [
  {
    id: 'event-1',
    dateLabel: '05.22 금요일',
    title: '금요찬양예배',
    detail: '오후 8:00 · 본당',
    imageUrl: null,
  },
];

export const samplePrayers: PrayerDoc[] = [
  {
    id: 'prayer-1',
    category: 'family',
    answered: false,
    text: '아버지 수술이 다음 주로 잡혔습니다. 수술이 잘 되고 회복이 빠르도록, 가족 모두가 평안 가운데 기다릴 수 있도록 기도 부탁드립니다.',
    authorName: '김성실',
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    prayCount: 12,
  },
  {
    id: 'prayer-2',
    category: 'work',
    answered: false,
    text: '이번 달 말 중요한 이직 면접이 있습니다. 하나님이 예비하신 자리라면 담대함을 주시고, 결과에 순종할 수 있는 마음을 주시도록 기도해 주세요.',
    authorName: '이믿음',
    createdAt: Date.now() - 1000 * 60 * 60 * 8,
    prayCount: 7,
  },
  {
    id: 'prayer-3',
    category: 'health',
    answered: false,
    text: '어머니가 오랜 불면으로 힘들어하십니다. 몸과 마음이 쉼을 얻고 주님 주시는 평안으로 잠들 수 있도록 함께 기도해 주세요.',
    authorName: '박소망',
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
    prayCount: 15,
  },
  {
    id: 'prayer-4',
    category: 'answered',
    answered: true,
    text: '취업을 위해 기도 부탁드렸던 지체입니다. 지난주 최종 합격 소식을 받았습니다! 함께 기도해 주신 모든 분들께 감사드리며 하나님께 영광 돌립니다.',
    authorName: '최은혜',
    createdAt: Date.now() - 1000 * 60 * 60 * 72,
    prayCount: 31,
  },
  {
    id: 'prayer-5',
    category: 'answered',
    answered: true,
    text: '동생의 건강 검진 결과가 걱정과 달리 깨끗하게 나왔습니다. 기도해 주신 성도님들 감사합니다. 하나님의 선하심을 찬양합니다.',
    authorName: '정평안',
    createdAt: Date.now() - 1000 * 60 * 60 * 120,
    prayCount: 24,
  },
];

export const sampleOfferings: OfferingRecord[] = [
  { id: 'off-1', item: '주정헌금', date: '2026-06-28', amount: '$100' },
  { id: 'off-2', item: '감사헌금', date: '2026-06-21', amount: '$50' },
  { id: 'off-3', item: '선교헌금', date: '2026-06-07', amount: '$30' },
];

/** 카테고리 라벨/색 매핑 (기도요청·소식 공용) */
export const prayerCategoryLabel: Record<string, string> = {
  family: '가정',
  health: '건강',
  work: '직장',
  etc: '기타',
  answered: '기도응답',
};
