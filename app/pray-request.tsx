import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
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
import { submitPrayerRequest } from '../src/data/prayerRequests';
import { colors, font, shadows } from '../src/theme';

/** 함께기도해요 — 목사님께 보내는 비공개 기도요청 작성 */
export default function PrayRequestScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const send = async () => {
    if (!text.trim()) {
      setErr('기도 제목을 적어주세요.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await submitPrayerRequest(name, text);
      setDone(true);
    } catch {
      setErr('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OverlayHeader title="함께기도해요" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {done ? (
          <View style={[styles.card, shadows.card, { alignItems: 'center' }]}>
            <Text style={styles.doneEmoji}>🙏</Text>
            <Text style={styles.doneTitle}>목사님께 전달되었습니다</Text>
            <Text style={styles.hint}>
              소중한 기도 제목을 나눠주셔서 감사합니다.{'\n'}목사님이 함께 기도합니다.
            </Text>
            <Pressable style={styles.sendBtn} onPress={() => router.back()}>
              <Text style={styles.sendBtnText}>닫기</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.hint}>
              목사님께 나누고 싶은 기도 제목이나 마음의 짐이 있다면 편하게
              적어주세요. 목사님만 볼 수 있습니다.
            </Text>
            <Text style={styles.fieldLabel}>이름 (비워두면 익명)</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="예: 김성도"
              placeholderTextColor={colors.faint}
            />
            <Text style={styles.fieldLabel}>기도 제목</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={text}
              onChangeText={setText}
              placeholder="편하게 적어주세요."
              placeholderTextColor={colors.faint}
              multiline
            />
            {err ? <Text style={styles.error}>{err}</Text> : null}
            <Pressable
              style={[styles.sendBtn, busy && { opacity: 0.6 }]}
              onPress={send}
              disabled={busy}
            >
              <Text style={styles.sendBtnText}>{busy ? '보내는 중…' : '목사님께 보내기'}</Text>
            </Pressable>
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
  hint: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 16,
    textAlign: 'left',
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
  inputMulti: { minHeight: 140, textAlignVertical: 'top' },
  sendBtn: {
    marginTop: 2,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
    alignSelf: 'stretch',
  },
  sendBtnText: { fontFamily: font.bold, fontSize: 15, color: '#FFFFFF' },
  error: { marginBottom: 10, fontFamily: font.medium, fontSize: 13, color: colors.heartActive },
  doneEmoji: { fontSize: 40, marginBottom: 10 },
  doneTitle: { fontFamily: font.extraBold, fontSize: 17, color: colors.title, marginBottom: 8 },
});
