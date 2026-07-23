import { PenLine, X } from 'lucide-react-native';
import React, { useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ensureSavedVerse } from '../data/savedVerses';
import type { VerseHighlight } from '../data/verseMarks';
import { colors, font, shadows } from '../theme';

/** 부모(말씀 화면)가 형광펜 후 커서를 메모로 옮길 때 쓰는 핸들 */
export interface VerseNoteHandle {
  focus(): void;
}

/**
 * 말씀 묵상 메모 — 그날 말씀을 읽으며 받은 은혜를 적어두는 카드.
 * 형광펜으로 표시한 구절은 메모장 안 맨 위에 노란 형광펜 블록으로
 * 고정되어(수정·삭제 불가) 들어오고, 그 바로 아래에서 내 메모를
 * 이어서 쓴다. 구절 블록의 ✕ 또는 본문에서 다시 탭하면 형광펜과
 * 함께 블록도 사라진다.
 * 내용은 이 기기(localStorage)에만 날짜별로 저장되고 서버로 가지 않는다.
 * 메모나 형광펜이 있으면 '저장한 말씀' 목록에 자동으로 담긴다.
 * 한글 조합(IME) 중 커서가 튀지 않도록 비제어 입력 + 디바운스 저장을 쓴다
 * (주보 설교 메모와 같은 방식).
 */
export const VerseNoteCard = React.forwardRef<
  VerseNoteHandle,
  {
    date: string;
    reference: string;
    heroText: string;
    /** 형광펜 구절 — 메모장 안 맨 위에 고정 표시 */
    quotes?: VerseHighlight[];
    onRemoveQuote?: (v: number) => void;
    onAutoSaved?: () => void;
  }
>(function VerseNoteCard({ date, reference, heroText, quotes, onRemoveQuote, onAutoSaved }, ref) {
  const key = `verseNote:${date}`;
  const [initial] = useState(() =>
    typeof window !== 'undefined' && window.localStorage
      ? (window.localStorage.getItem(key) ?? '')
      : '',
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webTa = useRef<{ focus(): void } | null>(null);
  const rnInput = useRef<TextInput | null>(null);

  useImperativeHandle(ref, () => ({
    focus() {
      if (Platform.OS === 'web') webTa.current?.focus();
      else rnInput.current?.focus();
    },
  }));

  const refLabel = (v: number) =>
    /장$/.test(reference) ? reference.replace(/장$/, `:${v}`) : `${reference} ${v}절`;

  const onChange = (t: string) => {
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

  return (
    <View style={[styles.noteCard, shadows.card]}>
      <View style={styles.noteHead}>
        <View style={styles.noteChip}>
          <PenLine size={16} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={styles.noteTitle}>나의 묵상 메모</Text>
        {savedAt ? <Text style={styles.noteSaved}>자동 저장됨</Text> : null}
      </View>

      {/* 메모장 — 형광펜 구절(고정) + 내 메모가 한 판에 담긴다 */}
      <View style={styles.notePad}>
        {quotes && quotes.length > 0 && (
          <View style={styles.quoteList}>
            {quotes.map((q) => (
              <View key={q.v} style={styles.quoteRow}>
                <Text style={styles.quoteText}>
                  {q.t}
                  <Text style={styles.quoteRef}> ({refLabel(q.v)})</Text>
                </Text>
                {onRemoveQuote && (
                  <Pressable onPress={() => onRemoveQuote(q.v)} hitSlop={8} style={styles.quoteX}>
                    <X size={14} color="#8A6D00" strokeWidth={2} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
        {Platform.OS === 'web' ? (
          React.createElement('textarea', {
            ref: webTa,
            defaultValue: initial,
            placeholder: '여기에 이어서 받은 은혜와 실천할 일을 적어보세요.',
            autoComplete: 'off',
            autoCorrect: 'off',
            autoCapitalize: 'off',
            spellCheck: false,
            onInput: (e: { target: { value: string } }) => onChange(e.target.value),
            style: {
              minHeight: 200,
              width: '100%',
              boxSizing: 'border-box',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              background: 'transparent',
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
            placeholder="여기에 이어서 받은 은혜와 실천할 일을 적어보세요."
            placeholderTextColor={colors.faint}
            autoComplete="off"
            autoCorrect={false}
            spellCheck={false}
          />
        )}
      </View>
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
  // 형광펜 구절 + 메모가 함께 담기는 한 판
  notePad: {
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  quoteList: { padding: 10, paddingBottom: 0, gap: 6 },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FFF3BF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  quoteText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 13.5,
    lineHeight: 21,
    color: '#4A3F00',
  },
  quoteRef: { fontFamily: font.bold, fontSize: 12, color: '#8A6D00' },
  quoteX: { padding: 2, marginTop: 1 },
  noteInput: {
    minHeight: 200,
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
