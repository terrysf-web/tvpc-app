import { LinearGradient } from 'expo-linear-gradient';
import { HandCoins, Landmark, ReceiptText } from 'lucide-react-native';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { sampleOfferings } from '../src/data/sample';
import { openExternal } from '../src/links';
import { colors, font, shadows } from '../src/theme';

/**
 * 실제 결제는 앱 밖 링크로 처리 (심사·PG 수수료 부담 최소화 — 핸드오프 문서 권장사항).
 * 교회의 온라인 헌금 페이지(Tithe.ly, 교회 홈페이지, 은행 링크 등) URL로 교체하세요.
 */
const GIVING_URL: string | null = null;

const SHORTCUTS = [
  { key: 'guide', label: '헌금 안내', icon: HandCoins },
  { key: 'account', label: '계좌 안내', icon: Landmark },
  { key: 'history', label: '헌금 내역', icon: ReceiptText },
] as const;

export default function OfferingScreen() {
  const insets = useSafeAreaInsets();

  const give = () => {
    if (GIVING_URL) {
      openExternal(GIVING_URL);
    } else {
      Alert.alert(
        '온라인 헌금',
        '교회 온라인 헌금 링크가 아직 연결되지 않았습니다.\n관리자 설정(app/offering.tsx의 GIVING_URL) 후 이용할 수 있습니다.',
      );
    }
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="헌금" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 파란 그라데이션 헌금 카드 */}
        <View style={[styles.heroWrap, shadows.hero]}>
          <LinearGradient
            colors={['#2A6BB5', '#163F73']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroLabel}>온라인 헌금</Text>
            <Text style={styles.heroText}>
              언제 어디서나{'\n'}마음을 담아 드리는 예배
            </Text>
            <Pressable style={styles.heroBtn} onPress={give}>
              <Text style={styles.heroBtnText}>헌금하기</Text>
            </Pressable>
          </LinearGradient>
        </View>

        {/* 3열 바로가기 */}
        <View style={styles.shortcutRow}>
          {SHORTCUTS.map((s) => (
            <Pressable key={s.key} style={[styles.shortcut, shadows.card]}>
              <View style={styles.shortcutChip}>
                <s.icon size={20} color={colors.primary} strokeWidth={1.9} />
              </View>
              <Text style={styles.shortcutLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 최근 헌금 내역 */}
        <Text style={styles.sectionTitle}>최근 헌금 내역</Text>
        <View style={[styles.historyCard, shadows.card]}>
          {sampleOfferings.map((o, i) => (
            <View
              key={o.id}
              style={[styles.historyRow, i < sampleOfferings.length - 1 && styles.historyDivider]}
            >
              <View>
                <Text style={styles.historyItem}>{o.item}</Text>
                <Text style={styles.historyDate}>{o.date.replaceAll('-', '.')}</Text>
              </View>
              <Text style={styles.historyAmount}>{o.amount}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          헌금 내역은 재정부 확인 후 반영됩니다. 문의: 교회 사무실 925-227-0880
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16 },

  heroWrap: { borderRadius: 20, marginBottom: 16 },
  hero: { borderRadius: 20, padding: 22 },
  heroLabel: { fontFamily: font.bold, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  heroText: {
    marginTop: 8,
    fontFamily: font.extraBold,
    fontSize: 20,
    lineHeight: 29,
    color: '#FFFFFF',
  },
  heroBtn: {
    marginTop: 18,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  heroBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.primary },

  shortcutRow: { flexDirection: 'row', gap: 11, marginBottom: 22 },
  shortcut: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 15,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  shortcutChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: { fontFamily: font.medium, fontSize: 12, color: colors.body },

  sectionTitle: {
    fontFamily: font.extraBold,
    fontSize: 16,
    color: colors.title,
    marginBottom: 12,
  },
  historyCard: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16 },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  historyDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  historyItem: { fontFamily: font.bold, fontSize: 14, color: colors.title },
  historyDate: { marginTop: 2, fontFamily: font.regular, fontSize: 12, color: colors.faint },
  historyAmount: { fontFamily: font.extraBold, fontSize: 15, color: colors.primary },

  note: {
    marginTop: 14,
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.faint,
  },
});
