import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Bell,
  BookOpen,
  FileText,
  Megaphone,
  Moon,
  MoonStar,
  Play,
  Sun,
  Sunrise,
  Sunset,
  UserRound,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeInUp } from '../../src/components/FadeInUp';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { useEvents, useSermons, useTodayVerse } from '../../src/data/hooks';
import { churchInfo } from '../../src/churchInfo';
import { playSermon, sermonThumb } from '../../src/links';
import { colors, font, scrim, shadows, textShadow } from '../../src/theme';

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

function todayLabel(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verse } = useTodayVerse();
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

  // 최신 주보 — 교인·관리자는 앱 안 이미지 주보, 그 외는 홈페이지 게시글로 (뷰어에서 분기)
  const openBulletin = () => router.push('/bulletin');

  // 주일에는 히어로가 오늘의 말씀 대신 주일예배 안내로 바뀐다
  const isSunday = new Date().getDay() === 0;
  const sundayTimes = churchInfo.services
    .filter((s) => s.name.startsWith('주일예배'))
    .map((s) => `${s.name.replace('주일예배 ', '')} ${s.time.replace('주일 ', '')}`)
    .join(' · ');

  const quickMenu = [
    {
      key: 'qt',
      label: '말씀(QT)',
      icon: <BookOpen size={21} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      onPress: () => router.push('/word'),
    },
    {
      key: 'newcomer',
      label: '새가족 안내',
      icon: <UserRound size={21} color={colors.tagGreenText} strokeWidth={1.9} />,
      chipBg: colors.tagGreenBg,
      onPress: () => router.push('/info/newcomer'),
    },
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
              {isSunday
                ? '복된 주일입니다\n예배로 함께 나아가요'
                : '오늘도 주님의 은혜가 함께하는 하루 되세요'}
            </Text>
          </View>
          <Pressable style={styles.bellBtn} onPress={() => router.push('/news')} hitSlop={6}>
            <Bell size={20} color={colors.title} strokeWidth={1.9} />
            <View style={styles.bellDot} />
          </Pressable>
        </View>
      </FadeInUp>

      {/* 2. 히어로 — 주중엔 오늘의 말씀, 주일엔 주일예배 안내 */}
      <FadeInUp delay={40}>
        <View style={[styles.heroWrap, shadows.hero]}>
          {isSunday ? (
            <PhotoSlot uri={null} tone="deep" style={styles.hero}>
              <LinearGradient colors={[...scrim]} style={StyleSheet.absoluteFill} />
              <View style={styles.heroTopRow}>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>주일예배</Text>
                </View>
                <Text style={styles.heroDate}>{todayLabel()}</Text>
              </View>
              <View style={styles.heroBottom}>
                <Text style={styles.heroRef}>{churchInfo.nameKo}</Text>
                <Text style={styles.heroVerse}>
                  오늘은 주일입니다{'\n'}예배로 함께 나아가요
                </Text>
                <Text style={styles.sundayTimes}>{sundayTimes} · 본당</Text>
                <View style={styles.heroBtnRow}>
                  <Pressable style={styles.heroBtn} onPress={() => router.push('/sermon')}>
                    <Text style={styles.heroBtnText}>설교 영상</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.heroBtn, styles.heroBtnGhost]}
                    onPress={openBulletin}
                  >
                    <Text style={[styles.heroBtnText, styles.heroBtnGhostText]}>주보 보기</Text>
                  </Pressable>
                </View>
              </View>
            </PhotoSlot>
          ) : (
            // 기본(밝은) 배경일 땐 진한 남색 글씨가 또렷하다.
            // 관리자가 어두운 사진을 넣으면 흰 글씨 + 어두운 덮개로 전환.
            <PhotoSlot uri={verse.imageUrl ?? '/verse-bg.jpg'} tone="deep" style={styles.hero}>
              {verse.imageUrl ? (
                <LinearGradient colors={[...scrim]} style={StyleSheet.absoluteFill} />
              ) : null}
              <View style={styles.heroTopRow}>
                <View style={[styles.heroBadge, !verse.imageUrl && styles.heroBadgeDark]}>
                  <Text style={styles.heroBadgeText}>
                    {verse.passageTitle?.includes('새벽예배')
                      ? '오늘의 말씀 · 새벽예배'
                      : '오늘의 말씀'}
                  </Text>
                </View>
                <Text style={[styles.heroDate, !verse.imageUrl && styles.heroDateDark]}>
                  {todayLabel()}
                </Text>
              </View>
              <View style={styles.heroBottom}>
                <Text style={[styles.heroRef, !verse.imageUrl && styles.heroRefDark]}>
                  {verse.reference}
                </Text>
                <Text style={[styles.heroVerse, !verse.imageUrl && styles.heroVerseDark]}>
                  {verse.heroText}
                </Text>
                <Pressable
                  style={[styles.heroBtn, !verse.imageUrl && styles.heroBtnDark]}
                  onPress={() => router.push('/word')}
                >
                  <Text
                    style={[styles.heroBtnText, !verse.imageUrl && styles.heroBtnTextDark]}
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
        <Text style={styles.sectionTitle}>한눈에 보기</Text>
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
          <Pressable
            style={[styles.eventWrap, shadows.imageCard]}
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
            {/* 포스터가 없으면 말씀카드와 같은 밝은 배경 + 남색 글씨 */}
            <PhotoSlot
              uri={nextEvent.imageUrl ?? '/verse-bg.jpg'}
              tone="deep"
              style={styles.eventCard}
            >
              {nextEvent.imageUrl ? (
                <LinearGradient
                  colors={['rgba(12,28,54,0.72)', 'rgba(12,28,54,0.10)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <View style={styles.eventTextCol}>
                <Text style={[styles.eventDate, !nextEvent.imageUrl && styles.eventDateDark]}>
                  {nextEvent.dateLabel}
                </Text>
                {nextDayEvents.map((e) => (
                  <View key={e.id} style={styles.eventRow}>
                    <Text
                      style={[styles.eventTitle, !nextEvent.imageUrl && styles.eventTitleDark]}
                    >
                      {e.title}
                    </Text>
                    {!!e.detail && (
                      <Text
                        style={[
                          styles.eventDetail,
                          !nextEvent.imageUrl && styles.eventDetailDark,
                        ]}
                      >
                        {e.detail}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </PhotoSlot>
          </Pressable>
        </FadeInUp>
      )}

      {/* 5. 최근 설교 */}
      {featured && (
        <FadeInUp delay={160}>
          <Text style={styles.sectionTitle}>최근 설교</Text>
          <View style={[styles.sermonWrap, shadows.imageCard]}>
            <PhotoSlot uri={sermonThumb(featured)} tone="deep" style={styles.sermonCard}>
              <LinearGradient colors={[...scrim]} style={StyleSheet.absoluteFill} />
              <Pressable
                style={styles.playBtn}
                onPress={() => playSermon(featured)}
                hitSlop={8}
              >
                <Play size={20} color={colors.primary} fill={colors.primary} strokeWidth={0} />
              </Pressable>
              <View style={styles.sermonBottom}>
                <Text style={styles.sermonTitle} numberOfLines={2}>
                  {featured.title}
                </Text>
                <Text style={styles.sermonMeta}>
                  {[featured.subtitle, featured.preacher].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </PhotoSlot>
          </View>
        </FadeInUp>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
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

  heroWrap: { borderRadius: 22, marginBottom: 22 },
  hero: { borderRadius: 22, minHeight: 222, padding: 18, justifyContent: 'space-between' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroBadgeText: { fontFamily: font.bold, fontSize: 12, color: '#FFFFFF' },
  heroDate: { fontFamily: font.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' },
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
    fontSize: 22.5,
    lineHeight: 32,
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

  // 밝은 기본 배경용 — 진한 남색 글씨로 또렷하게
  heroBadgeDark: { backgroundColor: 'rgba(18,50,91,0.75)' },
  heroDateDark: { color: '#17406E' },
  heroRefDark: {
    color: '#1D5C9E',
    textShadowColor: 'transparent',
    textShadowRadius: 0,
  },
  heroVerseDark: {
    color: '#122B4F',
    textShadowColor: 'transparent',
    textShadowRadius: 0,
  },
  heroBtnDark: { backgroundColor: colors.primary },
  heroBtnTextDark: { color: '#FFFFFF' },
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
    fontSize: 16,
    color: colors.title,
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionLink: { fontFamily: font.bold, fontSize: 12.5, color: colors.primary },
  quickRow: { flexDirection: 'row', gap: 11, marginBottom: 22 },
  quickCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 15,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  quickChip: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontFamily: font.medium, fontSize: 12, color: colors.body },

  eventWrap: { borderRadius: 18, marginBottom: 22 },
  eventCard: { borderRadius: 18, minHeight: 100, justifyContent: 'center' },
  eventTextCol: { paddingHorizontal: 18, paddingVertical: 16, gap: 2 },
  eventRow: { marginTop: 5 },
  eventDate: { fontFamily: font.bold, fontSize: 12, color: 'rgba(255,255,255,0.85)', ...textShadow },
  eventTitle: { fontFamily: font.extraBold, fontSize: 16.5, color: '#FFFFFF', ...textShadow },
  eventDetail: { fontFamily: font.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', ...textShadow },
  // 밝은 기본 배경용 — 진한 남색 글씨
  eventDateDark: { color: '#1D5C9E', textShadowColor: 'transparent', textShadowRadius: 0 },
  eventTitleDark: { color: '#122B4F', textShadowColor: 'transparent', textShadowRadius: 0 },
  eventDetailDark: { color: '#17406E', textShadowColor: 'transparent', textShadowRadius: 0 },

  sermonWrap: { borderRadius: 18 },
  sermonCard: { borderRadius: 18, height: 164, justifyContent: 'flex-end' },
  playBtn: {
    position: 'absolute',
    right: 18,
    top: '50%',
    marginTop: -34,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
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
