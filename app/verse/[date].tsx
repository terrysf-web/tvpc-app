import { useLocalSearchParams, useRouter } from 'expo-router';
import Bookmark from 'lucide-react-native/dist/esm/icons/bookmark.mjs';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { OverlayHeader } from '../../src/components/OverlayHeader';
import { FillInCard, ShareQuestionsCard } from '../../src/components/SermonNoteCards';
import { hasVerseNote, VerseNoteCard } from '../../src/components/VerseNoteCard';
import { scriptureRefEn } from '../../src/data/bibleEn';
import {
  useBulletinNoteLines,
  useBulletinScriptures,
  useBulletinShareQuestions,
} from '../../src/data/bulletin';
import { isVerseSaved, toggleSavedVerse } from '../../src/data/savedVerses';
import { getHighlights, toggleHighlight, type VerseHighlight } from '../../src/data/verseMarks';
import { ensureAnonymousAuth, getDb } from '../../src/firebase';
import { colors, font, radius, shadows } from '../../src/theme';
import type { VerseDoc } from '../../src/types';

function dateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}

function dateLabelEn(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' });
}

/** 참조 문자열끼리 비교용 — 공백만 지우고 비교한다("느헤미야 8:10-12" ↔
 * "느헤미야  8:10-12" 같은 사소한 공백 차이는 같은 본문으로 본다). */
const normRef = (s: string) => s.replace(/\s+/g, '');

/** 저장한 말씀에서 열어 보는 지난 날짜의 말씀 전체 보기 */
export default function VerseByDateScreen() {
  const { date, lang } = useLocalSearchParams<{ date: string; lang?: string }>();
  const router = useRouter();
  const [verse, setVerse] = useState<VerseDoc | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showFull, setShowFull] = useState(false);
  // 야외예배 등 English 탭이 있는 주보의 "설교 메모" 버튼에서 넘어올 때만
  // ?lang=en으로 온다 — 그 주는 성경 본문 자체가 병기 인쇄돼 있어(주보
  // scriptures[].textEn) 진짜 영문 본문을 보여줄 수 있다. 그 외 보통
  // 주일(새벽예배 본문 등)은 개역 한글 성경만 있어 이 화면 자체가 영어
  // 모드로 오지 않는다.
  const isEn = lang === 'en';
  // 이 화면은 항상 "그 날짜 하나"만 다룬다 — 오늘이 며칠이든 상관없이, 주일
  // 주보의 성경봉독이면 그 주보의 괄호 채우기·나눔 질문을 그대로 함께 보여준다.
  // (요일별 새벽 본문에는 이 문서가 아예 없어 자연히 빈 배열로 안 나온다.)
  const { noteLines } = useBulletinNoteLines(date ?? null);
  const { shareQuestions } = useBulletinShareQuestions(date ?? null);
  const { scriptures } = useBulletinScriptures(isEn ? (date ?? null) : null);
  const matchedScripture = verse
    ? (scriptures.find((s) => normRef(s.reference) === normRef(verse.reference)) ?? null)
    : null;
  // 병기 본문을 못 찾으면(참조 표기가 살짝 다르거나, 그 주 주보에 본문
  // 전체가 인쇄돼 있지 않으면) 한글 본문이라도 보여준다 — 빈 화면보다 낫다.
  const enPassage = matchedScripture?.textEn ?? null;

  useEffect(() => {
    if (!date) return;
    let on = true;
    isVerseSaved(date).then((s) => on && setSaved(s));
    (async () => {
      try {
        const db = getDb();
        if (!db) {
          setFailed(true);
          return;
        }
        await ensureAnonymousAuth();
        const snap = await getDoc(doc(db, 'verses', date));
        if (!on) return;
        if (!snap.exists()) {
          setFailed(true);
          return;
        }
        setVerse({ ...(snap.data() as Omit<VerseDoc, 'id'>), id: snap.id });
      } catch {
        if (on) setFailed(true);
      }
    })();
    return () => {
      on = false;
    };
  }, [date]);

  // 이 날짜에 형광펜으로 표시해 둔 구절 (기기 저장)
  // 이 날짜에 형광펜으로 표시해 둔 구절 — 메모장 안에 고정으로 보여준다
  const [hls, setHls] = useState<VerseHighlight[]>([]);
  useEffect(() => {
    if (date) setHls(getHighlights(date));
  }, [date]);
  const hlSet = new Set(hls.map((h) => h.v));

  // 메모 카드(memo)가 재렌더에서 격리되도록 콜백 참조를 고정한다
  const onQuoteRemoved = React.useCallback(
    (v: number) => {
      if (date) setHls(toggleHighlight(date, v, ''));
    },
    [date],
  );
  const onNoteAutoSaved = React.useCallback(() => setSaved(true), []);

  // 북마크 해제 시 메모·형광펜이 있으면 실수로 잃지 않게 한 번 더 확인
  const onToggleSaved = () => {
    if (!verse) return;
    const entry = { date: verse.date, reference: verse.reference, heroText: verse.heroText };
    if (saved && (hls.length > 0 || hasVerseNote(verse.date))) {
      const msg = `${verse.reference} 말씀의 저장을 해제할까요?\n적어둔 메모와 형광펜 표시도 함께 지워집니다.`;
      const doRemove = () => {
        toggleSavedVerse(entry).then(() => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.removeItem(`bulletinNote:${verse.date}`);
              window.localStorage.removeItem(`verseNote:${verse.date}`);
              window.localStorage.removeItem(`verseHl:${verse.date}`);
            }
          } catch {
            /* 무시 */
          }
          router.back();
        });
      };
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm(msg)) doRemove();
      } else {
        Alert.alert('저장 해제', msg, [
          { text: '취소', style: 'cancel' },
          { text: '해제', style: 'destructive', onPress: doRemove },
        ]);
      }
      return;
    }
    toggleSavedVerse(entry).then(setSaved);
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader
        title={verse ? (isEn ? scriptureRefEn(verse.reference) : verse.reference) : isEn ? 'Scripture' : '말씀'}
        right={
          verse ? (
            <Pressable onPress={onToggleSaved} hitSlop={8}>
              <Bookmark
                size={20}
                color={saved ? colors.primary : colors.muted3}
                fill={saved ? colors.primary : 'transparent'}
                strokeWidth={1.9}
              />
            </Pressable>
          ) : undefined
        }
      />
      {!verse && !failed && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      {failed && (
        <View style={styles.center}>
          <Text style={styles.failText}>
            {isEn
              ? 'Could not load this passage.\nPlease check your network connection.'
              : '말씀을 불러오지 못했습니다.\n네트워크 연결을 확인해 주세요.'}
          </Text>
        </View>
      )}
      {verse && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.headCard, shadows.card]}>
            <Text style={styles.headTitle}>
              {isEn ? scriptureRefEn(verse.reference) : verse.passageTitle}
            </Text>
            <Text style={styles.headDate}>{isEn ? dateLabelEn(verse.date) : dateLabel(verse.date)}</Text>
            {/* 번역본 표기("개역개정판" 등)는 한글 성경 고유의 표기라 English 모드에선 생략 */}
            {!isEn && verse.source === 'auto' && (
              <Text style={styles.versionTag}>
                {verse.translation === 'gae' ? '성경전서 개역개정판' : '성경전서 개역한글판'}
              </Text>
            )}
          </View>

          {/* 주일 주보의 성경봉독이면 그 주보의 괄호 채우기·나눔 질문도 함께 —
              단, 이 내용 자체는 관리자가 한글로만 써 두므로 English 모드에서도
              한글 그대로 보여준다(제목만 영어로). */}
          {noteLines.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{isEn ? 'Fill in the Blank' : '괄호 채우기'}</Text>
              <FillInCard date={verse.date} lines={noteLines} />
            </>
          )}

          {/* 저장한 말씀에는 형광펜 구절 + 메모만 — 장 전체는 원할 때만 펼친다 */}
          <Text style={styles.sectionTitle}>{isEn ? 'Notes' : '메모'}</Text>
          <VerseNoteCard
            key={verse.date}
            date={verse.date}
            reference={verse.reference}
            heroText={verse.heroText}
            onQuoteRemoved={onQuoteRemoved}
            onAutoSaved={onNoteAutoSaved}
          />

          {shareQuestions.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{isEn ? 'Discussion Questions' : '나눔 질문'}</Text>
              <ShareQuestionsCard date={verse.date} questions={shareQuestions} />
            </>
          )}

          {/* English 모드는 절 단위 형광펜이 없는 병기 본문 전체를 그대로
              보여주므로, 펼치기/접기 토글 자체가 필요 없다. */}
          {!isEn && hls.length > 0 && (
            <Pressable style={styles.fullToggle} onPress={() => setShowFull((s) => !s)}>
              <Text style={styles.fullToggleText}>
                {showFull ? '전체 본문 접기 ▲' : '전체 본문 보기 ▼'}
              </Text>
            </Pressable>
          )}
          {(isEn || showFull || hls.length === 0) && (
            <>
              <Text style={styles.sectionTitle}>{isEn ? 'Passage' : '본문'}</Text>
              <View style={[styles.sectionCard, shadows.card]}>
                {isEn && enPassage ? (
                  <Text style={styles.verseText}>{enPassage}</Text>
                ) : (
                  verse.passage.map((p) => (
                    <View
                      key={p.verse}
                      style={[styles.verseRow, hlSet.has(p.verse) && styles.verseRowHl]}
                    >
                      <Text style={styles.verseNum}>{p.verse}</Text>
                      <Text style={styles.verseText}>{p.text}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failText: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted3,
    textAlign: 'center',
  },
  content: { padding: 16, paddingBottom: 40 },
  headCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 6,
  },
  headTitle: { fontFamily: font.bold, fontSize: 16.5, color: colors.title },
  headDate: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted3, marginTop: 3 },
  versionTag: { fontFamily: font.medium, fontSize: 11, color: '#5B7BA6', marginTop: 4 },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 14,
    color: colors.title,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    gap: 10,
  },
  verseRow: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginHorizontal: -6,
  },
  verseRowHl: { backgroundColor: '#FFF3BF' },
  fullToggle: { alignSelf: 'center', marginTop: 18, paddingVertical: 8, paddingHorizontal: 16 },
  fullToggleText: { fontFamily: font.bold, fontSize: 13, color: colors.primary },
  verseNum: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.primary,
    minWidth: 18,
    lineHeight: 23,
  },
  verseText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 23,
    color: colors.body,
  },
  paragraph: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 24, color: colors.body },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.body,
  },
});
