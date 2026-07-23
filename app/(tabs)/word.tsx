import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bookmark, List } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { SegmentTabs } from '../../src/components/SegmentTabs';
import { useTodayVerse } from '../../src/data/hooks';
import { VerseNoteCard } from '../../src/components/VerseNoteCard';
import { isVerseSaved, toggleSavedVerse } from '../../src/data/savedVerses';
import { colors, font, textShadow } from '../../src/theme';
import { useVerseBg } from '../../src/verseBg';

type WordTab = 'text' | 'med' | 'app' | 'pray' | 'note';

const TABS: { key: WordTab; label: string }[] = [
  { key: 'text', label: '본문' },
  { key: 'med', label: '묵상' },
  { key: 'app', label: '적용' },
  { key: 'pray', label: '기도' },
  { key: 'note', label: '메모' },
];

/** 글씨크기 3단계 */
const FONT_SCALES = [1, 1.15, 1.3];

export default function WordScreen() {
  const insets = useSafeAreaInsets();
  const { verse, ready } = useTodayVerse();
  const bg = useVerseBg();
  const router = useRouter();
  const [tab, setTab] = useState<WordTab>('text');
  const [scaleStep, setScaleStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const scale = FONT_SCALES[scaleStep];

  // 오늘 말씀이 기기에 저장(북마크)돼 있는지 동기화
  useEffect(() => {
    let on = true;
    isVerseSaved(verse.date).then((s) => on && setSaved(s));
    return () => {
      on = false;
    };
  }, [verse.date]);

  const onToggleSaved = () => {
    toggleSavedVerse({
      date: verse.date,
      reference: verse.reference,
      heroText: verse.heroText,
    }).then(setSaved);
  };

  // 확정된 말씀·배경이 오기 전에는 샘플 구절이 번쩍이지 않게 로딩 화면만
  if (!ready || (!verse.imageUrl && !bg.ready)) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
          <Text style={styles.headerTitle}>오늘의 말씀</Text>
        </View>
        <LinearGradient colors={['#E9F1FA', '#D9E6F5']} style={styles.hero} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <Text style={styles.headerTitle}>오늘의 말씀</Text>
      </View>

      {/* 히어로 */}
      <PhotoSlot uri={verse.imageUrl ?? bg.uri} tone="deep" style={styles.hero}>
        {/* 기본(밝은) 배경은 진한 남색 글씨, 어두운 사진은 흰 글씨 + 덮개 */}
        {verse.imageUrl ? (
          <LinearGradient
            colors={['rgba(18,38,68,0.05)', 'rgba(12,28,54,0.62)']}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.heroBottom}>
          {/* 밝은 배경에서는 반투명 흰 패널을 깔아 제목이 그림에 묻히지 않게 */}
          <View style={!verse.imageUrl && !bg.dark ? styles.heroPanel : undefined}>
            <Text style={[styles.heroRef, !verse.imageUrl && !bg.dark && styles.heroRefDark]}>
              {verse.passageTitle}
            </Text>
            <Text style={[styles.heroDate, !verse.imageUrl && !bg.dark && styles.heroDateDark]}>
              {new Date(verse.date + 'T00:00:00').toLocaleDateString('ko-KR', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </Text>
            {/* 자동 등록 본문은 개역한글판 — 예배용 개역개정과 어투가 달라 표기해 둔다 */}
            {verse.source === 'auto' && (
              <Text
                style={[styles.versionTag, !verse.imageUrl && !bg.dark && styles.versionTagDark]}
              >
                성경전서 개역한글판
              </Text>
            )}
          </View>
        </View>
      </PhotoSlot>

      {/* 세그먼트 탭 */}
      <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />

      {/* 본문 */}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {tab === 'text' &&
          verse.passage.map((p) => (
            <View key={p.verse} style={styles.verseRow}>
              <Text style={[styles.verseNum, { fontSize: 13 * scale }]}>{p.verse}</Text>
              <Text style={[styles.verseText, { fontSize: 14.5 * scale, lineHeight: 24 * scale }]}>
                {p.text}
              </Text>
            </View>
          ))}
        {tab === 'med' && (
          <Text style={[styles.paragraph, { fontSize: 14.5 * scale, lineHeight: 25 * scale }]}>
            {verse.meditation ||
              '본문을 천천히 읽으며 마음에 머무는 구절을 찾아보세요. 그 구절 앞에 잠시 멈추어, 오늘 나에게 주시는 말씀으로 받아 묵상해 보세요.'}
          </Text>
        )}
        {tab === 'app' &&
          (verse.application.length
            ? verse.application
            : ['본문에서 받은 은혜를 오늘 삶에서 실천할 한 가지로 정해 보세요.']
          ).map((a, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text
                style={[styles.paragraph, { flex: 1, fontSize: 14.5 * scale, lineHeight: 24 * scale }]}
              >
                {a}
              </Text>
            </View>
          ))}
        {tab === 'pray' && (
          <Text style={[styles.paragraph, { fontSize: 14.5 * scale, lineHeight: 25 * scale }]}>
            {verse.prayer ||
              '오늘 주신 말씀에 감사드리며, 그 말씀대로 살아갈 힘을 주시도록 기도해 보세요.'}
          </Text>
        )}
        {/* 날짜별 묵상 메모 — 이 기기에 저장, 저장한 말씀에서 다시 볼 때도 보인다 */}
        {tab === 'note' && <VerseNoteCard key={verse.date} date={verse.date} />}
      </ScrollView>

      {/* 하단 액션 바 */}
      <View style={[styles.actionBar, { paddingBottom: 10 }]}>
        {/* 글자 크기 — '가−/가+' 두 버튼으로, 한눈에 뜻이 보이게 */}
        <View style={styles.fontCtl}>
          <Pressable
            style={[styles.fontBtn, scaleStep === 0 && styles.fontBtnDim]}
            onPress={() => setScaleStep((s) => Math.max(0, s - 1))}
            hitSlop={6}
          >
            <Text style={[styles.fontBtnText, { fontSize: 13 }]}>가−</Text>
          </Pressable>
          <View style={styles.fontCtlDivider} />
          <Pressable
            style={[styles.fontBtn, scaleStep === FONT_SCALES.length - 1 && styles.fontBtnDim]}
            onPress={() => setScaleStep((s) => Math.min(FONT_SCALES.length - 1, s + 1))}
            hitSlop={6}
          >
            <Text style={[styles.fontBtnText, { fontSize: 17 }]}>가+</Text>
          </Pressable>
        </View>
        <Pressable style={styles.actionBtn} onPress={onToggleSaved}>
          <Bookmark
            size={20}
            color={saved ? colors.primary : colors.muted3}
            fill={saved ? colors.primary : 'transparent'}
            strokeWidth={1.9}
          />
        </Pressable>
        {/* 저장한 말씀 목록 */}
        <Pressable style={styles.actionBtnWide} onPress={() => router.push('/saved')}>
          <List size={18} color={colors.muted3} strokeWidth={1.9} />
          <Text style={styles.actionBtnLabel}>저장한 말씀</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  header: {
    backgroundColor: colors.card,
    alignItems: 'center',
    paddingBottom: 12,
  },
  headerTitle: { fontFamily: font.bold, fontSize: 17, color: colors.title },

  hero: { height: 154, justifyContent: 'flex-end' },
  heroBottom: { padding: 16 },
  heroRef: { fontFamily: font.extraBold, fontSize: 18, color: '#FFFFFF', ...textShadow },
  heroDate: {
    marginTop: 3,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.85)',
    ...textShadow,
  },
  // 밝은 기본 배경용 — 진한 남색 글씨 (반투명 흰 패널 위)
  heroRefDark: { color: '#122B4F', textShadowColor: 'transparent', textShadowRadius: 0 },
  heroDateDark: { color: '#17406E', textShadowColor: 'transparent', textShadowRadius: 0 },
  versionTag: {
    marginTop: 4,
    fontFamily: font.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    ...textShadow,
  },
  versionTagDark: { color: '#5B7BA6', textShadowColor: 'transparent', textShadowRadius: 0 },
  heroPanel: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 28 },
  verseRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  verseNum: {
    fontFamily: font.bold,
    color: colors.primary,
    width: 18,
    textAlign: 'right',
    marginTop: 3,
  },
  verseText: { flex: 1, fontFamily: font.regular, color: colors.body },
  paragraph: { fontFamily: font.regular, color: colors.body },
  bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 9,
  },

  actionBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 10,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  actionBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginLeft: 'auto',
  },
  actionBtnLabel: { fontFamily: font.medium, fontSize: 13, color: colors.muted3 },
  fontCtl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 10,
    overflow: 'hidden',
  },
  fontBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontBtnDim: { opacity: 0.35 },
  fontBtnText: { fontFamily: font.bold, color: colors.body },
  fontCtlDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.divider },
});
