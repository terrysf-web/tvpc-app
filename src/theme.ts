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

  // 텍스트 — 작은 글씨가 흐려 보이지 않게 회색 계열을 한 단계씩 진하게 잡았다.
  // (옅은 회색 배경 위에서 muted 5.8 : 1, faint 3.9 : 1)
  // 텍스트
  title: '#18202B',
  titleAlt: '#1B2430',
  body: '#2F3944',
  bodyAlt: '#39424E',
  muted: '#545D6B',
  muted2: '#616A77',
  muted3: '#6C7480',
  faint: '#6F7884',
  faint2: '#A6AEBA',

  tabInactive: '#7A828C',
  segInactive: '#727A85',

  // 배경/구분선 — 배경을 살짝 푸른 회색으로 둬 흰 카드가 또렷이 떠 보이게
  screenBg: '#EBEFF5',
  card: '#FFFFFF',
  cardBorder: '#E2E8F1',
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

/** 프리미엄 2겹 그림자 — RN은 단일 그림자만 지원하므로 주 그림자로 근사.
 * 얇은 테두리를 함께 둬, 그림자가 안 보이는 밝은 환경에서도 카드 경계가 살아 있게 한다. */
export const shadows = {
  card: {
    shadowColor: '#14203A',
    shadowOpacity: 0.11,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  imageCard: {
    shadowColor: '#14203A',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
