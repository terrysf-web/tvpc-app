import { useRouter } from 'expo-router';
import { FileText, PenLine } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useBulletin, useBulletinDates } from '../src/data/bulletin';
import { useNews } from '../src/data/hooks';
import { firebaseEnabled } from '../src/firebase';
import { colors, font, shadows } from '../src/theme';

function fmtKo(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/**
 * 설교 메모 — 주보의 괄호 채우기·나눔 질문 답을 전화기에 적어두는 카드.
 * 내용은 이 기기(localStorage)에만 저장되고 서버로 가지 않는다.
 */
/**
 * 괄호 채우기 — 주보 설교 노트의 빈칸 문장을 그대로 깔아주고,
 * 괄호 자리만 입력칸으로 만든다. 문장 글자는 지워지지 않고,
 * 입력칸은 쓰는 글자 수에 따라 옆으로 늘어난다.
 * 답은 이 기기(localStorage)에만 날짜별로 저장된다.
 */
const FillInCard = React.memo(function FillInCard({
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

  // 한글 조합(IME) 중 칸 폭을 바꾸면 조합이 끊기고, 글자마다 폭을 바꾸면
  // 커서가 흔들린다 — 입력을 잠깐 멈췄을 때와 칸을 벗어날 때만 폭을 맞춘다.
  const composingBlank = useRef(false);
  const lastBlank = useRef<HTMLInputElement | null>(null);
  const fit = () => {
    const el = lastBlank.current;
    if (el && !composingBlank.current) {
      el.style.width = `${Math.max(4, el.value.length + 2)}ch`;
    }
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
            el.style.width = `${Math.max(4, (vals.current[id] ?? '').length + 2)}ch`;
          }
        },
        onCompositionStart: () => {
          composingBlank.current = true;
        },
        onCompositionEnd: () => {
          composingBlank.current = false;
        },
        onBlur: (e: { target: HTMLInputElement }) => {
          lastBlank.current = e.target;
          fit();
        },
        onInput: (e: { target: HTMLInputElement }) => {
          const el = e.target;
          lastBlank.current = el;
          vals.current[id] = el.value;
          save();
        },
        style: {
          display: 'inline-block',
          width: '4ch',
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

const SermonNoteCard = React.memo(function SermonNoteCard({ date }: { date: string }) {
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

/**
 * 주보 뷰어 — 관리자가 올린 페이지 이미지를 전화기 화면 폭에 맞춰 한 장씩 보여준다.
 * 인쇄물 QR 코드(app.tvpc.church/bulletin)로 누구나 열 수 있는 공개 화면.
 * 아직 이미지 주보가 없으면 홈페이지 주보 게시글로 안내한다.
 */
/** 이 기기에 해당 날짜 메모가 저장돼 있는지 */
function hasNote(date: string): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.localStorage &&
    !!window.localStorage.getItem(`bulletinNote:${date}`)
  );
}

function chipLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return y === new Date().getFullYear() ? `${m}월 ${d}일` : `${y}. ${m}. ${d}.`;
}

export default function BulletinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { dates, loading: datesLoading } = useBulletinDates(firebaseEnabled);
  const [selected, setSelected] = useState<string | null>(null);
  // 주일인데 오늘 주보가 아직 안 올라왔으면 지난 주보를 대신 보여주지 않는다 —
  // 지난주 내용을 오늘 것으로 오해하기 쉽기 때문. (날짜를 직접 고르면 볼 수 있다)
  const todayKey = new Date().toLocaleDateString('en-CA');
  const isSunday = new Date().getDay() === 0;
  const todayMissing = isSunday && !dates.includes(todayKey);
  const current = selected ?? (todayMissing ? null : (dates[0] ?? null));
  const { bulletin, loading: pagesLoading } = useBulletin(current);
  const loading = datesLoading || pagesLoading;
  const { news } = useNews();

  // 홈페이지의 주보 게시글(이미지 주보가 없을 때의 대안)
  const webBulletin = news.find((n) => n.title.startsWith('주보') && n.url);
  const openWeb = () => {
    if (webBulletin?.url) {
      router.push({ pathname: '/browser', params: { url: webBulletin.url, t: webBulletin.title } });
    } else {
      router.push('/news');
    }
  };

  const pageWidth = Math.min(width, 520) - 24;

  return (
    <View style={styles.screen}>
      <OverlayHeader title={current ? `주보 · ${fmtKo(current)}` : '주보'} />
      {/* 지난 주보 날짜 선택 — 날짜별 메모(●)도 함께 열린다 */}
      {(dates.length > 1 || todayMissing) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dateBar}
          contentContainerStyle={styles.dateBarContent}
        >
          {dates.map((d) => (
            <Pressable
              key={d}
              style={[styles.dateChip, d === current && styles.dateChipActive]}
              onPress={() => setSelected(d)}
            >
              <Text style={[styles.dateChipText, d === current && styles.dateChipTextActive]}>
                {chipLabel(d)}
                {hasNote(d) ? ' ●' : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : todayMissing && !selected ? (
        <View style={styles.waitingWrap}>
          <Text style={styles.waitingTitle}>이번 주 주보는 준비 중입니다</Text>
          <Text style={styles.waitingText}>
            주보가 교회 홈페이지에 올라오면 앱에 자동으로 들어옵니다.{'\n'}
            지난 주보는 위의 날짜를 눌러 보실 수 있습니다.
          </Text>
        </View>
      ) : bulletin ? (
        <ScrollView
          contentContainerStyle={[styles.pages, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {bulletin.pages.map((p, i) => (
            <React.Fragment key={i}>
              <View style={[styles.pageWrap, shadows.card]}>
                <Image
                  source={{ uri: p.image }}
                  style={{ width: pageWidth, height: pageWidth * (p.h / p.w), borderRadius: 10 }}
                  resizeMode="contain"
                />
                <Text style={styles.pageNum}>
                  {i + 1} / {bulletin.pages.length}
                </Text>
              </View>
              {/* 설교 메모는 괄호 채우기가 있는 3면 바로 아래에.
                  key로 날짜가 바뀌면 새로 만들어 그 날짜의 저장 메모를 불러온다 */}
              {i === Math.min(2, bulletin.pages.length - 1) && (
                <React.Fragment key={`note-${bulletin.date}`}>
                  {(bulletin.noteLines?.length ?? 0) > 0 && (
                    <FillInCard date={bulletin.date} lines={bulletin.noteLines!} />
                  )}
                  <SermonNoteCard date={bulletin.date} />
                </React.Fragment>
              )}
            </React.Fragment>
          ))}
          {webBulletin?.url ? (
            <Pressable style={styles.webLink} onPress={openWeb}>
              <Text style={styles.webLinkText}>홈페이지에서 원본 보기 ›</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.pages}>
          <View style={[styles.card, shadows.card]}>
            <View style={styles.iconChip}>
              <FileText size={22} color={colors.primary} strokeWidth={1.9} />
            </View>
            <Text style={styles.cardTitle}>아직 등록된 주보가 없습니다</Text>
            <Text style={styles.cardSub}>
              관리자 화면의 "주보" 탭에서 주보 PDF를 올리면 여기에 표시됩니다.
            </Text>
            {webBulletin?.url ? (
              <Pressable style={styles.primaryBtn} onPress={openWeb}>
                <Text style={styles.primaryBtnText}>홈페이지 주보 보기</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  waitingWrap: { alignItems: 'center', paddingHorizontal: 32, marginTop: 70 },
  waitingTitle: {
    fontFamily: font.extraBold,
    fontSize: 16.5,
    color: colors.title,
    marginBottom: 10,
    textAlign: 'center',
  },
  waitingText: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  screen: { flex: 1, backgroundColor: colors.screenBg },
  pages: { padding: 12, gap: 14, alignItems: 'center' },
  pageWrap: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pageNum: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    fontFamily: font.medium,
    fontSize: 11,
    color: '#FFFFFF',
    backgroundColor: 'rgba(20,30,45,0.55)',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  webLink: { padding: 10 },
  webLinkText: { fontFamily: font.medium, fontSize: 13, color: colors.primary },

  dateBar: { flexGrow: 0, backgroundColor: colors.card },
  dateBarContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  dateChip: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.screenBg,
  },
  dateChipActive: { backgroundColor: colors.primary },
  dateChipText: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  dateChipTextActive: { color: '#FFFFFF', fontFamily: font.bold },

  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 24,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontFamily: font.extraBold, fontSize: 16, color: colors.title },
  cardSub: {
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 14.5, color: '#FFFFFF' },

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
