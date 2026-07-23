import { useFocusEffect, useRouter } from 'expo-router';
import { BookmarkX, ChevronRight, Trash2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { getSavedVerses, removeSavedVerse, type SavedVerse } from '../src/data/savedVerses';
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

  const onRemove = (date: string) => {
    removeSavedVerse(date).then(setItems);
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
          items.map((v) => (
            <Pressable
              key={v.date}
              style={[styles.card, shadows.card]}
              onPress={() => router.push(`/verse/${v.date}`)}
            >
              <View style={styles.cardBody}>
                <Text style={styles.cardDate}>{dateLabel(v.date)}</Text>
                <Text style={styles.cardRef}>{v.reference}</Text>
                <Text style={styles.cardText} numberOfLines={2}>
                  {v.heroText.replace(/\n/g, ' ')}
                </Text>
              </View>
              <Pressable style={styles.removeBtn} onPress={() => onRemove(v.date)} hitSlop={8}>
                <Trash2 size={17} color={colors.faint} strokeWidth={1.8} />
              </Pressable>
              <ChevronRight size={18} color={colors.faint} strokeWidth={1.9} />
            </Pressable>
          ))
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
  cardRef: { fontFamily: font.bold, fontSize: 15.5, color: colors.title },
  cardText: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: colors.body },
  removeBtn: { padding: 8 },
});
