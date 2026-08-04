import { useFocusEffect, useRouter } from 'expo-router';
import BookmarkX from 'lucide-react-native/dist/esm/icons/bookmark-x.mjs';
import Highlighter from 'lucide-react-native/dist/esm/icons/highlighter.mjs';
import PenLine from 'lucide-react-native/dist/esm/icons/pen-line.mjs';
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2.mjs';
import React, { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { getVerseNoteText, hasVerseNote } from '../src/components/VerseNoteCard';
import { getSavedVerses, removeSavedVerse, type SavedVerse } from '../src/data/savedVerses';
import { getHighlights } from '../src/data/verseMarks';
import { colors, font, radius, shadows } from '../src/theme';

function dateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/** 말씀 화면에서 북마크한 말씀 목록 — 누르면 그날 본문을 다시 볼 수 있다 */
export default function SavedVersesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<SavedVerse[]>([]);

  // 목록 화면에 돌아올 때마다 최신 저장 상태를 반영
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getSavedVerses().then((list) => on && setItems(list));
      return () => {
        on = false;
      };
    }, []),
  );

  // 삭제는 실수 방지를 위해 한 번 더 확인하고, 메모·형광펜도 함께 정리한다
  const onRemove = (v: SavedVerse) => {
    const doRemove = () => {
      removeSavedVerse(v.date).then(setItems);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(`bulletinNote:${v.date}`);
          window.localStorage.removeItem(`verseNote:${v.date}`);
          window.localStorage.removeItem(`verseHl:${v.date}`);
        }
      } catch {
        /* 무시 */
      }
    };
    const msg = `${v.reference} 말씀을 삭제할까요?\n적어둔 메모와 형광펜 표시도 함께 지워집니다.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) doRemove();
    } else {
      Alert.alert('삭제할까요?', msg, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="저장한 말씀" />
      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <BookmarkX size={34} color={colors.faint} strokeWidth={1.6} />
            <Text style={styles.emptyTitle}>아직 저장한 말씀이 없습니다</Text>
            <Text style={styles.emptyText}>
              말씀 화면 아래의 책갈피 아이콘을 누르면{'\n'}그날 말씀이 여기에 저장됩니다.
            </Text>
          </View>
        ) : (
          items.map((v) => {
            const hls = getHighlights(v.date);
            const note = getVerseNoteText(v.date);
            return (
            <Pressable
              key={v.date}
              style={[styles.card, shadows.card]}
              onPress={() => router.push(`/verse/${v.date}`)}
            >
              <View style={styles.cardBody}>
                <Text style={styles.cardDate}>{dateLabel(v.date)}</Text>
                <View style={styles.cardRefRow}>
                  <Text style={styles.cardRef}>{v.reference}</Text>
                  {hls.length > 0 && (
                    <View style={[styles.noteBadge, styles.hlBadge]}>
                      <Highlighter size={11} color="#8A6D00" strokeWidth={2.2} />
                      <Text style={[styles.noteBadgeText, styles.hlBadgeText]}>
                        형광펜 {hls.length}
                      </Text>
                    </View>
                  )}
                  {hasVerseNote(v.date) && (
                    <View style={styles.noteBadge}>
                      <PenLine size={11} color={colors.primary} strokeWidth={2.2} />
                      <Text style={styles.noteBadgeText}>메모</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardText} numberOfLines={2}>
                  {/* 말씀은 이미 메모에 들어 있으니 미리보기는 내 메모 → 형광펜 → 첫 구절 순 */}
                  {(note.trim() ||
                    (hls.length > 0 ? hls.map((h) => h.t).join(' ') : v.heroText)
                  ).replace(/\n/g, ' ')}
                </Text>
              </View>
              <Pressable style={styles.removeBtn} onPress={() => onRemove(v)} hitSlop={8}>
                <Trash2 size={17} color={colors.faint} strokeWidth={1.8} />
              </Pressable>
            </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 90, gap: 10 },
  emptyTitle: { fontFamily: font.bold, fontSize: 15.5, color: colors.title, marginTop: 4 },
  emptyText: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.muted3,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 10,
    gap: 4,
  },
  cardBody: { flex: 1, gap: 2 },
  cardDate: { fontFamily: font.medium, fontSize: 12, color: colors.muted3 },
  cardRefRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardRef: { fontFamily: font.bold, fontSize: 15.5, color: colors.title },
  noteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  noteBadgeText: { fontFamily: font.bold, fontSize: 10.5, color: colors.primary },
  hlBadge: { backgroundColor: '#FFF3BF' },
  hlBadgeText: { color: '#8A6D00' },
  cardText: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: colors.body },
  removeBtn: { padding: 8 },
});
