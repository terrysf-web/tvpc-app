import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { ensureAnonymousAuth, getDb } from '../src/firebase';
import { colors, font, shadows } from '../src/theme';

/**
 * 사진 출처 — 앱에서 쓰는 배경 사진들의 출처를 한곳에 모아 보여준다.
 * 라이선스마다 요구사항이 달라(CC-BY는 저작자 표시 필수, Canva는 대개 불필요)
 * 정확한 문구는 관리자가 등록한 그대로 보여준다.
 */
type Row = { key: string; label: string; credit: string };

// 관리자 업로드가 아니라 앱에 고정으로 넣은 그림 — Firestore 조회와 무관하게 항상 보여준다.
const STATIC_ROWS: Row[] = [
  { key: 'bulletinHero', label: '주보 · 이번주 말씀 카드 배경', credit: 'Canva' },
];

export default function CreditsScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const db = getDb();
        if (!db) {
          if (on) setRows([...STATIC_ROWS]);
          return;
        }
        await ensureAnonymousAuth();
        const [weekday, sunday, welcome] = await Promise.all([
          getDoc(doc(db, 'verseBg', 'original')),
          getDoc(doc(db, 'verseBg', 'sunday')),
          getDoc(doc(db, 'welcome', 'image')),
        ]);
        const found: Row[] = [];
        const add = (key: string, label: string, snap: typeof weekday) => {
          const credit = snap.exists() ? String(snap.get('credit') ?? '').trim() : '';
          if (credit) found.push({ key, label, credit });
        };
        add('weekday', '매일 말씀카드 배경', weekday);
        add('sunday', '주일예배 카드 배경', sunday);
        add('welcome', '웰컴 화면 배경', welcome);
        found.push(...STATIC_ROWS);
        if (on) setRows(found);
      } catch {
        if (on) setRows([...STATIC_ROWS]);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  return (
    <View style={styles.screen}>
      <OverlayHeader title="사진 출처" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {rows === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>등록된 출처 정보가 없습니다.</Text>
        ) : (
          <View style={[styles.card, shadows.card]}>
            {rows.map((r, i) => (
              <View key={r.key} style={[styles.row, i < rows.length - 1 && styles.rowDivider]}>
                <Text style={styles.label}>{r.label}</Text>
                <Text style={styles.credit}>{r.credit}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.note}>
          앱 아이콘·본문 안 사진은 별도 표기가 있는 경우를 제외하고 교회에서 직접 만들었거나
          자유 이용 라이선스(CC0·CC-BY 등) 사진을 사용합니다.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 18 },
  row: { paddingVertical: 15 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  label: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  credit: { marginTop: 4, fontFamily: font.regular, fontSize: 13, color: colors.muted },
  empty: { fontFamily: font.regular, fontSize: 13.5, color: colors.muted, textAlign: 'center', marginTop: 24 },
  note: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.faint,
    paddingHorizontal: 4,
  },
});
