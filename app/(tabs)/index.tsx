import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bell, BookOpen, FileText, HeartHandshake, Megaphone, Play, Sun } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeInUp } from '../../src/components/FadeInUp';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { useEvents, useSermons, useTodayVerse } from '../../src/data/hooks';
import { useUser } from '../../src/data/user';
import { sermonThumb } from '../../src/links';
import { colors, font, scrim, shadows, textShadow } from '../../src/theme';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '좋은 아침입니다';
  if (h < 18) return '좋은 오후입니다';
  return '좋은 저녁입니다';
}

function todayLabel(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { verse } = useTodayVerse();
  const { events } = useEvents();
  const { sermons } = useSermons();

  const featured = sermons.find((s) => s.featured) ?? sermons[0];
  const nextEvent = events[0];

  const quickMenu = [
    {
      key: 'qt',
      label: '말씀(QT)',
      icon: <BookOpen size={21} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      onPress: () => router.push('/word'),
    },
    {
      key: 'prayer',
      label: '오늘의 기도',
      icon: <HeartHandshake size={21} color={colors.tagGreenText} strokeWidth={1.9} />,
      chipBg: colors.tagGreenBg,
      onPress: () => router.push('/prayer'),
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
      onPress: () => router.push('/news'),
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
              <Text style={styles.greetingTitle}>
                {greeting()}, {user.name}님
              </Text>
              <Sun size={20} color={colors.sun} strokeWidth={2} />
            </View>
            <Text style={styles.greetingSub}>
              오늘도 주님의 은혜가{'\n'}함께하는 하루 되세요
            </Text>
          </View>
          <Pressable style={styles.bellBtn} onPress={() => router.push('/news')} hitSlop={6}>
            <Bell size={20} color={colors.title} strokeWidth={1.9} />
            <View style={styles.bellDot} />
          </Pressable>
        </View>
      </FadeInUp>

      {/* 2. 오늘의 말씀 히어로 */}
      <FadeInUp delay={40}>
        <View style={[styles.heroWrap, shadows.hero]}>
          <PhotoSlot uri={verse.imageUrl} tone="deep" style={styles.hero}>
            <LinearGradient colors={[...scrim]} style={StyleSheet.absoluteFill} />
            <View style={styles.heroTopRow}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>오늘의 말씀</Text>
              </View>
              <Text style={styles.heroDate}>{todayLabel()}</Text>
            </View>
            <View style={styles.heroBottom}>
              <Text style={styles.heroRef}>{verse.reference}</Text>
              <Text style={styles.heroVerse}>{verse.heroText}</Text>
              <Pressable style={styles.heroBtn} onPress={() => router.push('/word')}>
                <Text style={styles.heroBtnText}>말씀 보기</Text>
              </Pressable>
            </View>
          </PhotoSlot>
        </View>
      </FadeInUp>

      {/* 3. 오늘의 한눈에 — 4열 빠른 메뉴 */}
      <FadeInUp delay={80}>
        <Text style={styles.sectionTitle}>오늘의 한눈에</Text>
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
          <Text style={styles.sectionTitle}>다가오는 일정</Text>
          <View style={[styles.eventWrap, shadows.imageCard]}>
            <PhotoSlot uri={nextEvent.imageUrl} tone="deep" style={styles.eventCard}>
              <LinearGradient
                colors={['rgba(12,28,54,0.72)', 'rgba(12,28,54,0.10)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.eventTextCol}>
                <Text style={styles.eventDate}>{nextEvent.dateLabel}</Text>
                <Text style={styles.eventTitle}>{nextEvent.title}</Text>
                <Text style={styles.eventDetail}>{nextEvent.detail}</Text>
              </View>
            </PhotoSlot>
          </View>
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
                onPress={() => router.push('/sermon')}
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

  sectionTitle: {
    fontFamily: font.extraBold,
    fontSize: 16,
    color: colors.title,
    marginBottom: 12,
  },
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
  eventCard: { borderRadius: 18, height: 100, justifyContent: 'center' },
  eventTextCol: { paddingHorizontal: 18, gap: 2 },
  eventDate: { fontFamily: font.bold, fontSize: 12, color: 'rgba(255,255,255,0.85)', ...textShadow },
  eventTitle: { fontFamily: font.extraBold, fontSize: 16.5, color: '#FFFFFF', ...textShadow },
  eventDetail: { fontFamily: font.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', ...textShadow },

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
