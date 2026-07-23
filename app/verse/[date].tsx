import { useLocalSearchParams } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../../src/components/OverlayHeader';
import { VerseNoteCard } from '../../src/components/VerseNoteCard';
import { isVerseSaved, toggleSavedVerse } from '../../src/data/savedVerses';
import { getHighlights, toggleHighlight, type VerseHighlight } from '../../src/data/verseMarks';
import { ensureAnonymousAuth, getDb } from '../../src/firebase';
import { colors, font, radius, shadows } from '../../src/theme';
import type { VerseDoc } from '../../src/types';

function dateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}

/** 저장한 말씀에서 열어 보는 지난 날짜의 말씀 전체 보기 */
export default function VerseByDateScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [verse, setVerse] = useState<VerseDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!date) return;
    let on = true;
    isVerseSaved(date).then((s) => on && setSaved(s));
    (async () => {
      try {
        const db = getDb();
        if (!db) {
          setFailed(true);
          return;
        }
        await ensureAnonymousAuth();
        const snap = await getDoc(doc(db, 'verses', date));
        if (!on) return;
        if (!snap.exists()) {
          setFailed(true);
          return;
        }
        setVerse({ ...(snap.data() as Omit<VerseDoc, 'id'>), id: snap.id });
      } catch {
        if (on) setFailed(true);
      }
    })();
    return () => {
      on = false;
    };
  }, [date]);

  // 이 날짜에 형광펜으로 표시해 둔 구절 (기기 저장)
  // 이 날짜에 형광펜으로 표시해 둔 구절 — 메모장 안에 고정으로 보여준다
  const [hls, setHls] = useState<VerseHighlight[]>([]);
  useEffect(() => {
    if (date) setHls(getHighlights(date));
  }, [date]);
  const hlSet = new Set(hls.map((h) => h.v));

  const onToggleSaved = () => {
    if (!verse) return;
    toggleSavedVerse({
      date: verse.date,
      reference: verse.reference,
      heroText: verse.heroText,
    }).then(setSaved);
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader
        title={verse?.reference ?? '말씀'}
        right={
          verse ? (
            <Pressable onPress={onToggleSaved} hitSlop={8}>
              <Bookmark
                size={20}
                color={saved ? colors.primary : colors.muted3}
                fill={saved ? colors.primary : 'transparent'}
                strokeWidth={1.9}
              />
            </Pressable>
          ) : undefined
        }
      />
      {!verse && !failed && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      {failed && (
        <View style={styles.center}>
          <Text style={styles.failText}>
            말씀을 불러오지 못했습니다.{'\n'}네트워크 연결을 확인해 주세요.
          </Text>
        </View>
      )}
      {verse && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.headCard, shadows.card]}>
            <Text style={styles.headTitle}>{verse.passageTitle}</Text>
            <Text style={styles.headDate}>{dateLabel(verse.date)}</Text>
            {verse.source === 'auto' && (
              <Text style={styles.versionTag}>성경전서 개역한글판</Text>
            )}
          </View>

          {/* 저장한 말씀에는 형광펜 구절 + 메모만 — 장 전체는 원할 때만 펼친다 */}
          <Text style={styles.sectionTitle}>메모</Text>
          <VerseNoteCard
            key={verse.date}
            date={verse.date}
            reference={verse.reference}
            heroText={verse.heroText}
            quotes={hls}
            onRemoveQuote={(v) => date && setHls(toggleHighlight(date, v, ''))}
            onAutoSaved={() => setSaved(true)}
          />

          {hls.length > 0 && (
            <Pressable style={styles.fullToggle} onPress={() => setShowFull((s) => !s)}>
              <Text style={styles.fullToggleText}>
                {showFull ? '전체 본문 접기 ▲' : '전체 본문 보기 ▼'}
              </Text>
            </Pressable>
          )}
          {(showFull || hls.length === 0) && (
            <>
              <Text style={styles.sectionTitle}>본문</Text>
              <View style={[styles.sectionCard, shadows.card]}>
                {verse.passage.map((p) => (
                  <View
                    key={p.verse}
                    style={[styles.verseRow, hlSet.has(p.verse) && styles.verseRowHl]}
                  >
                    <Text style={styles.verseNum}>{p.verse}</Text>
                    <Text style={styles.verseText}>{p.text}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failText: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted3,
    textAlign: 'center',
  },
  content: { padding: 16, paddingBottom: 40 },
  headCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 6,
  },
  headTitle: { fontFamily: font.bold, fontSize: 16.5, color: colors.title },
  headDate: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted3, marginTop: 3 },
  versionTag: { fontFamily: font.medium, fontSize: 11, color: '#5B7BA6', marginTop: 4 },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 14,
    color: colors.title,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    gap: 10,
  },
  verseRow: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginHorizontal: -6,
  },
  verseRowHl: { backgroundColor: '#FFF3BF' },
  fullToggle: { alignSelf: 'center', marginTop: 18, paddingVertical: 8, paddingHorizontal: 16 },
  fullToggleText: { fontFamily: font.bold, fontSize: 13, color: colors.primary },
  verseNum: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.primary,
    minWidth: 18,
    lineHeight: 23,
  },
  verseText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 23,
    color: colors.body,
  },
  paragraph: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 24, color: colors.body },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.body,
  },
});
