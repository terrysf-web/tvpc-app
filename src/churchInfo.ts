/**
 * 교회 기본 정보 — tvpc.church 및 공개 자료 기준.
 * 내용이 바뀌면 이 파일만 수정하면 앱 전체(더보기 안내 페이지들)에 반영된다.
 */
export const churchInfo = {
  nameKo: '트라이밸리 장로교회',
  nameEn: 'Tri-Valley Presbyterian Church',
  address: '5925 W. Las Positas Blvd, Pleasanton, CA 94588',
  phone: '925-227-0880',
  website: 'https://tvpc.church',
  youtube: 'https://www.youtube.com/@tri-valley',

  /** 홈페이지 공식 페이지 (앱 내 뷰어로 열림) */
  pages: {
    about: 'https://tvpc.church/wp/ko/about-us/',
    staff: 'https://tvpc.church/wp/ko/staff/',
    newcomers: 'https://tvpc.church/wp/ko/newcomers/',
  },

  intro:
    '트라이밸리 장로교회는 캘리포니아 트라이밸리 지역(플레젠튼·더블린·산라몬·리버모어)의 한인 교회입니다. 예배와 말씀, 기도와 교제를 통해 모든 세대가 신앙 안에서 함께 자라가는 공동체를 꿈꿉니다.',

  /** 예배 시간 — 교회 공지 기준으로 수정하세요 */
  services: [
    { name: '주일예배 1부', time: '주일 오전 9:00', place: '본당 · 온라인 병행' },
    { name: '주일예배 2부', time: '주일 오전 11:00', place: '본당 · 온라인 병행' },
    { name: '새벽기도회', time: '화–토 오전 6:00', place: '소예배실' },
    { name: '금요성령집회', time: '금요일 오후 8:00', place: '본당' },
  ],

  /** 교역자 — 교회 확인 후 업데이트하세요 */
  staff: [{ role: '담임목사', name: '허성영 목사' }],

  newcomer: [
    '주일예배 후 새가족부에서 등록 안내를 도와드립니다.',
    '새가족 등록 카드를 작성하시면 담당 교역자가 연락드립니다.',
    '새가족 환영 모임을 통해 교회 생활과 소그룹(목장)을 안내해 드립니다.',
  ],
} as const;

/** 구글 지도 열기 URL */
export const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  churchInfo.address,
)}`;
