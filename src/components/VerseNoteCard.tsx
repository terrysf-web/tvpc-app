import { PenLine } from 'lucide-react-native';
import React, { useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { ensureSavedVerse } from '../data/savedVerses';
import { colors, font, shadows } from '../theme';

/** 부모(말씀 화면)가 형광펜 구절을 메모에 끼워 넣을 때 쓰는 핸들 */
export interface VerseNoteHandle {
  append(text: string): void;
}

/**
 * 말씀 묵상 메모 — 그날 말씀을 읽으며 받은 은혜를 적어두는 카드.
 * 내용은 이 기기(localStorage)에만 날짜별로 저장되고 서버로 가지 않는다.
 * 메모를 쓰면 북마크를 따로 누르지 않아도 '저장한 말씀' 목록에 자동으로
 * 담겨, 나중에 메모를 다시 찾아갈 수 있다.
 * 형광펜으로 표시한 구절은 append()로 메모 끝에 인용되어 들어온다.
 * 한글 조합(IME) 중 커서가 튀지 않도록 비제어 입력 + 디바운스 저장을 쓴다
 * (주보 설교 메모와 같은 방식).
 */
export const VerseNoteCard = React.forwardRef<
  VerseNoteHandle,
  {
    date: string;
    reference: string;
    heroText: string;
    onAutoSaved?: () => void;
  }
>(function VerseNoteCard({ date, reference, heroText, onAutoSaved }, ref) {
  const key = `verseNote:${date}`;
  const [initial] = useState(() =>
    typeof window !== 'undefined' && window.localStorage
      ? (window.localStorage.getItem(key) ?? '')
      : '',
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 비제어 입력이라 현재 값을 ref로 추적한다 (append용)
  const valueRef = useRef(initial);
  const webTa = useRef<{ value: string } | null>(null);
  const rnInput = useRef<TextInput | null>(null);

  const onChange = (t: string) => {
    valueRef.current = t;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, t);
        // 저장 표시는 처음 한 번만 — 입력 중 재렌더로 커서가 흔들리지 않게
        setSavedAt((s) => s ?? Date.now());
      }
      // 메모가 있으면 '저장한 말씀' 목록에도 자동으로 담는다
      if (t.trim()) {
        ensureSavedVerse({ date, reference, heroText }).then(() => onAutoSaved?.());
      }
    }, 500);
  };

  useImperativeHandle(ref, () => ({
    append(text: string) {
      const cur = valueRef.current.replace(/\s+$/, '');
      const next = cur ? `${cur}\n\n${text}\n` : `${text}\n`;
      if (Platform.OS === 'web') {
        if (webTa.current) webTa.current.value = next;
      } else {
        rnInput.current?.setNativeProps({ text: next });
      }
      onChange(next);
    },
  }));

  return (
    <View style={[styles.noteCard, shadows.card]}>
      <View style={styles.noteHead}>
        <View style={styles.noteChip}>
          <PenLine size={16} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={styles.noteTitle}>나의 묵상 메모</Text>
        {savedAt ? <Text style={styles.noteSaved}>자동 저장됨</Text> : null}
      </View>
      {Platform.OS === 'web' ? (
        React.createElement('textarea', {
          ref: webTa,
          defaultValue: initial,
          placeholder: '오늘 말씀에서 받은 은혜와 실천할 일을 적어보세요.',
          autoComplete: 'off',
          autoCorrect: 'off',
          autoCapitalize: 'off',
          spellCheck: false,
          onInput: (e: { target: { value: string } }) => onChange(e.target.value),
          style: {
            minHeight: 150,
            width: '100%',
            boxSizing: 'border-box',
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            borderRadius: 12,
            background: colors.screenBg,
            padding: '12px 14px',
            fontSize: 16,
            lineHeight: '24px',
            color: colors.body,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", sans-serif',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          },
        } as object)
      ) : (
        <TextInput
          ref={rnInput}
          style={styles.noteInput}
          defaultValue={initial}
          onChangeText={onChange}
          multiline
          placeholder="오늘 말씀에서 받은 은혜와 실천할 일을 적어보세요."
          placeholderTextColor={colors.faint}
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
        />
      )}
      <Text style={styles.noteHint}>
        메모는 이 전화기에만 저장되고, 메모한 말씀은 '저장한 말씀' 목록에 자동으로 담깁니다.
      </Text>
    </View>
  );
});

/** 이 기기에 해당 날짜의 말씀 메모가 있는지 */
export function hasVerseNote(date: string): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.localStorage &&
    !!window.localStorage.getItem(`verseNote:${date}`)
  );
}

const styles = StyleSheet.create({
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteTitle: { fontFamily: font.bold, fontSize: 14.5, color: colors.title, flex: 1 },
  noteSaved: { fontFamily: font.medium, fontSize: 11.5, color: colors.tagGreenText },
  noteInput: {
    minHeight: 150,
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.body,
    textAlignVertical: 'top',
  },
  noteHint: { fontFamily: font.regular, fontSize: 11.5, color: colors.faint },
});
