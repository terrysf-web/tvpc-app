import { useFocusEffect, useRouter } from 'expo-router';
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2.mjs';
import React, { useCallback, useState } from 'react';
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
  type GratitudeEntry,
  addGratitudeEntry,
  getGratitudeEntries,
  removeGratitudeEntry,
  todayKey,
} from '../src/data/gratitude';
import { colors, font, radius, shadows } from '../src/theme';

function todayLabel(): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${days[d.getDay()]}요일`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
}

/**
 * 감사일기 — 하루를 마무리하며 감사한 것을 기록. 철저히 개인 기록(기기
 * 로컬 저장, 로그인 불필요)이며 하루에 여러 개 적을 수 있다.
 */
export default function GratitudeScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayKey();
  const todays = entries.filter((e) => e.date === today);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getGratitudeEntries().then((list) => on && setEntries(list));
      return () => {
        on = false;
      };
    }, []),
  );

  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const next = await addGratitudeEntry(today, text);
      setEntries(next);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setEntries(await removeGratitudeEntry(id));
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OverlayHeader title="감사일기" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, shadows.card]}>
          <Text style={styles.date}>{todayLabel()}</Text>
          <Text style={styles.prompt}>오늘 하루, 하나님의 은혜 안에 감사했던 순간은요?</Text>

          {todays.length > 0 && (
            <View style={styles.list}>
              {todays.map((e) => (
                <View key={e.id} style={styles.item}>
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
          )}

          <Text style={styles.addLabel}>{todays.length > 0 ? '또 하나 적어보기' : '적어보기'}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="아주 작은 것이라도 괜찮아요…"
            placeholderTextColor={colors.faint}
            multiline
          />
          <Pressable
            style={[styles.addBtn, (!text.trim() || busy) && styles.addBtnDisabled]}
            onPress={add}
            disabled={!text.trim() || busy}
          >
            <Text style={styles.addBtnText}>{busy ? '저장 중…' : '추가'}</Text>
          </Pressable>

          <Pressable style={styles.histLink} onPress={() => router.push('/gratitude-history')}>
            <Text style={styles.histLinkText}>지난 감사일기 보기 ›</Text>
          </Pressable>
        </View>
        <Text style={styles.foot}>이 기록은 이 기기에만 저장됩니다. 다른 분께는 보이지 않습니다.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 18 },
  date: { fontFamily: font.medium, fontSize: 12, color: colors.muted3 },
  prompt: {
    marginTop: 6,
    marginBottom: 14,
    fontFamily: font.extraBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.title,
  },
  list: { gap: 8, marginBottom: 14 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    padding: 12,
  },
  itemTime: { fontFamily: font.bold, fontSize: 10.5, color: colors.tagOrangeText, marginBottom: 2 },
  itemText: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, color: colors.body },
  removeBtn: { padding: 2 },
  addLabel: { fontFamily: font.medium, fontSize: 12, color: colors.muted3, marginBottom: 6 },
  input: {
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 13,
    minHeight: 88,
    textAlignVertical: 'top',
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.body,
  },
  addBtn: {
    marginTop: 12,
    backgroundColor: colors.tagOrangeText,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  addBtnDisabled: { opacity: 0.45 },
  addBtnText: { fontFamily: font.bold, fontSize: 14.5, color: '#FFFFFF' },
  histLink: { marginTop: 14, alignItems: 'center', paddingVertical: 4 },
  histLinkText: { fontFamily: font.bold, fontSize: 13, color: colors.primary },
  foot: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 11.5,
    color: colors.faint,
  },
});
