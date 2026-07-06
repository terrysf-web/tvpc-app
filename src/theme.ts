/**
 * 디자인 토큰 — 하이파이 프로토타입 핸드오프 문서의 값을 그대로 옮김.
 */
export const colors = {
  primary: '#1E5AA8',
  primaryDark: '#16467F',
  primaryBlue2: '#2563A8',
  primaryBlue3: '#2A6BB5',
  primaryBlue4: '#163F73',

  // 태그/카테고리
  tagGreenText: '#2E7D51',
  tagGreenBg: '#E8F3EC',
  tagBlueText: '#2563A8',
  tagBlueBg: '#E7F0F9',
  tagOrangeText: '#C97A16',
  tagOrangeBg: '#FBEEDC',
  tagGrayText: '#6B7079',
  tagGrayBg: '#EEEEF1',

  // 액센트
  heartActive: '#DC4B3E',
  heartInactive: '#AEB4BD',
  badge: '#DC4B3E',
  sun: '#F5A623',

  // 텍스트
  title: '#18202B',
  titleAlt: '#1B2430',
  body: '#2F3944',
  bodyAlt: '#39424E',
  muted: '#6B7280',
  muted2: '#7A828D',
  muted3: '#8A919B',
  faint: '#9AA1AB',
  faint2: '#C3C9D1',

  tabInactive: '#9AA0A8',
  segInactive: '#8B9099',

  // 배경/구분선
  screenBg: '#F4F5F7',
  card: '#FFFFFF',
  divider: '#ECEEF2',
  divider2: '#F0F2F5',
} as const;

export const font = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  bold: 'Pretendard-Bold',
  extraBold: 'Pretendard-ExtraBold',
} as const;

export const radius = {
  card: 16,
  cardSm: 14,
  cardLg: 18,
  hero: 22,
  tag: 6,
  button: 12,
  pill: 20,
} as const;

/** 프리미엄 2겹 그림자 — RN은 단일 그림자만 지원하므로 주 그림자로 근사 */
export const shadows = {
  card: {
    shadowColor: '#14203A',
    shadowOpacity: 0.06,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  imageCard: {
    shadowColor: '#14203A',
    shadowOpacity: 0.1,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  hero: {
    shadowColor: '#163260',
    shadowOpacity: 0.22,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
} as const;

/** 이미지 위 텍스트 스크림 (상→하) */
export const scrim = ['rgba(18,38,68,0.18)', 'rgba(12,28,54,0.66)'] as const;

export const textShadow = {
  textShadowColor: 'rgba(10,22,44,0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 12,
} as const;
