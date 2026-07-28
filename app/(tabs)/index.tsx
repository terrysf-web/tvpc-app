import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Bell,
  BookOpen,
  FileText,
  HandCoins,
  Images,
  Megaphone,
  Moon,
  MoonStar,
  Play,
  Sun,
  Sunrise,
  Sunset,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeInUp } from '../../src/components/FadeInUp';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { useClockTick, useEvents, useSermons, useTodayVerse } from '../../src/data/hooks';
import { churchInfo } from '../../src/churchInfo';
import { sundayPhase } from '../../src/churchTime';
import { openLiveWorship, openWorshipReplay, playSermon, sermonThumb } from '../../src/links';
import { colors, font, scrim, shadows, textShadow } from '../../src/theme';
import { useSundayBg, useVerseBg } from '../../src/verseBg';

/** 시간대 — 아침(6~12) · 오후(12~18) · 저녁(18~20) · 밤(20~24) · 새벽(0~6) */
function timeSlot(): 'morning' | 'afternoon' | 'evening' | 'night' | 'dawn' {
  const h = new Date().getHours();
  if (h < 6) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  if (h < 20) return 'evening';
  return 'night';
}

const GREETING_TEXT = {
  dawn: '은혜로운 새벽입니다',
  morning: '좋은 아침입니다',
  afternoon: '좋은 오후입니다',
  evening: '좋은 저녁입니다',
  night: '좋은 밤입니다',
} as const;

/** 인사말 아래 문구 — 시간대에 맞게 */
const GREETING_SUB = {
  dawn: '고요한 새벽, 주님과 함께 시작해요',
  morning: '오늘도 주님의 은혜가 함께하는 하루 되세요',
  afternoon: '오후에도 주님의 평안이 함께하길 빕니다',
  evening: '오늘 하루도 수고 많으셨어요. 주님 안에서 쉼을 누리세요',
  night: '주님의 평안 속에 편안한 밤 되세요',
} as const;

function todayLabel(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // 시간이 흐르면(오후 → 저녁) 인사말·배경이 저절로 바뀌도록 1분마다 갱신
  useClockTick();
  const { verse, ready: verseReady } = useTodayVerse();
  const { events } = useEvents();
  const { sermons } = useSermons();

  // 홈 최근 설교 카드에는 실제 설교만 (팟캐스트·찬양 영상 제외)
  const onlySermons = sermons.filter((s) => (s.category ?? 'sermon') === 'sermon');
  const featured = onlySermons.find((s) => s.featured) ?? onlySermons[0];
  // 다가오는 일정 — 달력 표시용으로 보관하는 지난 일정은 건너뛴다
  const eventKey = (e: (typeof events)[number]): string => {
    if (e.sortKey && /^\d{4}-\d{2}-\d{2}$/.test(e.sortKey)) return e.sortKey;
    const m = e.dateLabel.match(/(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    if (!m) return '9999-99-99';
    const nowD = new Date();
    let yy = nowD.getFullYear();
    const cand = new Date(yy, Number(m[1]) - 1, Number(m[2]));
    if (cand.getTime() < nowD.getTime() - 180 * 86400e3) yy += 1;
    return `${yy}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  };
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const futureEvents = events
    .filter((e) => eventKey(e) >= todayKey)
    .sort((a, b) => (eventKey(a) < eventKey(b) ? -1 : 1));
  const nextEvent = futureEvents[0];
  // 같은 날 일정은 카드에 모두 표시
  const nextDayEvents = nextEvent
    ? futureEvents.filter((e) => e.dateLabel === nextEvent.dateLabel)
    : [];
  // 일정 카드용 날짜 정보 — 날짜 박스(월·일), 요일, D-day
  const nextKey = nextEvent ? eventKey(nextEvent) : null;
  const nextMonth = nextKey ? Number(nextKey.slice(5, 7)) : 0;
  const nextDay = nextKey ? Number(nextKey.slice(8, 10)) : 0;
  const nextWeekday = nextKey
    ? ['일', '월', '화', '수', '목', '금', '토'][new Date(nextKey + 'T00:00:00').getDay()]
    : '';
  const ddayNum = nextKey
    ? Math.round(
        (new Date(nextKey + 'T00:00:00').getTime() -
          new Date(todayKey + 'T00:00:00').getTime()) /
          86400000,
      )
    : 0;
  const ddayLabel = ddayNum <= 0 ? 'D-DAY' : `D-${ddayNum}`;

  // 유튜브 섬네일 — 없으면 null(그림 대신 색으로 채워짐)
  const thumb = featured ? sermonThumb(featured) : null;
  // 섬네일을 못 불러오면(통신 끊김 등) 카드가 텅 비지 않도록 제목을 대신 보여준다
  const [thumbFailed, setThumbFailed] = React.useState(false);
  React.useEffect(() => setThumbFailed(false), [thumb]);
  const showSermonText = !thumb || thumbFailed;
  // 최신 주보 — 교인·관리자는 앱 안 이미지 주보, 그 외는 홈페이지 게시글로 (뷰어에서 분기)
  const openBulletin = () => router.push('/bulletin');

  // 시간대별 기본 배경 (새벽·저녁·밤은 어두운 그림 → 흰 글씨)
  const bg = useVerseBg();
  // 주일 전용 배경(관리자 등록 시) — 없으면 시간대 배경
  const sunday = useSundayBg();
  const sb = sunday.bg ?? bg;
  // 주일·월요일에는 히어로가 오늘의 말씀 대신 주일예배 화면으로 바뀐다.
  // (화요일 새벽 12시 1분에 평일 화면으로 돌아간다)
  // 여행 중이어도 예배 안내는 교회 현지(태평양) 시각을 따른다.
  const phase = sundayPhase();
  const isSunday = phase !== null;
  // 2부 예배는 주일 낮 12시 30분이면 끝난다 —
  // 그 뒤로는 생중계 대신 최신 설교 영상으로 이어준다.
  const liveEnded = isSunday && phase !== 'live';
  // 월요일은 예배로 나아가는 날이 아니라, 주일의 은혜가 남아 있는 날
  const isMonday = phase === 'monday';
  // 어떤 내용·배경이 정답인지 확정되기 전에는 히어로를 그리지 않는다 —
  // 옛 구절이나 기본 그림이 번쩍였다가 바뀌면 혼란스럽기 때문.
  const heroReady = isSunday
    ? sunday.ready && (sunday.bg != null || bg.ready)
    : verseReady && (verse.imageUrl ? true : bg.ready);
  const sundayTimes = churchInfo.services
    .filter((s) => s.name.startsWith('주일예배'))
    .map((s) => `${s.name.replace('주일예배 ', '')} ${s.time.replace('주일 ', '')}`)
    .join(' · ');

  // 주일 메뉴 — 온라인예배는 위 카드에 있으므로 뺀다
  const quickMenu = isSunday
    ? [
        {
          key: 'news',
          label: '교회소식',
          icon: <Megaphone size={21} color={colors.tagOrangeText} strokeWidth={1.9} />,
          chipBg: colors.tagOrangeBg,
          onPress: () => router.push('/news'),
        },
        {
          key: 'bulletin',
          label: '주보 보기',
          icon: <FileText size={21} color={colors.tagGrayText} strokeWidth={1.9} />,
          chipBg: colors.tagGrayBg,
          onPress: openBulletin,
        },
        {
          key: 'word',
          label: '주일말씀',
          icon: <BookOpen size={21} color={colors.primary} strokeWidth={1.9} />,
          chipBg: colors.tagBlueBg,
          onPress: () => router.push('/word'),
        },
        {
          key: 'offering',
          label: '온라인 헌금',
          icon: <HandCoins size={21} color={colors.tagGreenText} strokeWidth={1.9} />,
          chipBg: colors.tagGreenBg,
          onPress: () => router.push('/offering'),
        },
      ]
    : [
    {
      key: 'news',
      label: '교회소식',
      icon: <Megaphone size={21} color={colors.tagOrangeText} strokeWidth={1.9} />,
      chipBg: colors.tagOrangeBg,
      onPress: () => router.push('/news'),
    },
    {
      key: 'bulletin',
      label: '주보 보기',
      icon: <FileText size={21} color={colors.tagGrayText} strokeWidth={1.9} />,
      chipBg: colors.tagGrayBg,
      onPress: openBulletin,
    },
    {
      key: 'photos',
      label: '교회 사진',
      icon: <Images size={21} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      onPress: () => router.push('/photos'),
    },
    {
      key: 'offering',
      label: '온라인 헌금',
      icon: <HandCoins size={21} color={colors.tagGreenText} strokeWidth={1.9} />,
      chipBg: colors.tagGreenBg,
      onPress: () => router.push('/offering'),
    },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, 28) + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. 인사 헤더 */}
      <FadeInUp>
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.greetingTitleRow}>
              <Text style={styles.greetingTitle}>{GREETING_TEXT[timeSlot()]}</Text>
              {/* 시간대별 아이콘 — 새벽 달 · 아침 해돋이 · 오후 해 · 저녁 노을 · 밤 달별 */}
              {timeSlot() === 'dawn' ? (
                <Moon size={20} color="#9AA8D8" strokeWidth={2} />
              ) : timeSlot() === 'morning' ? (
                <Sunrise size={20} color={colors.sun} strokeWidth={2} />
              ) : timeSlot() === 'afternoon' ? (
                <Sun size={20} color={colors.sun} strokeWidth={2} />
              ) : timeSlot() === 'evening' ? (
                <Sunset size={20} color="#E8935E" strokeWidth={2} />
              ) : (
                <MoonStar size={20} color="#7E8EC9" strokeWidth={2} />
              )}
            </View>
            <Text style={styles.greetingSub}>
              {isMonday
                ? '주일에 받은 은혜가\n이번 한 주도 함께하기를'
                : isSunday
                  ? '복된 주일입니다\n예배로 함께 나아가요'
                  : GREETING_SUB[timeSlot()]}
            </Text>
          </View>
          <Pressable style={styles.bellBtn} onPress={() => router.push('/alerts')} hitSlop={6}>
            <Bell size={20} color={colors.title} strokeWidth={1.9} />
            <View style={styles.bellDot} />
          </Pressable>
        </View>
      </FadeInUp>

      {/* 2. 히어로 — 주중엔 오늘의 말씀, 주일엔 주일예배 안내 */}
      <FadeInUp delay={40}>
        <View style={[styles.heroWrap, shadows.hero]}>
          {!heroReady ? (
            // 로딩 중 — 은은한 중립 배경만 (샘플 구절·기본 그림 번쩍임 방지)
            <LinearGradient colors={['#E9F1FA', '#D9E6F5']} style={styles.hero} />
          ) : isSunday ? (
            // 주일예배 안내도 시간대별 배경을 쓴다 (아침 예배 시간엔 아침 그림)
            <PhotoSlot uri={sb.uri} tone="deep" style={styles.hero}>
              {/* 위·아래 그늘 — 밝은 사진에서도 배지·날짜·글씨가 묻히지 않게 */}
              <LinearGradient
                colors={['rgba(10,26,52,0.55)', 'rgba(10,26,52,0.04)', 'rgba(10,26,52,0.50)']}
                locations={[0, 0.42, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroTopRow}>
                <View style={[styles.heroBadge, !sb.dark && styles.heroBadgeDark]}>
                  <Text style={styles.heroBadgeText}>{isMonday ? '지난 주일' : '주일예배'}</Text>
                </View>
                <Text style={[styles.heroDate, !sb.dark && styles.heroDateDark]}>
                  {todayLabel()}
                </Text>
              </View>
              <View style={styles.heroBottom}>
                <Text style={[styles.heroRef, !sb.dark && styles.heroRefDark]}>
                  {churchInfo.nameKo}
                </Text>
                <Text style={[styles.heroVerse, !sb.dark && styles.heroVerseDark]}>
                  {isMonday
                    ? '주일의 은혜가\n한 주간 이어지기를'
                    : '오늘은 주일입니다\n예배로 함께 나아가요'}
                </Text>
                <Text style={[styles.sundayTimes, !sb.dark && styles.sundayTimesDark]}>
                  {isMonday
                    ? '어제 받은 말씀을 품고 한 주를 시작해요'
                    : `${sundayTimes} · 본당`}
                </Text>
                <View style={styles.heroBtnRow}>
                  {/* 1부는 온라인 중계가 없어 2부만 안내한다.
                      예배가 끝난 뒤(주일 오후~월요일)에는 예배 녹화본이 담긴
                      재생목록으로 이어, 예배 전체를 다시 볼 수 있게 한다. */}
                  <Pressable
                    style={[styles.heroBtn, !sb.dark && styles.heroBtnDark]}
                    onPress={() => (liveEnded ? openWorshipReplay() : openLiveWorship())}
                  >
                    <Text style={[styles.heroBtnText, !sb.dark && styles.heroBtnTextDark]}>
                      {liveEnded ? '▶ 주일 온라인예배 다시보기' : '▶ 2부 온라인예배'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </PhotoSlot>
          ) : (
            // 기본(밝은) 배경일 땐 진한 남색 글씨가 또렷하다.
            // 관리자가 어두운 사진을 넣으면 흰 글씨 + 어두운 덮개로 전환.
            <PhotoSlot uri={verse.imageUrl ?? bg.uri} tone="deep" style={styles.hero}>
              {verse.imageUrl ? (
                <LinearGradient colors={[...scrim]} style={StyleSheet.absoluteFill} />
              ) : null}
              <View style={styles.heroTopRow}>
                <View style={[styles.heroBadge, !verse.imageUrl && !bg.dark && styles.heroBadgeDark]}>
                  <Text style={styles.heroBadgeText}>
                    {verse.passageTitle?.includes('새벽예배')
                      ? '오늘의 말씀 · 새벽예배'
                      : '오늘의 말씀'}
                  </Text>
                </View>
                <Text style={[styles.heroDate, !verse.imageUrl && !bg.dark && styles.heroDateDark]}>
                  {todayLabel()}
                </Text>
              </View>
              <View style={styles.heroBottom}>
                <Text style={[styles.heroRef, !verse.imageUrl && !bg.dark && styles.heroRefDark]}>
                  {verse.reference}
                </Text>
                <Text
                  style={[styles.heroVerse, !verse.imageUrl && !bg.dark && styles.heroVerseDark]}
                  numberOfLines={2}
                >
                  {verse.heroText}
                </Text>
                <Pressable
                  style={[styles.heroBtn, !verse.imageUrl && !bg.dark && styles.heroBtnDark]}
                  onPress={() => router.push('/word')}
                >
                  <Text
                    style={[styles.heroBtnText, !verse.imageUrl && !bg.dark && styles.heroBtnTextDark]}
                  >
                    말씀 보기
                  </Text>
                </Pressable>
              </View>
            </PhotoSlot>
          )}
        </View>
      </FadeInUp>

      {/* 3. 오늘의 한눈에 — 4열 빠른 메뉴 */}
      <FadeInUp delay={80}>
        <Text style={styles.sectionTitle}>
          {isMonday ? '주일 다시 보기' : isSunday ? '오늘 예배' : '한눈에 보기'}
        </Text>
        <View style={styles.quickRow}>
          {quickMenu.map((m) => (
            <Pressable key={m.key} style={[styles.quickCard, shadows.card]} onPress={m.onPress}>
              <View style={[styles.quickChip, { backgroundColor: m.chipBg }]}>{m.icon}</View>
              <Text style={styles.quickLabel}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </FadeInUp>

      {/* 4. 다가오는 일정 */}
      {nextEvent && (
        <FadeInUp delay={120}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>다가오는 일정</Text>
            <Pressable hitSlop={8} onPress={() => router.push('/calendar')}>
              <Text style={styles.sectionLink}>전체 달력 ›</Text>
            </Pressable>
          </View>
          {/* 배경 없이 날짜 박스 + D-day 배지의 깔끔한 카드 */}
          <Pressable
            style={[styles.eventPlain, shadows.card]}
            onPress={() => {
              // 일정이 하나이고 상세 링크가 있으면 바로 열고, 여러 개면 달력으로
              if (nextDayEvents.length === 1 && nextEvent.url) {
                router.push({
                  pathname: '/browser',
                  params: { url: nextEvent.url, t: nextEvent.title },
                });
              } else {
                router.push('/calendar');
              }
            }}
          >
            <View style={styles.eventDateBox}>
              <Text style={styles.eventDateBoxMonth}>{nextMonth}월</Text>
              <Text style={styles.eventDateBoxDay}>{nextDay}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {/* 요일은 따로 한 줄 쓰지 않고 첫 일정의 시간·장소와 함께 둔다 */}
              {nextDayEvents.map((e, i) => (
                <View key={e.id} style={i === 0 ? undefined : styles.eventRow}>
                  <Text style={styles.eventPlainTitle} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={styles.eventPlainDetail} numberOfLines={1}>
                    {[i === 0 ? `${nextWeekday}요일` : null, e.detail].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.ddayChip}>
              <Text style={styles.ddayChipText}>{ddayLabel}</Text>
            </View>
          </Pressable>
        </FadeInUp>
      )}

      {/* 5. 최근 설교 — 주일에는 예배(온라인 예배)와 겹쳐 보여 숨긴다 */}
      {featured && !isSunday && (
        <FadeInUp delay={160}>
          <Text style={styles.sectionTitle}>최근 설교</Text>
          <Pressable
            style={[styles.sermonWrap, shadows.imageCard]}
            onPress={() => playSermon(featured)}
          >
            <PhotoSlot
              uri={thumb}
              alt={featured.title}
              tone="deep"
              style={styles.sermonCard}
              onError={() => setThumbFailed(true)}
            >
              {/* 유튜브 섬네일에 이미 설교 제목·강사가 박혀 있어 글씨를 덧씌우지
                  않는다. 섬네일이 없어 그림이 대신 나올 때만 제목을 보여준다. */}
              {showSermonText && (
                <>
                  <LinearGradient colors={[...scrim]} style={StyleSheet.absoluteFill} />
                  <View style={styles.sermonBottom}>
                    <Text style={styles.sermonTitle} numberOfLines={2}>
                      {featured.title}
                    </Text>
                    <Text style={styles.sermonMeta}>
                      {[featured.subtitle, featured.preacher].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </>
              )}
              {/* 섬네일 오른쪽에 제목·강사가 들어가므로 왼쪽 아래 구석에 작게 —
                  제목을 대신 얹는 경우에는 그 글씨를 피해 오른쪽으로 */}
              <View style={[styles.playBtn, showSermonText ? styles.playBtnRight : styles.playBtnLeft]}>
                <Play size={17} color={colors.primary} fill={colors.primary} strokeWidth={0} />
              </View>
            </PhotoSlot>
          </Pressable>
        </FadeInUp>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  greetingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  greetingTitle: {
    fontFamily: font.extraBold,
    fontSize: 21,
    letterSpacing: -0.4,
    color: colors.title,
  },
  greetingSub: {
    marginTop: 6,
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.muted,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.badge,
    borderWidth: 1.5,
    borderColor: colors.card,
  },

  heroWrap: { borderRadius: 22, marginBottom: 15 },
  hero: { borderRadius: 22, minHeight: 222, padding: 18, justifyContent: 'space-between' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadge: {
    backgroundColor: 'rgba(10,26,52,0.45)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroBadgeText: { fontFamily: font.bold, fontSize: 12, color: '#FFFFFF', ...textShadow },
  heroDate: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: '#FFFFFF',
    // 배지와 같은 짙은 반투명 바탕 — 밝은 사진 위에서도 날짜가 또렷하게
    backgroundColor: 'rgba(10,26,52,0.45)',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
    overflow: 'hidden',
    ...textShadow,
  },
  heroBottom: { marginTop: 26 },
  heroRef: {
    fontFamily: font.bold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 8,
    ...textShadow,
  },
  heroVerse: {
    fontFamily: font.extraBold,
    fontSize: 21.5,
    lineHeight: 31,
    color: '#FFFFFF',
    marginBottom: 16,
    ...textShadow,
  },
  heroBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  heroBtnText: { fontFamily: font.bold, fontSize: 13.5, color: colors.primary },
  heroBtnRow: { flexDirection: 'row', gap: 9 },

  // 밝은 기본 배경용 — 진한 남색 글씨 + 흰 광택(그림 위에서도 또렷하게)
  heroBadgeDark: { backgroundColor: 'rgba(18,50,91,0.75)' },
  // 밝은 사진 위에서는 바탕을 조금 더 진하게 (글씨는 그대로 흰색)
  heroDateDark: { backgroundColor: 'rgba(10,26,52,0.62)' },
  heroRefDark: {
    color: '#1D5C9E',
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
  heroVerseDark: {
    color: '#122B4F',
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  // 밝은 배경에서는 단색 남색이 수채화 위에서 무겁게 튀므로,
  // 젖빛 유리 느낌의 반투명 흰 버튼 + 남색 글씨 + 얇은 테두리로.
  heroBtnDark: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(23,64,110,0.3)',
  },
  heroBtnTextDark: { color: '#17406E' },
  sundayTimesDark: {
    color: '#17406E',
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
  heroBtnGhostLight: {
    backgroundColor: 'rgba(18,50,91,0.08)',
    borderColor: 'rgba(18,50,91,0.45)',
  },
  heroBtnGhostTextLight: { color: '#122B4F' },
  heroBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  heroBtnGhostText: { color: '#FFFFFF' },
  sundayTimes: {
    fontFamily: font.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 14,
    ...textShadow,
  },

  sectionTitle: {
    fontFamily: font.extraBold,
    fontSize: 15.5,
    color: colors.title,
    marginBottom: 9,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionLink: { fontFamily: font.bold, fontSize: 12.5, color: colors.primary },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  quickCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 15,
    paddingVertical: 11,
    alignItems: 'center',
    gap: 6,
  },
  quickChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontFamily: font.medium, fontSize: 12, color: colors.body },

  eventWrap: { borderRadius: 18, marginBottom: 22 },
  eventPlain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 10,
    marginBottom: 13,
  },
  eventDateBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateBoxMonth: { fontFamily: font.bold, fontSize: 10.5, color: 'rgba(255,255,255,0.85)' },
  eventDateBoxDay: { fontFamily: font.extraBold, fontSize: 18, color: '#FFFFFF', marginTop: 0 },
  eventPlainCaption: { fontFamily: font.medium, fontSize: 11.5, color: colors.muted },
  eventPlainTitle: { fontFamily: font.extraBold, fontSize: 15, color: colors.title },
  eventPlainDetail: { fontFamily: font.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  ddayChip: {
    backgroundColor: colors.tagBlueBg,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  ddayChipText: { fontFamily: font.bold, fontSize: 11.5, color: colors.primary },
  eventCard: { borderRadius: 18, minHeight: 100, justifyContent: 'center' },
  eventTextCol: { paddingHorizontal: 18, paddingVertical: 16, gap: 2 },
  eventRow: { marginTop: 4 },
  eventDate: { fontFamily: font.bold, fontSize: 12, color: 'rgba(255,255,255,0.85)', ...textShadow },
  eventTitle: { fontFamily: font.extraBold, fontSize: 16.5, color: '#FFFFFF', ...textShadow },
  eventDetail: { fontFamily: font.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', ...textShadow },
  // 밝은 기본 배경용 — 진한 남색 글씨
  eventDateDark: { color: '#1D5C9E', textShadowColor: 'transparent', textShadowRadius: 0 },
  eventTitleDark: { color: '#122B4F', textShadowColor: 'transparent', textShadowRadius: 0 },
  eventDetailDark: { color: '#17406E', textShadowColor: 'transparent', textShadowRadius: 0 },

  sermonWrap: { borderRadius: 18 },
  sermonCard: { borderRadius: 18, height: 126, justifyContent: 'flex-end' },
  playBtn: {
    position: 'absolute',
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  // 섬네일이 보일 때는 글씨가 없는 왼쪽(인물 쪽), 제목을 대신 얹을 때는 반대쪽
  playBtnLeft: { left: 12 },
  playBtnRight: { right: 12 },
  sermonBottom: { padding: 16 },
  sermonTitle: { fontFamily: font.extraBold, fontSize: 15.5, color: '#FFFFFF', ...textShadow },
  sermonMeta: {
    marginTop: 4,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.85)',
    ...textShadow,
  },
});
