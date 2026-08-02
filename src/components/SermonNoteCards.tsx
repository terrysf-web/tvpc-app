import { PenLine } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, shadows } from '../theme';

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
export const SermonNoteCard = React.memo(function SermonNoteCard({ date }: { date: string }) {
  const key = `bulletinNote:${date}`;
  const [initial] = useState(() =>
    typeof window !== 'undefined' && window.localStorage
      ? (window.localStorage.getItem(key) ?? '')
      : '',
  );
  const hostRef = useRef<View | null>(null);

  // 웹: React를 입력 경로에서 완전히 배제한다 — textarea를 직접 만들어
  // 끼워 넣고 순수 DOM 이벤트로만 저장한다. React가 키 입력마다 개입해
  // 커서가 글 처음으로 튕기는 문제를 원천 차단 (일반 웹페이지의 메모장과
  // 100% 동일한 동작).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const ta = document.createElement('textarea');
    ta.value = initial;
    ta.placeholder = '괄호 채우기와 은혜받은 말씀을 적어보세요.';
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('spellcheck', 'false');
    Object.assign(ta.style, {
      minHeight: '130px',
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      resize: 'none',
      overflow: 'auto',
      borderRadius: '12px',
      background: colors.screenBg,
      padding: '12px 14px',
      fontSize: '16px',
      lineHeight: '24px',
      color: colors.body,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", sans-serif',
      webkitUserSelect: 'text',
      userSelect: 'text',
    });
    host.appendChild(ta);
    // 저장된 내용 전체가 보이게 첫 크기만 맞춘다
    if (ta.scrollHeight > ta.clientHeight + 2) ta.style.height = `${ta.scrollHeight + 2}px`;
    let t: ReturnType<typeof setTimeout> | null = null;
    let caretT: ReturnType<typeof setTimeout> | null = null;
    const onInput = () => {
      // 아이폰 사파리는 한글 조합 글자를 다시 그릴 때 커서를 한 글자 뒤로
      // 1프레임 그렸다 되돌린다(브라우저 엔진 동작, 앱 코드와 무관).
      // 타이핑하는 동안 커서를 잠깐 숨겨 그 깜빡임이 보이지 않게 하고,
      // 손을 멈추면(0.4초) 커서를 다시 보여준다.
      ta.style.caretColor = 'transparent';
      if (caretT) clearTimeout(caretT);
      caretT = setTimeout(() => {
        ta.style.caretColor = '';
      }, 400);
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try {
          window.localStorage.setItem(key, ta.value);
        } catch {
          /* 무시 */
        }
      }, 500);
    };
    const onBlur = () => {
      ta.style.caretColor = '';
      // 칸을 벗어난 뒤에만 내용 전체가 보이게 늘린다
      if (ta.scrollHeight > ta.clientHeight + 2) ta.style.height = `${ta.scrollHeight + 2}px`;
      try {
        window.localStorage.setItem(key, ta.value);
      } catch {
        /* 무시 */
      }
    };
    ta.addEventListener('input', onInput);
    ta.addEventListener('blur', onBlur);
    return () => {
      if (t) clearTimeout(t);
      if (caretT) clearTimeout(caretT);
      ta.removeEventListener('input', onInput);
      ta.removeEventListener('blur', onBlur);
      ta.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 네이티브 앱용 저장 (웹은 위 순수 DOM 경로 사용)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = (t: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, t);
      }
    }, 500);
  };

  return (
    <View style={[styles.noteCard, shadows.card]}>
      <View style={styles.noteHead}>
        <View style={styles.noteChip}>
          <PenLine size={16} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={styles.noteTitle}>설교 메모</Text>
        <Text style={styles.noteSaved}>자동 저장</Text>
      </View>
      {Platform.OS === 'web' ? (
        <View ref={hostRef} />
      ) : (
        <TextInput
          style={styles.noteInput}
          defaultValue={initial}
          onChangeText={onChange}
          multiline
          placeholder={'괄호 채우기와 은혜받은 말씀을 적어보세요.\n예) 1. 온전한 그리스도인은 (        ) 사람입니다.'}
          placeholderTextColor={colors.faint}
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
        />
      )}
      <Text style={styles.noteHint}>메모는 이 전화기에만 저장됩니다. 주보 날짜별로 따로 보관돼요.</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  noteCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
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
    minHeight: 130,
    textAlignVertical: 'top',
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.regular,
    // iOS 사파리는 16px 미만 입력창에서 화면을 확대하므로 16 유지
    fontSize: 16,
    lineHeight: 24,
    color: colors.body,
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
