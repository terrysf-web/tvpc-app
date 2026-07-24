import { PenLine, X } from 'lucide-react-native';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ensureSavedVerse } from '../data/savedVerses';
import { getHighlights } from '../data/verseMarks';
import { colors, font, shadows } from '../theme';

/**
 * 말씀 묵상 메모 — "구절 → 메모 → 구절 → 메모"가 번갈아 쌓이는 메모장.
 * 형광펜을 그으면 새 구절 블록이 항상 맨 아래(이전 메모 다음)에 붙고,
 * 바로 아래 새 메모 칸에 커서가 놓인다. 구절 블록은 수정·삭제가 안 되고
 * ✕ 또는 본문에서 다시 탭해야 사라진다.
 * 내용은 이 기기(localStorage)에만 날짜별로 저장되고 서버로 가지 않는다.
 * 한글 조합(IME) 안전을 위해 메모 칸은 비제어 입력 + 디바운스 저장.
 */

interface Seg {
  id: number;
  kind: 'q' | 'm';
  /** kind='q'일 때 절 번호 */
  v?: number;
  text: string;
}

export interface VerseNoteHandle {
  /** 형광펜 구절을 맨 아래에 추가하고 새 메모 칸으로 커서 이동 */
  addQuote(v: number, t: string): void;
  /** 형광펜 해제 시 해당 구절 블록 제거 */
  removeQuote(v: number): void;
  focus(): void;
}

const storeKey = (date: string) => `verseNote:${date}`;

/** 저장된 메모를 세그먼트로 읽는다 — 옛 형식(순수 문자열)도 허용 */
function loadSegs(date: string): Seg[] {
  let segs: Seg[] = [];
  let id = 1;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(storeKey(date));
      if (raw) {
        if (raw.startsWith('{"seg"')) {
          const parsed = JSON.parse(raw) as { seg?: { k?: string; v?: number; x?: string }[] };
          for (const s of parsed.seg ?? []) {
            segs.push({
              id: id++,
              kind: s.k === 'q' ? 'q' : 'm',
              v: s.v,
              text: String(s.x ?? ''),
            });
          }
        } else {
          segs = [{ id: id++, kind: 'm', text: raw }];
        }
      }
    }
  } catch {
    segs = [];
  }
  // 형광펜 저장분 중 메모장에 없는 구절은 뒤에 붙인다 (버전 이행)
  for (const h of getHighlights(date)) {
    if (!segs.some((s) => s.kind === 'q' && s.v === h.v)) {
      segs.push({ id: id++, kind: 'q', v: h.v, text: h.t });
    }
  }
  // 빈 메모 칸 정리 — 구절이 '빈 칸 아래(중간)'에 끼지 않게 하고,
  // 구절 사이와 맨 끝에만 메모 칸을 둔다
  const filled = segs.filter((s) => s.kind === 'q' || s.text.trim().length > 0);
  const out: Seg[] = [];
  for (let i = 0; i < filled.length; i++) {
    out.push(filled[i]);
    const next = filled[i + 1];
    if (filled[i].kind === 'q' && next && next.kind === 'q') {
      out.push({ id: id++, kind: 'm', text: '' });
    }
  }
  if (out.length === 0 || out[out.length - 1].kind === 'q') {
    out.push({ id: id++, kind: 'm', text: '' });
  }
  return out;
}

export const VerseNoteCard = React.forwardRef<
  VerseNoteHandle,
  {
    date: string;
    reference: string;
    heroText: string;
    /** 카드 안 ✕로 구절을 지웠을 때 부모가 형광펜도 해제하도록 알림 */
    onQuoteRemoved?: (v: number) => void;
    onAutoSaved?: () => void;
  }
>(function VerseNoteCard({ date, reference, heroText, onQuoteRemoved, onAutoSaved }, ref) {
  const [segs, setSegs] = useState<Seg[]>(() => loadSegs(date));
  const nextId = useRef(Math.max(0, ...segs.map((s) => s.id)) + 1);
  // 메모 칸의 현재 값 — 비제어 입력이라 ref로 추적
  const vals = useRef<Record<number, string>>(
    Object.fromEntries(segs.filter((s) => s.kind === 'm').map((s) => [s.id, s.text])),
  );
  const inputs = useRef<Record<number, { focus(): void } | null>>({});
  const pendingFocus = useRef<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refLabel = (v: number) =>
    /장$/.test(reference) ? reference.replace(/장$/, `:${v}`) : `${reference} ${v}절`;

  const serialize = (list: Seg[]) =>
    JSON.stringify({
      seg: list.map((s) =>
        s.kind === 'q'
          ? { k: 'q', v: s.v, x: s.text }
          : { k: 'm', x: vals.current[s.id] ?? s.text },
      ),
    });

  const persist = (list: Seg[]) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(storeKey(date), serialize(list));
        setSavedAt((s) => s ?? Date.now());
      }
    } catch {
      /* 저장 실패는 무시 */
    }
    const hasText = list.some((s) => s.kind === 'm' && (vals.current[s.id] ?? s.text).trim());
    if (hasText || list.some((s) => s.kind === 'q')) {
      ensureSavedVerse({ date, reference, heroText }).then(() => onAutoSaved?.());
    }
  };

  const onInput = (id: number, t: string) => {
    vals.current[id] = t;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(segs), 500);
  };

  // 구절 추가/삭제 뒤 커서 이동
  useEffect(() => {
    if (pendingFocus.current != null) {
      const id = pendingFocus.current;
      pendingFocus.current = null;
      setTimeout(() => inputs.current[id]?.focus(), 50);
    }
  }, [segs]);

  useImperativeHandle(ref, () => ({
    addQuote(v: number, t: string) {
      setSegs((prev) => {
        if (prev.some((s) => s.kind === 'q' && s.v === v)) return prev;
        const q: Seg = { id: nextId.current++, kind: 'q', v, text: t };
        const last = prev[prev.length - 1];
        let next: Seg[];
        if (last && last.kind === 'm' && !(vals.current[last.id] ?? last.text).trim()) {
          // 맨 끝 메모 칸이 비어 있으면 그 위에 구절을 넣고 그 칸을 그대로 쓴다
          next = [...prev.slice(0, -1), q, last];
          pendingFocus.current = last.id;
        } else {
          const m: Seg = { id: nextId.current++, kind: 'm', text: '' };
          vals.current[m.id] = '';
          next = [...prev, q, m];
          pendingFocus.current = m.id;
        }
        persist(next);
        return next;
      });
    },
    removeQuote(v: number) {
      setSegs((prev) => {
        const next = prev.filter((s) => !(s.kind === 'q' && s.v === v));
        persist(next);
        return next;
      });
    },
    focus() {
      const last = [...segs].reverse().find((s) => s.kind === 'm');
      if (last) inputs.current[last.id]?.focus();
    },
  }));

  const removeByX = (v: number) => {
    setSegs((prev) => {
      const next = prev.filter((s) => !(s.kind === 'q' && s.v === v));
      persist(next);
      return next;
    });
    onQuoteRemoved?.(v);
  };

  const renderInput = (s: Seg, isLast: boolean) => {
    const common = {
      placeholder: isLast ? '여기에 이어서 받은 은혜와 실천할 일을 적어보세요.' : '',
    };
    if (Platform.OS === 'web') {
      return React.createElement('textarea', {
        key: s.id,
        ref: (el: HTMLTextAreaElement | null) => {
          inputs.current[s.id] = el;
          if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight + 2}px`;
          }
        },
        defaultValue: vals.current[s.id] ?? s.text,
        autoComplete: 'off',
        autoCorrect: 'off',
        autoCapitalize: 'off',
        spellCheck: false,
        onInput: (e: { target: HTMLTextAreaElement }) => {
          // 내용에 따라 칸이 늘어나 위에 쓴 메모가 가려지지 않게
          const el = e.target;
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight + 2}px`;
          onInput(s.id, el.value);
        },
        ...common,
        style: {
          minHeight: isLast ? 150 : 64,
          width: '100%',
          boxSizing: 'border-box',
          border: 'none',
          outline: 'none',
          resize: 'none',
          overflow: 'hidden',
          background: 'transparent',
          padding: '10px 14px',
          fontSize: 16,
          lineHeight: '24px',
          color: colors.body,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", sans-serif',
          WebkitUserSelect: 'text',
          userSelect: 'text',
        },
      } as object);
    }
    return (
      <TextInput
        key={s.id}
        ref={(el) => {
          inputs.current[s.id] = el;
        }}
        style={[styles.noteInput, { minHeight: isLast ? 150 : 64 }]}
        defaultValue={vals.current[s.id] ?? s.text}
        onChangeText={(t) => onInput(s.id, t)}
        multiline
        placeholder={common.placeholder}
        placeholderTextColor={colors.faint}
        autoComplete="off"
        autoCorrect={false}
        spellCheck={false}
      />
    );
  };

  const lastTextId = [...segs].reverse().find((s) => s.kind === 'm')?.id;

  return (
    <View style={[styles.noteCard, shadows.card]}>
      <View style={styles.noteHead}>
        <View style={styles.noteChip}>
          <PenLine size={16} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={styles.noteTitle}>나의 묵상 메모</Text>
        {savedAt ? <Text style={styles.noteSaved}>자동 저장됨</Text> : null}
      </View>

      {/* 구절(고정)과 메모 칸이 번갈아 쌓인다 */}
      <View style={styles.notePad}>
        {segs.map((s) =>
          s.kind === 'q' ? (
            <View key={s.id} style={styles.quoteRow}>
              <Text style={styles.quoteText}>
                {s.text}
                <Text style={styles.quoteRef}> ({refLabel(s.v ?? 0)})</Text>
              </Text>
              <Pressable onPress={() => removeByX(s.v ?? 0)} hitSlop={8} style={styles.quoteX}>
                <X size={14} color="#8A6D00" strokeWidth={2} />
              </Pressable>
            </View>
          ) : (
            renderInput(s, s.id === lastTextId)
          ),
        )}
      </View>
      <Text style={styles.noteHint}>
        메모는 이 전화기에만 저장되고, 메모한 말씀은 '저장한 말씀' 목록에 자동으로 담깁니다.
      </Text>
    </View>
  );
});

/** 이 기기에 해당 날짜의 '내가 쓴 메모'가 있는지 */
export function hasVerseNote(date: string): boolean {
  return getVerseNoteText(date).trim().length > 0;
}

/** 내가 쓴 메모 본문만 이어붙여 반환 (목록 미리보기용) */
export function getVerseNoteText(date: string): string {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    const raw = window.localStorage.getItem(storeKey(date));
    if (!raw) return '';
    if (!raw.startsWith('{"seg"')) return raw;
    const parsed = JSON.parse(raw) as { seg?: { k?: string; x?: string }[] };
    return (parsed.seg ?? [])
      .filter((s) => s.k !== 'q')
      .map((s) => String(s.x ?? ''))
      .join(' ')
      .trim();
  } catch {
    return '';
  }
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
  // 형광펜 구절 + 메모가 번갈아 담기는 한 판
  notePad: {
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FFF3BF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: 8,
    marginVertical: 4,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.body,
    textAlignVertical: 'top',
  },
  noteHint: { fontFamily: font.regular, fontSize: 11.5, color: colors.faint },
});
