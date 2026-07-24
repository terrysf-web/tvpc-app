import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bookmark, List, MonitorPlay } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { SegmentTabs } from '../../src/components/SegmentTabs';
import { useClockTick, useTodayVerse } from '../../src/data/hooks';
import {
  hasVerseNote,
  VerseNoteCard,
  type VerseNoteHandle,
} from '../../src/components/VerseNoteCard';
import { ensureSavedVerse, isVerseSaved, toggleSavedVerse } from '../../src/data/savedVerses';
import { getHighlights, toggleHighlight, type VerseHighlight } from '../../src/data/verseMarks';
import { churchInfo } from '../../src/churchInfo';
import { openExternal } from '../../src/links';
import { colors, font, shadows, textShadow } from '../../src/theme';
import { useVerseBg } from '../../src/verseBg';

type WordTab = 'text' | 'note' | 'med' | 'app' | 'pray';

// 묵상·적용·기도 탭은 지금은 쓰지 않아 숨김 — 필요해지면 다시 넣는다
const TABS: { key: WordTab; label: string }[] = [
  { key: 'text', label: '본문' },
  { key: 'note', label: '메모' },
];

/** 글씨크기 3단계 */
const FONT_SCALES = [1, 1.15, 1.3];

export default function WordScreen() {
  const insets = useSafeAreaInsets();
  // 시간대 배경이 저절로 갱신되도록 1분마다·앱 복귀 때 다시 그린다
  useClockTick();
  const { verse, ready } = useTodayVerse();
  const bg = useVerseBg();
  const router = useRouter();
  const [tab, setTab] = useState<WordTab>('text');
  const [scaleStep, setScaleStep] = useState(0);
  const [saved, setSaved] = useState(false);
  // 주일에는 이 탭이 온라인예배가 된다 — 말씀은 아래 링크로 볼 수 있음
  const [showWordOnSunday, setShowWordOnSunday] = useState(false);
  const scale = FONT_SCALES[scaleStep];

  // 오늘 말씀이 기기에 저장(북마크)돼 있는지 동기화
  useEffect(() => {
    let on = true;
    isVerseSaved(verse.date).then((s) => on && setSaved(s));
    return () => {
      on = false;
    };
  }, [verse.date]);

  // 형광펜 — 구절을 누르면 켜지고, 그 구절이 메모장 맨 위에 고정으로 들어온다.
  // 다시 누르면(또는 블록의 ✕) 형광펜과 메모장 속 구절이 함께 사라진다.
  // 표시한 구절과 메모는 저장한 말씀에 자동 보관된다.
  const noteRef = useRef<VerseNoteHandle>(null);
  const [hls, setHls] = useState<VerseHighlight[]>([]);
  useEffect(() => {
    setHls(getHighlights(verse.date));
  }, [verse.date]);
  const onToggleHl = (p: { verse: number; text: string }) => {
    const next = toggleHighlight(verse.date, p.verse, p.text);
    const turnedOn = next.some((h) => h.v === p.verse) && !hls.some((h) => h.v === p.verse);
    setHls(next);
    if (turnedOn) {
      // 구절이 메모장 맨 아래(이전 메모 다음)에 붙고, 메모 탭으로 넘어가
      // 새 메모 칸에 커서가 놓인다
      setTab('note');
      noteRef.current?.addQuote(p.verse, p.text);
    } else {
      noteRef.current?.removeQuote(p.verse);
    }
    if (next.length > 0) {
      ensureSavedVerse({
        date: verse.date,
        reference: verse.reference,
        heroText: verse.heroText,
      }).then(() => setSaved(true));
    }
  };
  const hlNums = new Set(hls.map((h) => h.v));
  // 메모 카드(memo)가 재렌더에서 격리되도록 콜백 참조를 고정한다
  const onQuoteRemoved = React.useCallback(
    (v: number) => setHls(toggleHighlight(verse.date, v, '')),
    [verse.date],
  );
  const onNoteAutoSaved = React.useCallback(() => setSaved(true), []);

  // 북마크 해제 시 메모·형광펜이 있으면 실수로 잃지 않게 한 번 더 확인
  const [noteKey, setNoteKey] = useState(0);
  const onToggleSaved = () => {
    const entry = { date: verse.date, reference: verse.reference, heroText: verse.heroText };
    if (saved && (hls.length > 0 || hasVerseNote(verse.date))) {
      const msg = `${verse.reference} 말씀의 저장을 해제할까요?\n적어둔 메모와 형광펜 표시도 함께 지워집니다.`;
      const doRemove = () => {
        toggleSavedVerse(entry).then(setSaved);
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(`verseNote:${verse.date}`);
            window.localStorage.removeItem(`verseHl:${verse.date}`);
          }
        } catch {
          /* 무시 */
        }
        setHls([]);
        setNoteKey((k) => k + 1); // 메모장 비우기(재장착)
      };
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm(msg)) doRemove();
      } else {
        Alert.alert('저장 해제', msg, [
          { text: '취소', style: 'cancel' },
          { text: '해제', style: 'destructive', onPress: doRemove },
        ]);
      }
      return;
    }
    toggleSavedVerse(entry).then(setSaved);
  };

  // 주일 — 온라인예배 화면 (말씀은 아래 버튼으로 볼 수 있다)
  if (new Date().getDay() === 0 && !showWordOnSunday) {
    const sundayServices = churchInfo.services.filter((s) => s.name.startsWith('주일예배'));
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
          <Text style={styles.headerTitle}>온라인예배</Text>
        </View>
        <ScrollView contentContainerStyle={styles.liveContent}>
          <View style={[styles.liveCard, shadows.card]}>
            <View style={styles.liveChip}>
              <MonitorPlay size={26} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={styles.liveTitle}>주일예배에 함께해요</Text>
            {sundayServices.map((s) => (
              <Text key={s.name} style={styles.liveTime}>
                {s.name.replace('주일예배 ', '')}부 예배 · {s.time.replace('주일 ', '')}
              </Text>
            ))}
            <Pressable style={styles.liveBtn} onPress={() => openExternal(churchInfo.youtube)}>
              <Text style={styles.liveBtnText}>▶ 온라인 예배 참여하기</Text>
            </Pressable>
            <Text style={styles.liveHint}>
              교회 유튜브 채널에서 실시간 예배와 다시보기를 보실 수 있습니다.
            </Text>
          </View>
          <Pressable style={styles.liveGhost} onPress={() => setShowWordOnSunday(true)} hitSlop={8}>
            <Text style={styles.liveGhostText}>오늘의 말씀 보기 ›</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

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
        {tab === 'text' && (
          <>
            <Text style={styles.hlHint}>
              구절을 누르면 형광펜으로 표시되고, 메모 탭에 담겨 바로 적을 수 있습니다
            </Text>
            {verse.passage.map((p) => (
              <Pressable
                key={p.verse}
                style={[styles.verseRow, hlNums.has(p.verse) && styles.verseRowHl]}
                onPress={() => onToggleHl(p)}
              >
                <Text style={[styles.verseNum, { fontSize: 13 * scale }]}>{p.verse}</Text>
                <Text
                  style={[styles.verseText, { fontSize: 14.5 * scale, lineHeight: 24 * scale }]}
                >
                  {p.text}
                </Text>
              </Pressable>
            ))}
          </>
        )}
        {/* 메모 탭 — 형광펜 구절이 담기는 메모장. 탭을 오가도 상태가 유지되게
            숨김(display:none)으로만 감춘다 */}
        <View style={{ display: tab === 'note' ? 'flex' : 'none' }}>
          <VerseNoteCard
            key={`${verse.date}:${noteKey}`}
            ref={noteRef}
            date={verse.date}
            reference={verse.reference}
            heroText={verse.heroText}
            onQuoteRemoved={onQuoteRemoved}
            onAutoSaved={onNoteAutoSaved}
          />
        </View>
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
  liveContent: { padding: 16, paddingTop: 24 },
  liveCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  liveChip: {
    width: 56,
    height: 56,
    borderRadius: 17,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  liveTitle: {
    fontFamily: font.extraBold,
    fontSize: 18,
    color: colors.title,
    marginBottom: 10,
  },
  liveTime: { fontFamily: font.medium, fontSize: 14, color: colors.body, marginBottom: 3 },
  liveBtn: {
    alignSelf: 'stretch',
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 13,
    alignItems: 'center',
    paddingVertical: 15,
  },
  liveBtnText: { fontFamily: font.bold, fontSize: 15.5, color: '#FFFFFF' },
  liveHint: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  liveGhost: { alignSelf: 'center', marginTop: 16, padding: 6 },
  liveGhostText: { fontFamily: font.medium, fontSize: 13.5, color: colors.muted },
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
  verseRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: 8,
  },
  // 형광펜 표시 — 부드러운 노란 바탕
  verseRowHl: { backgroundColor: '#FFF3BF' },
  hlHint: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: colors.faint,
    marginBottom: 10,
  },
  noteWrap: { marginTop: 18 },
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
