# 트라이밸리 장로교회 앱 (Tri-Valley Presbyterian Church App)

교인용 모바일 앱 — 매일 말씀(QT), 설교, 교회 소식, 기도요청, 온라인 헌금.
**React Native + Expo**로 구현했고, 백엔드는 **Firebase 무료(Spark) 등급**을 사용합니다.

> 하이파이 HTML 프로토타입(핸드오프 문서)의 디자인 토큰·화면 스펙을 그대로 재현했습니다.

## 화면 구성

| 하단 탭 | 내용 |
|---|---|
| 홈 | 인사 헤더 · 오늘의 말씀 히어로 · 빠른 메뉴 4종 · 다가오는 일정 · 최근 설교 |
| 말씀 | QT — 본문/묵상/적용/기도 탭, 듣기(TTS)·글씨크기·저장 액션 바 |
| 설교 | 최근 설교/시리즈/말씀별 탭, 대표 영상 카드 + 리스트 (YouTube 링크 재생) |
| 소식 | 전체/공지/행사 탭, 카테고리 태그 카드 리스트 |
| 더보기 | 프로필 카드 · 기도요청/온라인 헌금 그리드 · 교회 안내 메뉴 |

오버레이(하단 탭 숨김): **기도요청**(작성 + 함께 기도 좋아요), **헌금**(외부 결제 링크), **마이페이지**(프로필 수정).

## 실행 방법

```bash
npm install
npx expo start        # Expo Go 앱으로 QR 스캔 (iOS/Android)
npx expo start --web  # 브라우저 미리보기
```

Firebase를 설정하지 않아도 **번들 샘플 데이터로 즉시 동작**합니다(데모 모드).
기도요청 작성·좋아요는 데모 모드에서 기기 로컬에만 저장됩니다.

## QR 코드 배포 (앱스토어 없이)

교인들은 QR 코드 → 웹 주소로 접속합니다. 아이폰/안드로이드 구분 없이 **설치 없이
바로** 열리고, 브라우저의 **"홈 화면에 추가"** 로 앱처럼 쓸 수 있습니다.
(스토어 없이 QR로 *설치형* 앱을 배포하는 건 안드로이드만 가능하고 아이폰은
불가능하므로, 웹앱 방식이 두 플랫폼을 모두 커버하는 유일한 방법입니다.)

### 주 주소 — Firebase Hosting: https://happytvpc.web.app

호스팅 사이트 ID는 `happytvpc`(행복한 교회), 프로젝트는 `tvpc-40043`입니다.
QR 코드는 https://happytvpc.web.app 을 가리킵니다.

```bash
npm install -g firebase-tools
firebase login
firebase hosting:sites:create happytvpc   # 콘솔에서 이미 만들었다면 생략
npm run deploy:web                        # 빌드 + 배포 → https://happytvpc.web.app
npm run deploy:rules                      # Firestore 보안 규칙 배포
```

- 이후 업데이트 배포는 `npm run deploy:web` 한 줄이면 됩니다.
- 원하면 교회 보유 도메인을 콘솔 → Hosting → 커스텀 도메인 추가로 연결할 수
  있습니다 (TXT/A 레코드 추가, SSL 자동 발급). 그 경우 QR만 새 주소로 교체.
- 푸시 때마다 자동 배포하려면 `.github/workflows/deploy-firebase.yml` 상단의
  활성화 방법(서비스 계정 시크릿 + 레포 변수)을 따라 설정하세요.

### 예비 주소 — GitHub Pages: https://terrysf-web.github.io/tvpc-app/

푸시할 때마다 자동 배포됩니다(`.github/workflows/deploy-web.yml`).
최초 1회 레포 Settings → Pages → Source를 "GitHub Actions"로 설정해야 합니다.

## Firebase 연결 (무료 Spark 요금제)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성 (Spark 무료 요금제 그대로)
2. **웹 앱 추가** 후 표시되는 `firebaseConfig`를 `src/firebaseConfig.ts`에 붙여넣기
3. **Firestore Database** 생성 — 처음에는 "테스트 모드"로 시작
4. **Authentication → 로그인 방법 → 익명** 활성화
5. 샘플 데이터 업로드: `npm run seed`
6. 시드가 끝나면 **Firestore 규칙**에 `firestore.rules` 내용을 붙여넣어 잠금
   (콘텐츠는 읽기 전용, 기도요청만 익명 인증 사용자가 작성/좋아요 가능)

### Firestore 컬렉션 스키마

| 컬렉션 | 용도 | 주요 필드 |
|---|---|---|
| `verses` | 오늘의 말씀/QT | `date`, `reference`, `heroText`, `passage[]`, `meditation`, `application[]`, `prayer`, `imageUrl` |
| `sermons` | 설교 목록 | `title`, `subtitle`, `preacher`, `scripture`, `date`, `service`, `duration`, `series`, `youtubeId`, `imageUrl`, `featured` |
| `news` | 공지·행사 | `category`(`notice`\|`event`), `title`, `date`, `imageUrl` |
| `events` | 다가오는 일정 | `dateLabel`, `title`, `detail`, `imageUrl` |
| `prayers` | 기도요청 | `category`, `answered`, `text`, `authorName`, `createdAt`, `prayCount` |

콘텐츠 관리는 Firebase 콘솔에서 문서를 직접 추가/수정하면 앱에 실시간 반영됩니다(onSnapshot 구독).

### 설교 자동 동기화 (유튜브 → 앱)

`.github/workflows/sync-sermons.yml`이 매일 유튜브 채널(@tri-valley)의 새 영상을
읽어 `sermons` 컬렉션에 자동 등록합니다 (썸네일·재생 링크 자동, API 키 불필요).

활성화(1회): Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** →
받은 JSON 전체를 GitHub 레포 Settings → Secrets → Actions에
`FIREBASE_SERVICE_ACCOUNT` 이름으로 등록. 이후 Actions 탭에서 "Run workflow"로
즉시 실행해 확인할 수 있습니다. 첫 동기화 성공 시 샘플 설교(sermon-1..5)는 자동 삭제됩니다.

### 월 고정비를 0으로 유지하는 설계 (핸드오프 문서 권장사항)

- 설교 영상은 **YouTube**에 두고 `youtubeId`만 저장 → 스토리지/대역폭 비용 없음
- 헌금 결제는 **앱 밖 링크**(`app/offering.tsx`의 `GIVING_URL`) → PG 연동·심사 부담 없음
- 사진은 Firestore 문서의 `imageUrl`(교회 홈페이지/스토리지 URL) → 미설정 시 그라데이션 플레이스홀더

## 프로젝트 구조

```
app/                  # expo-router 화면
  (tabs)/             #   하단 5탭: index(홈)·word·sermon·news·more
  prayer.tsx          #   오버레이: 기도요청
  offering.tsx        #   오버레이: 헌금
  mypage.tsx          #   오버레이: 마이페이지
src/
  theme.ts            # 디자인 토큰 (색·폰트·radius·그림자 — 핸드오프 문서 값)
  firebase.ts         # Firebase 초기화 + 익명 인증
  firebaseConfig.ts   # ← 여기에 Firebase 설정 붙여넣기 (null이면 데모 모드)
  types.ts            # Firestore 문서 타입
  data/
    sample.ts         # 번들 샘플 데이터 (데모 모드 폴백)
    hooks.ts          # Firestore 구독 훅 + 기도요청 작성/좋아요
    user.ts           # 로컬 프로필 (AsyncStorage)
  components/         # PhotoSlot·Tag·SegmentTabs·FadeInUp·OverlayHeader
assets/fonts/         # Pretendard 400/500/700/800
firestore.rules       # Firestore 보안 규칙
scripts/seed.mjs      # 샘플 데이터 시드 스크립트 (npm run seed)
```

## 기술 스택

- **Expo SDK 57** (React Native 0.86, React 19) + **expo-router** (파일 기반 내비게이션)
- **Firebase JS SDK** — Firestore(실시간 구독) + 익명 Authentication
- **Pretendard** 폰트 번들, **lucide-react-native** 아이콘 (stroke 1.9)
- TTS: expo-speech (말씀 "듣기")

## 남은 작업 (교회 콘텐츠 확정 후)

- [ ] 교회 로고·실제 사진 반영 (`imageUrl` 채우기)
- [ ] 설교 `youtubeId` 연결
- [ ] 온라인 헌금 링크 연결 (`app/offering.tsx`의 `GIVING_URL`)
- [ ] 더보기 정적 페이지(교회 소개·예배 시간·오시는 길) 콘텐츠
- [ ] 푸시 알림 (expo-notifications + FCM — 무료 범위)
- [ ] 주보 PDF 링크

## 검증

- `npm run typecheck` — TypeScript 통과
- `npx expo export --platform web` — 번들 빌드 통과, 전 화면 렌더링 확인 완료
