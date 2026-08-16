import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import {
  type MyPrayer,
  getMyPrayers,
  refreshMyPrayers,
  submitPrayerAnswer,
  submitPrayerRequest,
} from '../src/data/prayerRequests';
import { colors, font, shadows } from '../src/theme';

/** 이름 칸에 이름이 아닌 글자(숫자·기호·이모지 등)가 섞여 들어가지 않게 —
 * 목사님이 기도 대상을 부르며 기도하실 때 이름만 깔끔하게 남아야 해서,
 * 한글·영문·띄어쓰기·가운뎃점(복수 이름 "김성도·이믿음")만 남기고 나머지는
 * 입력하는 순간 걸러낸다. */
function sanitizeName(s: string): string {
  return s.replace(/[^가-힣a-zA-Z\s·]/g, '');
}

/** "7월 27일" 처럼 짧게 */
function fmtWhen(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 함께기도해요 — 목사님께 보내는 비공개 기도요청 작성 */
export default function PrayRequestScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // 이 기기에서 보낸 기도 — 목사님이 기도를 시작하셨는지 여기서 확인한다
  const [mine, setMine] = useState<MyPrayer[]>(() => getMyPrayers());
  useEffect(() => {
    refreshMyPrayers().then(setMine);
  }, []);
  // 응답 나눔 적기 — 어떤 기도의 응답인지 들고 연다
  const [answering, setAnswering] = useState<MyPrayer | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answerBusy, setAnswerBusy] = useState(false);
  const [answerErr, setAnswerErr] = useState<string | null>(null);

  const sendAnswer = async () => {
    if (!answering) return;
    if (!answerText.trim()) {
      setAnswerErr('어떻게 응답받으셨는지 한 줄만 적어주세요.');
      return;
    }
    setAnswerErr(null);
    setAnswerBusy(true);
    try {
      await submitPrayerAnswer(answering.id, answerText);
      setMine(getMyPrayers());
      setAnswering(null);
      setAnswerText('');
    } catch {
      setAnswerErr('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setAnswerBusy(false);
    }
  };

  const send = async () => {
    if (!text.trim()) {
      setErr('기도 제목을 적어주세요.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await submitPrayerRequest(name, text);
      setMine(getMyPrayers());
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
              onChangeText={(t) => setName(sanitizeName(t))}
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

        {mine.length > 0 && (
          <View style={styles.mineWrap}>
            <Text style={styles.mineTitle}>내가 보낸 기도</Text>
            {mine.map((m) => (
              <View key={m.id} style={[styles.mineCard, shadows.card]}>
                <View style={styles.mineHead}>
                  <Text style={styles.mineWhen}>{fmtWhen(m.createdAt)} 보냄</Text>
                  {/* 세 단계로 보여준다: 전달됨 → 함께 기도 중 → 기도 응답 받음 */}
                  <View
                    style={[
                      styles.chip,
                      m.status === 'prayed' && styles.chipPraying,
                      m.answer != null && styles.chipAnswered,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        m.status === 'prayed' && styles.chipTextPraying,
                        m.answer != null && styles.chipTextAnswered,
                      ]}
                    >
                      {m.answer != null
                        ? '기도 응답 받음'
                        : m.status === 'prayed'
                          ? '함께 기도 중'
                          : '전달됨'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.mineText}>{m.text}</Text>
                {m.status === 'prayed' && (
                  <Text style={styles.minePrayed}>
                    목사님이 기도 제목을 읽고 함께 기도하고 계십니다
                    {m.prayedAt ? ` · ${fmtWhen(m.prayedAt)}` : ''}
                  </Text>
                )}
                {m.answer ? (
                  <View style={styles.answerBox}>
                    <Text style={styles.answerLabel}>내가 전한 응답</Text>
                    <Text style={styles.answerText}>{m.answer}</Text>
                    <Text style={styles.answerWhen}>
                      {m.answeredAt ? `${fmtWhen(m.answeredAt)} · 목사님께 전해졌습니다` : ''}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    style={styles.answerBtn}
                    onPress={() => {
                      setAnswering(m);
                      setAnswerText('');
                      setAnswerErr(null);
                    }}
                  >
                    <Text style={styles.answerBtnText}>기도 응답 받았어요</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Text style={styles.mineFoot}>
              보낸 기도는 이 기기에만 기록됩니다. 다른 분께는 보이지 않습니다.
            </Text>
          </View>
        )}
      </ScrollView>

      {answering && (
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setAnswering(null)} />
          <View style={[styles.sheet, shadows.card]}>
            <Text style={styles.sheetTitle}>어떻게 응답되었나요?</Text>
            <Text style={styles.sheetSub}>
              짧게 적으셔도 좋습니다. 목사님께만 전해집니다.
            </Text>
            <View style={styles.quoteBox}>
              <Text style={styles.quoteWhen}>{fmtWhen(answering.createdAt)}에 보내신 기도</Text>
              <Text style={styles.quoteText}>{answering.text}</Text>
            </View>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={answerText}
              onChangeText={setAnswerText}
              placeholder="예: 수술이 잘 끝났고 어제 퇴원하셨습니다."
              placeholderTextColor={colors.faint}
              multiline
            />
            {answerErr ? <Text style={styles.error}>{answerErr}</Text> : null}
            <Pressable
              style={[styles.sendBtn, answerBusy && { opacity: 0.6 }]}
              onPress={sendAnswer}
              disabled={answerBusy}
            >
              <Text style={styles.sendBtnText}>
                {answerBusy ? '보내는 중…' : '응답 나눔 보내기'}
              </Text>
            </Pressable>
            <Pressable style={styles.sheetCancel} onPress={() => setAnswering(null)} hitSlop={6}>
              <Text style={styles.sheetCancelText}>나중에</Text>
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  mineWrap: { marginTop: 22 },
  mineTitle: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.title,
    marginBottom: 10,
    marginLeft: 2,
  },
  mineCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10 },
  mineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mineWhen: { fontFamily: font.medium, fontSize: 12, color: colors.faint },
  chip: { backgroundColor: colors.tagGrayBg, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  chipPraying: { backgroundColor: colors.tagBlueBg },
  chipAnswered: { backgroundColor: colors.tagGreenBg },
  chipText: { fontFamily: font.bold, fontSize: 11.5, color: colors.tagGrayText },
  chipTextPraying: { color: colors.tagBlueText },
  chipTextAnswered: { color: colors.tagGreenText },
  mineText: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.body,
    marginTop: 8,
  },
  minePrayed: {
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.tagGreenText,
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  answerBtn: {
    marginTop: 11,
    borderRadius: 11,
    backgroundColor: colors.tagBlueBg,
    paddingVertical: 11,
    alignItems: 'center',
  },
  answerBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.primary },
  answerBox: {
    marginTop: 11,
    borderLeftWidth: 3,
    borderLeftColor: colors.tagGreenText,
    backgroundColor: colors.tagGreenBg,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    padding: 11,
  },
  answerLabel: { fontFamily: font.bold, fontSize: 11.5, color: colors.tagGreenText },
  answerText: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.body,
    marginTop: 5,
  },
  answerWhen: { fontFamily: font.regular, fontSize: 11.5, color: colors.muted2, marginTop: 6 },
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12, 26, 46, 0.42)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 28,
  },
  sheetTitle: { fontFamily: font.extraBold, fontSize: 17, color: colors.title },
  sheetSub: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 12,
  },
  quoteBox: { backgroundColor: colors.screenBg, borderRadius: 12, padding: 12, marginBottom: 12 },
  quoteWhen: { fontFamily: font.medium, fontSize: 11.5, color: colors.faint, marginBottom: 4 },
  quoteText: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, color: colors.body },
  sheetCancel: { alignSelf: 'center', marginTop: 12, padding: 6 },
  sheetCancelText: { fontFamily: font.medium, fontSize: 14, color: colors.muted2 },
  mineFoot: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: colors.faint,
    marginTop: 2,
    marginLeft: 2,
  },
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
