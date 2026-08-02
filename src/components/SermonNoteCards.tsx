import { PenLine, X } from 'lucide-react-native';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, shadows } from '../theme';

export interface SermonNoteHandle {
  /** 형광펜으로 표시한 구절을 메모 맨 끝에 이어붙인다 */
  appendQuote(reference: string, text: string): void;
}

/**
 * 괄호 채우기 — 주보 설교 노트의 빈칸 문장을 그대로 깔아주고,
 * 괄호 자리만 입력칸으로 만든다. 문장 글자는 지워지지 않고,
 * 입력칸은 쓰는 글자 수에 따라 옆으로 늘어난다.
 * 답은 이 기기(localStorage)에만 날짜별(주보 날짜)로 저장된다.
 */
export const FillInCard = React.memo(function FillInCard({
  date,
  lines,
}: {
  date: string;
  lines: string[];
}) {
  const key = `bulletinFill:${date}`;
  const [initial] = useState<Record<string, string>>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, string>;
      }
    } catch {
      /* 무시 */
    }
    return {};
  });
  const vals = useRef<Record<string, string>>({ ...initial });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, JSON.stringify(vals.current));
        }
      } catch {
        /* 무시 */
      }
    }, 500);
  };

  // 칸 폭 맞추기 — 적는 글자가 가려지지 않게 한 글자 칠 때마다 늘어난다.
  // 한글은 영문보다 넓어 글자 수로는 맞지 않으므로, 실제 글자 폭을 재서 쓴다.
  const composingBlank = useRef(false);
  const lastBlank = useRef<HTMLInputElement | null>(null);
  const canvas = useRef<CanvasRenderingContext2D | null>(null);
  const textWidth = (text: string, el: HTMLInputElement): number => {
    if (typeof document === 'undefined') return 0;
    if (!canvas.current) canvas.current = document.createElement('canvas').getContext('2d');
    const ctx = canvas.current;
    if (!ctx) return 0;
    const cs = window.getComputedStyle(el);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return ctx.measureText(text).width;
  };
  const MIN_BLANK = 52; // 빈 칸일 때도 눌러 넣기 좋은 최소 폭(px)
  const fit = (input?: HTMLInputElement | null) => {
    const el = input ?? lastBlank.current;
    if (!el) return;
    const want = Math.max(MIN_BLANK, Math.ceil(textWidth(el.value, el)) + 20);
    // 한글 조합 중에는 줄이지 않는다 — 조합 글자가 지워지며 칸이 들썩이지 않게
    const now = Number.parseFloat(el.style.width) || 0;
    el.style.width = `${composingBlank.current ? Math.max(now, want) : want}px`;
  };
  const blankInput = (id: string) => {
    if (Platform.OS === 'web') {
      return React.createElement('input', {
        key: id,
        type: 'text',
        defaultValue: vals.current[id] ?? '',
        autoComplete: 'off',
        autoCorrect: 'off',
        autoCapitalize: 'off',
        spellCheck: false,
        ref: (el: HTMLInputElement | null) => {
          // 화면이 다시 그려질 때 ref가 재실행돼도 크기 재설정은 최초 한 번만 —
          // 입력 중 크기 변경은 커서를 처음으로 튕겨보낸다
          if (el && !el.dataset.sized) {
            el.dataset.sized = '1';
            fit(el);
          }
        },
        onCompositionStart: () => {
          composingBlank.current = true;
        },
        onCompositionEnd: (e: { target: HTMLInputElement }) => {
          composingBlank.current = false;
          fit(e.target);
        },
        onBlur: (e: { target: HTMLInputElement }) => {
          lastBlank.current = e.target;
          fit();
        },
        onInput: (e: { target: HTMLInputElement }) => {
          const el = e.target;
          lastBlank.current = el;
          vals.current[id] = el.value;
          fit(el);
          save();
        },
        style: {
          display: 'inline-block',
          width: '52px',
          maxWidth: '100%',
          border: 'none',
          borderBottom: `2px solid ${colors.primary}`,
          borderRadius: 4,
          background: '#F0F6FD',
          padding: '0 4px',
          margin: '0 2px',
          fontSize: 15,
          lineHeight: '24px',
          fontWeight: 700,
          color: colors.primary,
          outline: 'none',
          verticalAlign: 'baseline',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", sans-serif',
          WebkitUserSelect: 'text',
          userSelect: 'text',
        },
      } as object);
    }
    return (
      <TextInput
        key={id}
        style={styles.fillInput}
        defaultValue={vals.current[id] ?? ''}
        onChangeText={(t) => {
          vals.current[id] = t;
          save();
        }}
        autoComplete="off"
        autoCorrect={false}
        spellCheck={false}
      />
    );
  };

  return (
    <View style={[styles.noteCard, shadows.card]}>
      <View style={styles.noteHead}>
        <View style={styles.noteChip}>
          <PenLine size={16} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={styles.noteTitle}>괄호 채우기</Text>
      </View>
      {lines.map((line, li) => {
        const parts = line.split('(____)');
        if (Platform.OS === 'web') {
          const children: React.ReactNode[] = [];
          parts.forEach((p, pi) => {
            if (p) children.push(p);
            if (pi < parts.length - 1) children.push(blankInput(`${li}:${pi}`));
          });
          return React.createElement(
            'div',
            {
              key: li,
              style: {
                fontSize: 15,
                lineHeight: '26px',
                color: colors.body,
                marginBottom: 10,
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", sans-serif',
              },
            },
            ...children,
          );
        }
        return (
          <View key={li} style={styles.fillLine}>
            {parts.map((p, pi) => (
              <React.Fragment key={pi}>
                {p ? <Text style={styles.fillText}>{p}</Text> : null}
                {pi < parts.length - 1 ? blankInput(`${li}:${pi}`) : null}
              </React.Fragment>
            ))}
          </View>
        );
      })}
      <Text style={styles.noteHint}>괄호에 적은 답은 이 전화기에만 저장됩니다.</Text>
    </View>
  );
});

/**
 * 설교 메모 — 주보의 괄호 채우기·나눔 질문 답을 전화기에 적어두는 카드.
 * 내용은 이 기기(localStorage)에만 날짜별(주보 날짜)로 저장되고 서버로 가지 않는다.
 */
interface Seg {
  id: number;
  kind: 'q' | 'm';
  /** kind='q'일 때만 — 구절 참조 표시(예: "빌립보서 2:5") */
  reference?: string;
  text: string;
}

const noteKey = (date: string) => `bulletinNote:${date}`;

/** 저장된 메모를 세그먼트로 읽는다 — 옛 형식(순수 문자열)도 첫 메모 칸으로 허용 */
function loadSegs(date: string): Seg[] {
  let segs: Seg[] = [];
  let id = 1;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(noteKey(date));
      if (raw) {
        if (raw.startsWith('{"seg"')) {
          const parsed = JSON.parse(raw) as { seg?: { k?: string; r?: string; x?: string }[] };
          for (const s of parsed.seg ?? []) {
            segs.push({
              id: id++,
              kind: s.k === 'q' ? 'q' : 'm',
              reference: s.r,
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
  if (segs.length === 0 || segs[segs.length - 1].kind === 'q') {
    segs.push({ id: id++, kind: 'm', text: '' });
  }
  return segs;
}

/**
 * 설교 메모 — 주보의 괄호 채우기·나눔 질문 답, 그리고 형광펜으로 표시한
 * 구절이 "구절 → 메모 → 구절 → 메모"로 번갈아 쌓이는 메모장.
 * 구절을 표시하면 그 자리에 바로 삽입되고, 이어서 쓸 새 메모 칸으로 커서가
 * 옮겨간다. 구절 블록은 수정할 수 없고 ✕로만 지운다.
 * 내용은 이 기기(localStorage)에만 날짜별(주보 날짜)로 저장되고 서버로 가지 않는다.
 * 한글 조합(IME) 안전을 위해 각 메모 칸은 비제어 입력 + 디바운스 저장.
 */
export const SermonNoteCard = React.memo(
  React.forwardRef<SermonNoteHandle, { date: string }>(function SermonNoteCard({ date }, ref) {
    const [segs, setSegs] = useState<Seg[]>(() => loadSegs(date));
    const nextId = useRef(Math.max(0, ...segs.map((s) => s.id)) + 1);
    const vals = useRef<Record<number, string>>(
      Object.fromEntries(segs.filter((s) => s.kind === 'm').map((s) => [s.id, s.text])),
    );
    const inputs = useRef<Record<number, { focus(): void } | null>>({});
    const pendingFocus = useRef<number | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const serialize = (list: Seg[]) =>
      JSON.stringify({
        seg: list.map((s) =>
          s.kind === 'q'
            ? { k: 'q', r: s.reference, x: s.text }
            : { k: 'm', x: vals.current[s.id] ?? s.text },
        ),
      });

    const persist = (list: Seg[]) => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(noteKey(date), serialize(list));
        }
      } catch {
        /* 무시 */
      }
      setSavedAt(Date.now());
    };

    const onInput = (id: number, t: string) => {
      vals.current[id] = t;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => persist(segs), 500);
    };

    // 한글 조합(IME) 중 크기 변경은 조합을 끊는다 — 타이핑 중에는 손대지 않고,
    // 입력을 잠깐 멈췄을 때(저장 시점)와 칸을 벗어날 때만 칸을 늘린다.
    const composing = useRef(false);
    const lastEl = useRef<HTMLTextAreaElement | null>(null);
    const grow = () => {
      const el = lastEl.current;
      if (el && !composing.current && el.scrollHeight > el.clientHeight + 2) {
        el.style.height = `${el.scrollHeight + 2}px`;
      }
    };
    const onBlurInput = () => grow();

    // 구절 삽입 뒤 새 메모 칸으로 커서 이동
    useEffect(() => {
      if (pendingFocus.current != null) {
        const id = pendingFocus.current;
        pendingFocus.current = null;
        setTimeout(() => inputs.current[id]?.focus(), 50);
      }
    }, [segs]);

    useImperativeHandle(ref, () => ({
      appendQuote(reference: string, text: string) {
        setSegs((prev) => {
          if (prev.some((s) => s.kind === 'q' && s.reference === reference)) return prev;
          const q: Seg = { id: nextId.current++, kind: 'q', reference, text };
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
    }));

    const removeQuote = (segId: number) => {
      setSegs((prev) => {
        const next = prev.filter((s) => s.id !== segId);
        persist(next);
        return next;
      });
    };

    const renderInput = (s: Seg, isLast: boolean) => {
      const placeholder = isLast
        ? '괄호 채우기와 은혜받은 말씀을 적어보세요.'
        : '';
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
          placeholder,
          autoComplete: 'off',
          autoCorrect: 'off',
          autoCapitalize: 'off',
          spellCheck: false,
          onBlur: onBlurInput,
          onCompositionStart: () => {
            composing.current = true;
          },
          onCompositionEnd: () => {
            composing.current = false;
          },
          onInput: (e: { target: HTMLTextAreaElement }) => {
            lastEl.current = e.target;
            onInput(s.id, e.target.value);
          },
          style: {
            minHeight: isLast ? 110 : 48,
            width: '100%',
            boxSizing: 'border-box',
            border: 'none',
            outline: 'none',
            resize: 'none',
            overflow: 'auto',
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
          style={[styles.noteInput, { minHeight: isLast ? 110 : 48 }]}
          defaultValue={vals.current[s.id] ?? s.text}
          onChangeText={(t) => onInput(s.id, t)}
          onBlur={onBlurInput}
          multiline
          placeholder={placeholder}
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
          <Text style={styles.noteTitle}>설교 메모</Text>
          {savedAt ? <Text style={styles.noteSaved}>자동 저장됨</Text> : null}
        </View>
        {/* 구절(고정)과 메모 칸이 번갈아 쌓인다 — 구절은 내가 쓴 메모와 헷갈리지
            않게 작은 글씨·다른 색으로 표시 */}
        <View style={styles.notePad}>
          {segs.map((s) =>
            s.kind === 'q' ? (
              <View key={s.id} style={styles.quoteRow}>
                <Text style={styles.quoteText}>
                  “{s.text}” <Text style={styles.quoteRef}>({s.reference})</Text>
                </Text>
                <Pressable onPress={() => removeQuote(s.id)} hitSlop={8} style={styles.quoteX}>
                  <X size={13} color={colors.faint} strokeWidth={2} />
                </Pressable>
              </View>
            ) : (
              renderInput(s, s.id === lastTextId)
            ),
          )}
        </View>
        <Text style={styles.noteHint}>메모는 이 전화기에만 저장됩니다. 주보 날짜별로 따로 보관돼요.</Text>
      </View>
    );
  }),
);

const styles = StyleSheet.create({
  noteCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  // 구절+메모 칸이 번갈아 담기는 한 판
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
    backgroundColor: '#F0F6FD',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  quoteText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.primary,
  },
  quoteRef: { fontFamily: font.regular, fontSize: 11, color: colors.muted },
  quoteX: { padding: 2, marginTop: 2 },
  noteChip: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteTitle: { flex: 1, fontFamily: font.extraBold, fontSize: 14.5, color: colors.title },
  noteSaved: { fontFamily: font.medium, fontSize: 11.5, color: colors.tagGreenText },
  noteInput: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: font.regular,
    // iOS 사파리는 16px 미만 입력창에서 화면을 확대하므로 16 유지
    fontSize: 16,
    lineHeight: 24,
    color: colors.body,
    textAlignVertical: 'top',
  },
  noteHint: { marginTop: 8, fontFamily: font.regular, fontSize: 11.5, color: colors.faint },
  fillLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  fillText: { fontFamily: font.regular, fontSize: 15, lineHeight: 26, color: colors.body },
  fillInput: {
    minWidth: 64,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    backgroundColor: '#F0F6FD',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 0,
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.primary,
  },
});
