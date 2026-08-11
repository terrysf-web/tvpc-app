import { useFocusEffect } from 'expo-router';
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2.mjs';
import Heart from 'lucide-react-native/dist/esm/icons/heart.mjs';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import {
  type GratitudeEntry,
  getGratitudeEntries,
  removeGratitudeEntry,
} from '../src/data/gratitude';
import { colors, font, radius, shadows } from '../src/theme';

function dateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

/** 날짜별로 묶기 — 최신순 유지 */
function groupByDate(entries: GratitudeEntry[]): { date: string; items: GratitudeEntry[] }[] {
  const groups: { date: string; items: GratitudeEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }
  return groups;
}

/** 지난 감사일기 — 날짜별로 묶어서 최신순으로 보여준다 */
export default function GratitudeHistoryScreen() {
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getGratitudeEntries().then(
        (list) => on && setEntries([...list].sort((a, b) => b.createdAt - a.createdAt)),
      );
      return () => {
        on = false;
      };
    }, []),
  );

  const remove = async (id: string) => {
    setEntries(await removeGratitudeEntry(id));
  };

  const groups = groupByDate(entries);

  return (
    <View style={styles.screen}>
      <OverlayHeader title="지난 감사일기" />
      <ScrollView contentContainerStyle={styles.content}>
        {groups.length === 0 ? (
          <View style={styles.empty}>
            <Heart size={34} color={colors.faint} strokeWidth={1.6} />
            <Text style={styles.emptyTitle}>아직 적은 감사일기가 없습니다</Text>
            <Text style={styles.emptyText}>
              감사일기 화면에서 오늘 하루 감사했던 순간을{'\n'}적어보시면 여기에 쌓여요.
            </Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.date} style={styles.group}>
              <Text style={styles.groupDate}>{dateLabel(g.date)}</Text>
              <View style={[styles.card, shadows.card]}>
                {g.items.map((e, i) => (
                  <View key={e.id} style={[styles.item, i > 0 && styles.itemDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTime}>{fmtTime(e.createdAt)}</Text>
                      <Text style={styles.itemText}>{e.text}</Text>
                    </View>
                    <Pressable style={styles.removeBtn} onPress={() => remove(e.id)} hitSlop={8}>
                      <Trash2 size={15} color={colors.faint} strokeWidth={1.8} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 90, gap: 10 },
  emptyTitle: { fontFamily: font.bold, fontSize: 15.5, color: colors.title, marginTop: 4 },
  emptyText: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.muted3,
    textAlign: 'center',
  },
  group: { marginBottom: 16 },
  groupDate: {
    fontFamily: font.bold,
    fontSize: 12.5,
    color: colors.muted3,
    marginBottom: 8,
    marginLeft: 2,
  },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 4 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12 },
  itemDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  itemTime: { fontFamily: font.bold, fontSize: 10.5, color: colors.tagOrangeText, marginBottom: 2 },
  itemText: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, color: colors.body },
  removeBtn: { padding: 2 },
});
