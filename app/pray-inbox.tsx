import { HeartHandshake } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useAdminAuth } from '../src/data/admin';
import {
  getPrayerRequests,
  type PrayerRequest,
  removePrayerRequest,
  setPrayerRequestStatus,
} from '../src/data/prayerRequests';
import { colors, font, shadows } from '../src/theme';

function fmtWhen(t: number): string {
  return new Date(t).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** 기도요청함 — 목회자 전용. 교인들이 보낸 기도요청을 읽고 관리한다. */
export default function PrayInboxScreen() {
  const { role, checking } = useAdminAuth();
  const [rows, setRows] = useState<PrayerRequest[] | null>(null);

  const reload = useCallback(() => {
    getPrayerRequests().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    if (role === 'pastor') reload();
  }, [role, reload]);

  const togglePrayed = async (r: PrayerRequest) => {
    const status = r.status === 'prayed' ? 'new' : 'prayed';
    setRows((cur) => (cur ?? []).map((x) => (x.id === r.id ? { ...x, status } : x)));
    await setPrayerRequestStatus(r.id, status).catch(() => reload());
  };

  const remove = async (r: PrayerRequest) => {
    const q = '이 기도요청을 삭제할까요?';
    const ok = await new Promise<boolean>((resolve) => {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        resolve(window.confirm(q));
      } else {
        Alert.alert('삭제', q, [
          { text: '취소', style: 'cancel', onPress: () => resolve(false) },
          { text: '삭제', style: 'destructive', onPress: () => resolve(true) },
        ]);
      }
    });
    if (!ok) return;
    setRows((cur) => (cur ?? []).filter((x) => x.id !== r.id));
    await removePrayerRequest(r.id).catch(() => reload());
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="기도요청함" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {checking || (role === 'pastor' && rows === null) ? (
          <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} />
        ) : role !== 'pastor' ? (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.emptyText}>목회자 계정으로 로그인해야 볼 수 있습니다.</Text>
          </View>
        ) : rows && rows.length === 0 ? (
          <View style={[styles.card, shadows.card, { alignItems: 'center' }]}>
            <HeartHandshake size={26} color={colors.faint2} strokeWidth={1.7} />
            <Text style={styles.emptyText}>아직 도착한 기도요청이 없습니다.</Text>
          </View>
        ) : (
          (rows ?? []).map((r) => (
            <View key={r.id} style={[styles.card, shadows.card, r.status === 'prayed' && { opacity: 0.65 }]}>
              <View style={styles.headRow}>
                <Text style={styles.name}>{r.name || '익명'}</Text>
                <Text style={styles.when}>{fmtWhen(r.createdAt)}</Text>
              </View>
              <Text style={styles.body}>{r.text}</Text>
              <View style={styles.btnRow}>
                <Pressable
                  style={[styles.prayBtn, r.status === 'prayed' && styles.prayBtnDone]}
                  onPress={() => togglePrayed(r)}
                >
                  <Text
                    style={[styles.prayBtnText, r.status === 'prayed' && styles.prayBtnTextDone]}
                  >
                    {r.status === 'prayed' ? '✓ 기도했어요' : '🙏 기도했어요'}
                  </Text>
                </Pressable>
                <Pressable style={styles.delBtn} onPress={() => remove(r)}>
                  <Text style={styles.delBtnText}>삭제</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Text style={styles.hint}>
          교인들이 "함께기도해요"로 보낸 기도요청입니다. 목회자만 볼 수 있습니다.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  when: { fontFamily: font.regular, fontSize: 11.5, color: colors.faint },
  body: {
    marginTop: 8,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.body,
  },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  prayBtn: {
    backgroundColor: colors.tagGreenBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  prayBtnDone: { backgroundColor: colors.tagGrayBg },
  prayBtnText: { fontFamily: font.bold, fontSize: 13, color: colors.tagGreenText },
  prayBtnTextDone: { color: colors.muted },
  delBtn: {
    backgroundColor: colors.tagGrayBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  delBtnText: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  emptyText: { marginTop: 6, fontFamily: font.regular, fontSize: 13, color: colors.muted },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.faint,
  },
});
