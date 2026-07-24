import { useRouter } from 'expo-router';
import { Siren } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useAdminAuth } from '../src/data/admin';
import { type AlertDoc, createAlert, getAlert, getRecentAlerts } from '../src/data/alerts';
import { colors, font, shadows } from '../src/theme';

/**
 * 긴급 공지 전용 화면 — 더보기 탭의 관리자 전용 바로가기로 진입.
 * 관리자 화면을 거치지 않고 제목·내용만 적어 바로 발송한다.
 */
export default function AlertSendScreen() {
  const router = useRouter();
  const { isAdmin, checking } = useAdminAuth();
  const [title, setTitle] = useState('긴급 공지');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [recent, setRecent] = useState<AlertDoc[]>([]);

  useEffect(() => {
    if (isAdmin) getRecentAlerts(3).then(setRecent).catch(() => {});
  }, [isAdmin]);

  const watchResult = (id: string) => {
    let tries = 0;
    const check = async () => {
      tries++;
      try {
        const a = await getAlert(id);
        if (a?.status === 'sent') {
          setResult(`✓ 발송 완료 — ${a.sentCount ?? 0}대 기기에 전송했습니다.`);
          getRecentAlerts(3).then(setRecent).catch(() => {});
          return;
        }
      } catch {}
      if (tries < 90) setTimeout(check, tries < 10 ? 3_000 : 10_000);
      else setResult('아직 발송 확인이 안 됩니다. 잠시 후 다시 확인해 주세요.');
    };
    setTimeout(check, 3_000);
  };

  const send = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setResult('제목과 내용을 모두 입력해 주세요.');
      return;
    }
    const q = '알림을 켠 모든 기기로 긴급 알림을 보낼까요?';
    const ok = await new Promise<boolean>((resolve) => {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        resolve(window.confirm(q));
      } else {
        Alert.alert('긴급 알림 발송', q, [
          { text: '취소', style: 'cancel', onPress: () => resolve(false) },
          { text: '보내기', style: 'destructive', onPress: () => resolve(true) },
        ]);
      }
    });
    if (!ok) return;

    setResult(null);
    setBusy(true);
    try {
      const id = await createAlert(t, b);
      setResult('✓ 발송을 시작했습니다. 잠시 후 발송 완료가 표시됩니다.');
      setBody('');
      watchResult(id);
    } catch (e) {
      setResult(`발송 실패: ${e instanceof Error ? e.message : '권한을 확인해 주세요.'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OverlayHeader title="긴급 공지" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {checking ? (
          <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} />
        ) : !isAdmin ? (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.title}>교역자 전용 화면입니다</Text>
            <Text style={styles.hint}>
              긴급 공지를 보내려면 먼저 관리자 로그인이 필요합니다.
            </Text>
            <Pressable style={styles.sendBtn} onPress={() => router.push('/admin')}>
              <Text style={styles.sendBtnText}>관리자 로그인</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, shadows.card]}>
            <View style={styles.headRow}>
              <View style={styles.iconChip}>
                <Siren size={19} color={colors.heartActive} strokeWidth={2} />
              </View>
              <Text style={styles.title}>긴급 알림 보내기</Text>
            </View>
            <Text style={styles.hint}>
              알림을 켠 모든 기기로 몇 초 안에 전송됩니다. 긴급할 때만 사용해 주세요.
            </Text>
            <Text style={styles.fieldLabel}>제목</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="예: 긴급 공지"
              placeholderTextColor={colors.faint}
            />
            <Text style={styles.fieldLabel}>내용</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={body}
              onChangeText={setBody}
              placeholder="예: 오늘 저녁 예배는 폭설로 온라인으로 전환합니다."
              placeholderTextColor={colors.faint}
              multiline
            />
            <Pressable
              style={[styles.sendBtn, { backgroundColor: colors.heartActive }, busy && { opacity: 0.6 }]}
              onPress={send}
              disabled={busy}
            >
              <Text style={styles.sendBtnText}>{busy ? '보내는 중…' : '긴급 알림 발송'}</Text>
            </Pressable>
            {result ? (
              <Text style={result.startsWith('✓') ? styles.resultOk : styles.resultErr}>
                {result}
              </Text>
            ) : null}

            {recent.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.recentTitle}>최근 발송</Text>
                {recent.map((a) => (
                  <View key={a.id} style={styles.recentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentName} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Text style={styles.recentMeta} numberOfLines={1}>
                        {new Date(a.createdAt).toLocaleString('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        · {a.body}
                      </Text>
                    </View>
                    <Text style={styles.recentStatus}>
                      {a.status === 'sent'
                        ? `${a.sentCount ?? 0}대`
                        : a.status === 'expired'
                          ? '만료'
                          : '발송 중'}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 18 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FDEBEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: font.extraBold, fontSize: 16.5, color: colors.title },
  hint: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.muted,
    marginBottom: 14,
  },
  fieldLabel: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted, marginBottom: 6 },
  input: {
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.body,
    marginBottom: 14,
  },
  inputMulti: { minHeight: 112, textAlignVertical: 'top' },
  sendBtn: {
    marginTop: 2,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  sendBtnText: { fontFamily: font.bold, fontSize: 15, color: '#FFFFFF' },
  resultOk: { marginTop: 12, fontFamily: font.medium, fontSize: 13, color: colors.tagGreenText },
  resultErr: { marginTop: 12, fontFamily: font.medium, fontSize: 13, color: colors.heartActive },
  divider: { height: 1, backgroundColor: colors.divider2, marginVertical: 16 },
  recentTitle: { fontFamily: font.extraBold, fontSize: 14, color: colors.title, marginBottom: 6 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider2,
  },
  recentName: { fontFamily: font.bold, fontSize: 13.5, color: colors.title },
  recentMeta: { marginTop: 2, fontFamily: font.regular, fontSize: 11.5, color: colors.muted },
  recentStatus: { fontFamily: font.bold, fontSize: 12, color: colors.tagGreenText },
});
