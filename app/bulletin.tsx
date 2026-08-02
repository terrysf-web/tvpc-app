import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, FileText, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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

/** 날짜 칩으로 바로 보여줄 최근 주보 수 — 나머지는 '지난 주보' 목록으로 */
const RECENT_CHIPS = 8;

/** 지난 주보 목록을 '2026년 7월'처럼 달별로 묶는다 */
function byMonth(dates: string[]): { key: string; label: string; days: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const d of dates) {
    const key = d.slice(0, 7);
    const list = groups.get(key);
    if (list) list.push(d);
    else groups.set(key, [d]);
  }
  return [...groups].map(([key, days]) => {
    const [y, m] = key.split('-').map(Number);
    return { key, label: `${y}년 ${m}월`, days };
  });
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
  // 지난 주보는 주소에 날짜를 담아 연다 — 그래야 뒤로가기가 홈이 아니라
  // 이번 주 주보 화면으로 돌아온다(브라우저 뒤로가기·화면 밀기 모두 동일).
  const params = useLocalSearchParams<{ d?: string }>();
  const selected = typeof params.d === 'string' && params.d ? params.d : null;
  const openDate = (date: string) => {
    if (date === selected) return;
    const to = { pathname: '/bulletin' as const, params: { d: date } };
    // 이미 지난 주보를 보고 있으면 기록을 쌓지 않고 갈아끼운다
    if (selected) router.replace(to);
    else router.push(to);
  };
  // 주일인데 오늘 주보가 아직 안 올라왔으면 지난 주보를 대신 보여주지 않는다 —
  // 지난주 내용을 오늘 것으로 오해하기 쉽기 때문. (날짜를 직접 고르면 볼 수 있다)
  const todayKey = new Date().toLocaleDateString('en-CA');
  const isSunday = new Date().getDay() === 0;
  const todayMissing = isSunday && !dates.includes(todayKey);
  const current = selected ?? (todayMissing ? null : (dates[0] ?? null));
  const { bulletin, loading: pagesLoading } = useBulletin(current);
  // 주보가 쌓여도 칩이 옆으로 끝없이 늘어나지 않게 — 최근 8주만 칩으로 두고
  // 그 이전 것은 '지난 주보' 목록에서 월별로 고른다.
  const [pickerOpen, setPickerOpen] = useState(false);
  const recentDates = dates.slice(0, RECENT_CHIPS);
  // 목록에서 고른 지난 주보도 칩으로 보이게 끼워 넣는다
  const chipDates =
    current && dates.includes(current) && !recentDates.includes(current)
      ? [...recentDates, current]
      : recentDates;
  const olderDates = dates.filter((d) => !chipDates.includes(d));
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
          {chipDates.map((d) => (
            <Pressable
              key={d}
              style={[styles.dateChip, d === current && styles.dateChipActive]}
              onPress={() => openDate(d)}
            >
              <Text style={[styles.dateChipText, d === current && styles.dateChipTextActive]}>
                {chipLabel(d)}
                {hasNote(d) ? ' ●' : ''}
              </Text>
            </Pressable>
          ))}
          {olderDates.length > 0 && (
            <Pressable style={styles.dateChip} onPress={() => setPickerOpen(true)}>
              <Text style={styles.dateChipText}>지난 주보 {olderDates.length}건 ▾</Text>
            </Pressable>
          )}
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

      {/* 지난 주보 목록 — 달별로 묶어 보여준다 */}
      {pickerOpen && (
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)} />
          <View style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.pickerHead}>
              <Text style={styles.pickerTitle}>지난 주보</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                <X size={20} color={colors.muted} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {byMonth(olderDates).map((g) => (
                <View key={g.key} style={styles.pickerGroup}>
                  <Text style={styles.pickerMonth}>{g.label}</Text>
                  {g.days.map((d) => (
                    <Pressable
                      key={d}
                      style={styles.pickerRow}
                      onPress={() => {
                        setPickerOpen(false);
                        openDate(d);
                      }}
                    >
                      <Text style={styles.pickerRowText}>
                        {Number(d.slice(8, 10))}일 주보
                        {hasNote(d) ? '  ● 메모' : ''}
                      </Text>
                      <ChevronRight size={17} color={colors.faint2} strokeWidth={1.9} />
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  pickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12, 26, 46, 0.4)',
  },
  pickerSheet: {
    maxHeight: '72%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  pickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pickerTitle: { fontFamily: font.extraBold, fontSize: 17, color: colors.title },
  pickerList: { marginTop: 4 },
  pickerGroup: { marginBottom: 14 },
  pickerMonth: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.muted2,
    marginBottom: 6,
    marginTop: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    marginBottom: 6,
  },
  pickerRowText: { fontFamily: font.medium, fontSize: 15, color: colors.body },

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

  // 아래 주보 내용이 길면 이 줄이 함께 눌려 칩이 잘린다 — 줄어들지 않게 고정
  dateBar: { flexGrow: 0, flexShrink: 0, backgroundColor: colors.card },
  dateBarContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 8 },
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
});
