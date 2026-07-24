import { BellRing } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useNews } from '../src/data/hooks';
import { colors, font, shadows } from '../src/theme';

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${y}년 ${m}월 ${day}일`;
}

/** 알림 보관함 — 홈 우측 상단 종 아이콘으로 진입. 지난 긴급 알림을 다시 본다. */
export default function AlertsScreen() {
  const { news } = useNews();
  const alerts = news.filter((n) => n.alert);

  return (
    <View style={styles.screen}>
      <OverlayHeader title="알림" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {alerts.length === 0 && (
          <View style={[styles.card, shadows.card, { alignItems: 'center' }]}>
            <BellRing size={26} color={colors.faint2} strokeWidth={1.7} />
            <Text style={styles.emptyText}>받은 긴급 알림이 없습니다.</Text>
          </View>
        )}
        {alerts.map((a) => (
          <View key={a.id} style={[styles.card, shadows.card]}>
            <View style={styles.titleRow}>
              <View style={styles.iconChip}>
                <BellRing size={16} color={colors.tagOrangeText} strokeWidth={2} />
              </View>
              <Text style={styles.title}>{a.title}</Text>
            </View>
            {a.body ? <Text style={styles.body}>{a.body}</Text> : null}
            <Text style={styles.date}>{fmtDate(a.date)}</Text>
          </View>
        ))}
        <Text style={styles.hint}>
          교회에서 보낸 긴급 알림이 여기에 보관됩니다. 알림을 받으려면 더보기
          탭에서 "알림 받기"를 켜 주세요.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.tagOrangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontFamily: font.bold, fontSize: 15, color: colors.title },
  body: {
    marginTop: 10,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.body,
  },
  date: { marginTop: 10, fontFamily: font.regular, fontSize: 11.5, color: colors.faint },
  emptyText: { marginTop: 8, fontFamily: font.regular, fontSize: 13, color: colors.muted },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.faint,
  },
});
