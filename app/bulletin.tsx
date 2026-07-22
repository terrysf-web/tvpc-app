import { useRouter } from 'expo-router';
import { FileText, PenLine } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
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
function SermonNoteCard({ date }: { date: string }) {
  const key = `bulletinNote:${date}`;
  // 한글 조합(IME) 중에 React가 값을 입력창에 되써넣으면 글자가 흔들리며
  // 조합이 끊기므로, 입력창은 비제어(defaultValue)로 두고 저장만 디바운스한다.
  const [initial] = useState(() =>
    typeof window !== 'undefined' && window.localStorage
      ? (window.localStorage.getItem(key) ?? '')
      : '',
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (t: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, t);
        // 저장할 때마다 상태를 바꾸면 입력 중 카드가 재렌더되어 커서가
        // 흔들리므로, "자동 저장됨" 표시는 처음 한 번만 켠다
        setSavedAt((s) => s ?? Date.now());
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
        {savedAt ? <Text style={styles.noteSaved}>자동 저장됨</Text> : null}
      </View>
      {Platform.OS === 'web' ? (
        // 한글 조합(IME) 중 커서가 튀지 않도록 react-native-web TextInput 대신
        // 순수 <textarea> 사용 + 시스템 글꼴 고정 (조합 중 글자 폭 변화 방지)
        React.createElement('textarea', {
          defaultValue: initial,
          placeholder: '괄호 채우기와 은혜받은 말씀을 적어보세요.',
          autoComplete: 'off',
          autoCorrect: 'off',
          autoCapitalize: 'off',
          spellCheck: false,
          onInput: (e: { target: { value: string } }) => onChange(e.target.value),
          style: {
            minHeight: 130,
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
}

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
  const current = selected ?? dates[0] ?? null;
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
      {dates.length > 1 && (
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
                <SermonNoteCard key={bulletin.date} date={bulletin.date} />
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
});
