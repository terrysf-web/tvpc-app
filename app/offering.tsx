import { LinearGradient } from 'expo-linear-gradient';
import { Check, Copy } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { colors, font, shadows } from '../src/theme';

/**
 * 온라인 헌금 — 교회는 Zelle(은행 앱 송금)로 받는다.
 * Zelle는 외부 결제 링크가 없으므로, 받는 이메일을 원터치로 복사해
 * 은행 앱에 붙여넣는 흐름으로 안내한다 (홈페이지 온라인 헌금 안내와 동일).
 */
const ZELLE_EMAIL = 'tvpc5925@gmail.com';

const OFFERING_TYPES = ['십일조(Tithe)', '주일(Sunday)', '감사(Thanksgiving)', '선교(Mission)'];

const STEPS = [
  '사용하시는 은행 앱에서 Zelle 송금을 엽니다.',
  `받는 사람에 ${ZELLE_EMAIL} 을 붙여넣습니다.`,
  '메모에 이름(또는 가정 번호)과 헌금 종류를 적고 보냅니다.',
];

export default function OfferingScreen() {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const copyEmail = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(ZELLE_EMAIL).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
            <Text style={styles.heroLabel}>온라인 헌금 · Zelle</Text>
            <Text style={styles.heroText}>
              언제 어디서나{'\n'}마음을 담아 드리는 예배
            </Text>
            <Pressable style={styles.heroBtn} onPress={copyEmail}>
              {copied ? (
                <Check size={16} color={colors.primary} strokeWidth={2.2} />
              ) : (
                <Copy size={16} color={colors.primary} strokeWidth={2} />
              )}
              <Text style={styles.heroBtnText}>
                {copied ? '복사됐습니다' : 'Zelle 이메일 복사'}
              </Text>
            </Pressable>
          </LinearGradient>
        </View>

        {/* Zelle 안내 */}
        <Text style={styles.sectionTitle}>Zelle로 헌금하는 방법</Text>
        <View style={[styles.zelleCard, shadows.card]}>
          <Pressable style={styles.zelleEmailRow} onPress={copyEmail}>
            <View style={{ flex: 1 }}>
              <Text style={styles.zelleEmailLabel}>받는 곳 (Zelle)</Text>
              <Text style={styles.zelleEmail}>{ZELLE_EMAIL}</Text>
            </View>
            {copied ? (
              <Check size={19} color={colors.tagGreenText} strokeWidth={2.2} />
            ) : (
              <Copy size={19} color={colors.primary} strokeWidth={1.9} />
            )}
          </Pressable>
          {STEPS.map((t, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{t}</Text>
            </View>
          ))}
          <View style={styles.typeRow}>
            {OFFERING_TYPES.map((t) => (
              <View key={t} style={styles.typeChip}>
                <Text style={styles.typeChipText}>{t}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.zelleHint}>
            메모 예: "홍길동 십일조" 또는 "23번 감사". 가정에 배정된 번호를 모르시면{' '}
            {ZELLE_EMAIL} 로 문의해 주세요.
          </Text>
        </View>

        <Text style={styles.note}>
          헌금 관련 문의: 교회 사무실 925-227-0880
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  heroBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.primary },

  zelleCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
  },
  zelleEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  zelleEmailLabel: { fontFamily: font.medium, fontSize: 11.5, color: colors.muted },
  zelleEmail: { marginTop: 2, fontFamily: font.extraBold, fontSize: 15.5, color: colors.primary },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontFamily: font.bold, fontSize: 11.5, color: '#FFFFFF' },
  stepText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.body,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4, marginBottom: 10 },
  typeChip: {
    backgroundColor: colors.tagGrayBg,
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  typeChipText: { fontFamily: font.medium, fontSize: 12, color: colors.muted },
  zelleHint: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, color: colors.faint },

  sectionTitle: {
    fontFamily: font.extraBold,
    fontSize: 16,
    color: colors.title,
    marginBottom: 12,
  },
  note: {
    marginTop: 14,
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.faint,
  },
});
