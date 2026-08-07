import { useLocalSearchParams } from 'expo-router';
import Megaphone from 'lucide-react-native/dist/esm/icons/megaphone.mjs';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../../src/components/OverlayHeader';
import { useBulletin } from '../../src/data/bulletin';
import { colors, font, radius, shadows } from '../../src/theme';

function dateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * 소식 탭의 "교회 소식" 카드에서 들어오는 화면 — 그 주 주보의 교회 소식만
 * 번호 매긴 목록으로 보여준다. 예배 순서·설교 등 주보의 다른 내용은 없다.
 */
export default function NoticesScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { bulletin, loading } = useBulletin(date ?? null, false);
  const notices = bulletin?.notices ?? [];

  return (
    <View style={styles.screen}>
      <OverlayHeader title="교회 소식" />
      <ScrollView contentContainerStyle={styles.content}>
        {loading && !bulletin && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        {!loading && notices.length === 0 && (
          <Text style={styles.empty}>불러올 소식이 없습니다.</Text>
        )}
        {notices.length > 0 && (
          <View style={[styles.card, shadows.card]}>
            <View style={styles.headRow}>
              <View style={styles.headWrap}>
                <View style={styles.iconChip}>
                  <Megaphone size={13} color={colors.tagOrangeText} strokeWidth={2} />
                </View>
                <Text style={styles.headTitle}>교회 소식</Text>
              </View>
              <Text style={styles.headDate}>{dateLabel(date ?? '')}</Text>
            </View>
            {notices.map((n, i) => (
              <View key={i} style={[styles.row, i === notices.length - 1 && styles.rowLast]}>
                <View style={styles.numBadge}>
                  <Text style={styles.numText}>{i + 1}</Text>
                </View>
                <View style={styles.textCol}>
                  <Text style={styles.title}>{n.title}</Text>
                  <Text style={styles.body}>{n.body}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  center: { paddingTop: 90, alignItems: 'center' },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.faint,
  },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 16 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconChip: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: colors.tagOrangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { fontFamily: font.extraBold, fontSize: 15, color: colors.title },
  headDate: { fontFamily: font.bold, fontSize: 15, color: colors.muted },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLast: { borderBottomWidth: 0 },
  numBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.tagOrangeBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  numText: { fontFamily: font.extraBold, fontSize: 11, color: colors.tagOrangeText },
  textCol: { flex: 1 },
  title: { fontFamily: font.bold, fontSize: 13.5, color: colors.body },
  body: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
});
