import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  FileText,
  ListChecks,
  Megaphone,
  Users,
  Wallet,
  X,
} from 'lucide-react-native';
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
import { churchInfo } from '../src/churchInfo';
import type { Bulletin } from '../src/data/bulletin';
import { useBulletin, useBulletinDates } from '../src/data/bulletin';
import { useEvents, useNews } from '../src/data/hooks';
import { useServices } from '../src/data/services';
import { firebaseEnabled } from '../src/firebase';
import { openExternal, openLiveWorship } from '../src/links';
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

/** 다가오는 일정 정렬용 — 실제 날짜(YYYY-MM-DD)가 있으면 그걸, 없으면 라벨에서 짐작 */
function eventSortKey(dateLabel: string, sortKey?: string): string {
  if (sortKey && /^\d{4}-\d{2}-\d{2}$/.test(sortKey)) return sortKey;
  const m = dateLabel.match(/(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) return '9999-99-99';
  return `9999-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function SectionTitle({
  icon,
  tint,
  title,
  count,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  count?: string;
}) {
  return (
    <View style={styles.cardTitleRow}>
      <View style={styles.cardTitleWrap}>
        <View style={[styles.iconChipSm, { backgroundColor: tint }]}>{icon}</View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {count ? <Text style={styles.cardCount}>{count}</Text> : null}
    </View>
  );
}

/**
 * 주보 PDF에서 자동 추출한 내용을 텍스트 카드로 보여준다 — 스캔 이미지를 확대해
 * 읽는 대신, 예배 순서·공지·헌금 등을 한 번의 스크롤로 볼 수 있게 정리한 화면.
 * 추출에 실패한 항목은 그냥 비어 있으므로(빈 배열/undefined) 각 카드는 내용이
 * 있을 때만 나타난다.
 */
function BulletinCards({ bulletin }: { bulletin: Bulletin }) {
  const router = useRouter();
  const { events } = useEvents();
  const { services } = useServices();
  const [noticesOpen, setNoticesOpen] = useState(false);

  const order = bulletin.order ?? [];
  const notices = bulletin.notices ?? [];
  const offering = bulletin.offering ?? null;
  const duty = bulletin.duty ?? [];
  const staff = bulletin.staff ?? [];
  const visibleNotices = noticesOpen ? notices : notices.slice(0, 4);

  const upcoming = events
    .filter((e) => eventSortKey(e.dateLabel, e.sortKey) >= bulletin.date)
    .sort((a, b) =>
      eventSortKey(a.dateLabel, a.sortKey) < eventSortKey(b.dateLabel, b.sortKey) ? -1 : 1,
    )
    .slice(0, 6);

  const hasCommunion = order.some((o) => o.name === '성찬식');
  // 1부·2부 순서가 서로 다른 앞부분(성도의 교제~경배와 기도)과, 그 이후 공통 순서를 나눠 보여준다
  const boundaryIdx = order.findIndex((o) => o.name === '성찬식' || o.name === '성경봉독');
  const varyOrder = boundaryIdx > 0 ? order.slice(0, boundaryIdx) : [];
  const sharedOrder = boundaryIdx > 0 ? order.slice(boundaryIdx) : order;

  return (
    <>
      {bulletin.sermon ? (
        <View style={[styles.heroCard, shadows.hero]}>
          <Text style={styles.heroEyebrow}>
            {fmtKo(bulletin.date)}
            {hasCommunion ? ' · 성찬식' : ''}
          </Text>
          {bulletin.sermon.title ? <Text style={styles.heroTitle}>{bulletin.sermon.title}</Text> : null}
          <Text style={styles.heroMeta}>
            {[bulletin.sermon.scripture, bulletin.sermon.preacher].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}

      {order.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<ListChecks size={13} color={colors.tagBlueText} strokeWidth={2} />}
            tint={colors.tagBlueBg}
            title="예배 순서"
          />
          {varyOrder.length > 0 && (
            <View style={styles.orderVaryTable}>
              <View style={styles.orderVaryHeaderRow}>
                <View style={styles.orderVaryLabelCol} />
                <Text style={styles.orderVaryHeadCell}>이른 비{'\n'}(1부 8:50AM)</Text>
                <Text style={styles.orderVaryHeadCell}>큰 비{'\n'}(2부 11:00AM)</Text>
              </View>
              {varyOrder.map((item, i) => {
                const c1 = item.service1 || item.service2 || item.shared || '—';
                const c2 = item.service2 || item.service1 || item.shared || '—';
                return (
                  <View key={i} style={styles.orderVaryRow}>
                    <Text style={styles.orderVaryName}>{item.name}</Text>
                    <Text style={styles.orderVaryCell}>{c1}</Text>
                    <Text style={styles.orderVaryCell}>{c2}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {varyOrder.some((item) => `${item.service1 ?? ''}${item.service2 ?? ''}${item.shared ?? ''}`.includes('*')) && (
            <Text style={styles.orderFootnote}>* 표는 일어서 주시기 바랍니다.</Text>
          )}
          {sharedOrder.map((item, i) => (
            <View key={i} style={[styles.orderRow, i === sharedOrder.length - 1 && styles.rowLast]}>
              <Text style={styles.orderName}>{item.name}</Text>
              <Text style={styles.orderDetail}>{item.shared || '다같이'}</Text>
            </View>
          ))}
        </View>
      )}

      {notices.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<Megaphone size={13} color={colors.tagOrangeText} strokeWidth={2} />}
            tint={colors.tagOrangeBg}
            title="교회 소식"
            count={`${notices.length}건`}
          />
          {visibleNotices.map((n, i) => (
            <View key={i} style={[styles.noticeRow, i === visibleNotices.length - 1 && styles.rowLast]}>
              <Text style={styles.noticeTitle}>
                {i + 1}. {n.title}
              </Text>
              <Text style={styles.noticeBody}>{n.body}</Text>
            </View>
          ))}
          {notices.length > 4 && (
            <Pressable style={styles.morePill} onPress={() => setNoticesOpen((v) => !v)}>
              <Text style={styles.morePillText}>
                {noticesOpen ? '접기' : `+${notices.length - 4}건 더보기`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {offering && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<Wallet size={13} color={colors.tagGreenText} strokeWidth={2} />}
            tint={colors.tagGreenBg}
            title="지난주일 헌금"
          />
          <View style={styles.giveHeaderRow}>
            <Text style={[styles.giveCell, styles.giveHeadCell, styles.giveLabelCol]}>구분</Text>
            {offering.columns.map((c, ci) => (
              <Text key={ci} style={[styles.giveCell, styles.giveHeadCell]}>
                {c}
              </Text>
            ))}
          </View>
          {offering.rows.map((r, ri) => (
            <View key={ri} style={styles.giveRow}>
              <Text style={[styles.giveCell, styles.giveRowLabel, styles.giveLabelCol]}>{r.label}</Text>
              {r.values.map((v, vi) => (
                <Text key={vi} style={styles.giveCell}>
                  {v}
                </Text>
              ))}
            </View>
          ))}
          {offering.total ? (
            <View style={styles.giveTotalRow}>
              <Text style={styles.giveTotalLabel}>합계</Text>
              <Text style={styles.giveTotalValue}>${offering.total}</Text>
            </View>
          ) : null}
        </View>
      )}

      {duty.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<Users size={13} color={colors.tagBlueText} strokeWidth={2} />}
            tint={colors.tagBlueBg}
            title="예배위원 안내"
          />
          {duty.map((t, ti) => (
            <View key={ti} style={ti > 0 ? styles.dutyTableGap : undefined}>
              <Text style={styles.dutyTableTitle}>{t.title}</Text>
              <View style={styles.dutyHeaderRow}>
                <Text style={[styles.dutyCell, styles.dutyHeadCell, styles.dutyLabelCol]}>구분</Text>
                {t.columns.map((c, ci) => (
                  <Text key={ci} style={[styles.dutyCell, styles.dutyHeadCell]}>
                    {c}
                  </Text>
                ))}
              </View>
              {t.rows.map((r, ri) => (
                <View key={ri} style={styles.dutyRow}>
                  <Text style={[styles.dutyCell, styles.dutyRowLabel, styles.dutyLabelCol]}>{r.label}</Text>
                  {r.values.map((v, vi) => (
                    <Text key={vi} style={styles.dutyCell}>
                      {v || '–'}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {upcoming.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<CalendarDays size={13} color={colors.tagGreenText} strokeWidth={2} />}
            tint={colors.tagGreenBg}
            title="사역 캘린더"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
            {upcoming.map((e, i) => (
              <View key={i} style={styles.weekItem}>
                <Text style={styles.weekDate}>{e.dateLabel}</Text>
                <Text style={styles.weekTitle}>{e.title}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {services.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<Clock size={13} color={colors.tagGrayText} strokeWidth={2} />}
            tint={colors.tagGrayBg}
            title="예배시간 안내"
          />
          {services.map((s, i) => (
            <View key={i} style={[styles.serviceRow, i === services.length - 1 && styles.rowLast]}>
              <Text style={styles.serviceName}>{s.name}</Text>
              <Text style={styles.serviceTime}>{s.time}</Text>
            </View>
          ))}
        </View>
      )}

      {staff.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<Users size={13} color={colors.tagGrayText} strokeWidth={2} />}
            tint={colors.tagGrayBg}
            title="섬기는 사람들"
          />
          {staff.map((s, i) => (
            <View key={i} style={[styles.staffRow, i === staff.length - 1 && styles.rowLast]}>
              <Text style={styles.staffRole}>{s.role}</Text>
              <Text style={styles.staffNames}>{s.names}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.contentCard, shadows.card]}>
        <SectionTitle
          icon={<ChevronRight size={13} color={colors.tagBlueText} strokeWidth={2} />}
          tint={colors.tagBlueBg}
          title="바로가기"
        />
        <View style={styles.linkPillsWrap}>
          <Pressable style={styles.linkPill} onPress={openLiveWorship}>
            <Text style={styles.linkPillText}>온라인 예배</Text>
          </Pressable>
          <Pressable style={styles.linkPill} onPress={() => openExternal(churchInfo.pages.newcomerForm)}>
            <Text style={styles.linkPillText}>새가족 등록</Text>
          </Pressable>
          <Pressable style={styles.linkPill} onPress={() => router.push('/album')}>
            <Text style={styles.linkPillText}>교회 앨범</Text>
          </Pressable>
          <Pressable style={styles.linkPill} onPress={() => router.push('/word')}>
            <Text style={styles.linkPillText}>오늘의 말씀</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

export default function BulletinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { dates, testDates, loading: datesLoading } = useBulletinDates(firebaseEnabled);
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
  // 원본 이미지는 기본으로 접혀 있다 — 실제로 펼치기 전에는 무거운 페이지
  // 이미지를 받지 않아 카드형 내용이 훨씬 빨리 뜬다.
  const [showImages, setShowImages] = useState(false);
  const { bulletin, loading: metaLoading, pagesLoading } = useBulletin(current, showImages);
  // 예배 순서·설교 등 텍스트 내용을 뽑아낸 주보만 카드형으로 보여준다 —
  // 옛날 주보(추출 전)는 그대로 스캔 이미지로 보인다.
  const hasStructured = !!(bulletin?.order?.length || bulletin?.notices?.length || bulletin?.sermon);
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
  const loading = datesLoading || metaLoading;
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
      <OverlayHeader
        title={current ? `주보 · ${testDates.has(current) ? '테스트 주보' : fmtKo(current)}` : '주보'}
      />
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
                {testDates.has(d) ? '테스트 주보' : chipLabel(d)}
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
          {hasStructured ? <BulletinCards bulletin={bulletin} /> : null}

          {hasStructured ? (
            <Pressable style={styles.toggleImagesBtn} onPress={() => setShowImages((v) => !v)}>
              <Text style={styles.toggleImagesText}>원본 주보 이미지 {showImages ? '접기' : '보기'}</Text>
              {showImages ? (
                <ChevronUp size={16} color={colors.primary} strokeWidth={2.2} />
              ) : (
                <ChevronDown size={16} color={colors.primary} strokeWidth={2.2} />
              )}
            </Pressable>
          ) : null}

          {(!hasStructured || showImages) && pagesLoading && bulletin.pages.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />
          ) : null}

          {(!hasStructured || showImages) &&
            bulletin.pages.map((p, i) => (
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
                        {testDates.has(d) ? '테스트 주보' : `${Number(d.slice(8, 10))}일 주보`}
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

  // ── 카드형 주보 내용 ──
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 18,
    width: '100%',
  },
  heroEyebrow: { fontFamily: font.bold, fontSize: 11.5, color: 'rgba(255,255,255,0.85)' },
  heroTitle: {
    fontFamily: font.extraBold,
    fontSize: 17,
    lineHeight: 23,
    color: '#FFFFFF',
    marginTop: 8,
  },
  heroMeta: { fontFamily: font.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.88)', marginTop: 8 },

  contentCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  iconChipSm: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontFamily: font.extraBold, fontSize: 14, color: colors.title },
  cardCount: { fontFamily: font.medium, fontSize: 11.5, color: colors.faint2 },
  rowLast: { borderBottomWidth: 0 },

  orderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  orderName: { flex: 0.8, fontFamily: font.bold, fontSize: 13, color: colors.body },

  orderVaryTable: { marginBottom: 4, borderRadius: 10, overflow: 'hidden' },
  orderFootnote: {
    fontFamily: font.regular,
    fontSize: 10,
    color: colors.faint2,
    marginBottom: 4,
  },
  orderVaryHeaderRow: { flexDirection: 'row' },
  orderVaryLabelCol: { flex: 0.8 },
  orderVaryHeadCell: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 10.5,
    color: '#FFFFFF',
    backgroundColor: colors.primary,
    textAlign: 'center',
    paddingVertical: 6,
  },
  orderVaryRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingVertical: 6,
  },
  orderVaryName: {
    flex: 0.8,
    fontFamily: font.bold,
    fontSize: 11.5,
    color: colors.body,
    paddingRight: 4,
  },
  orderVaryCell: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 3,
  },
  orderDetail: {
    // 위 1부/2부 표의 두 칸(flex 1+1)을 합친 너비와 맞춰야, 그 두 칸 사이
    // 정가운데로 보인다 — 라벨 칸(0.8)은 그대로 두고 나머지만 2배로.
    flex: 2,
    fontFamily: font.medium,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 17,
  },

  noticeRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  noticeTitle: { fontFamily: font.bold, fontSize: 13, color: colors.body },
  noticeBody: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted, marginTop: 3, lineHeight: 18 },
  morePill: {
    marginTop: 4,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  morePillText: { fontFamily: font.bold, fontSize: 12.5, color: colors.primary },

  giveHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.divider },
  giveRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.divider },
  giveCell: {
    fontFamily: font.medium,
    fontSize: 10.5,
    color: colors.body,
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    textAlign: 'right',
  },
  giveLabelCol: { flex: 0.85, textAlign: 'left' },
  giveHeadCell: { fontFamily: font.bold, fontSize: 9.5, color: colors.faint2 },
  giveRowLabel: { fontFamily: font.bold, color: colors.muted2 },
  giveTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  giveTotalLabel: { fontFamily: font.bold, fontSize: 13, color: colors.title },
  giveTotalValue: { fontFamily: font.extraBold, fontSize: 16, color: colors.primary },

  dutyTableGap: { marginTop: 12 },
  dutyTableTitle: { fontFamily: font.extraBold, fontSize: 11, color: colors.primary, marginBottom: 5 },
  dutyHeaderRow: { flexDirection: 'row' },
  dutyRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.divider },
  dutyCell: {
    fontFamily: font.medium,
    fontSize: 9,
    lineHeight: 12,
    color: colors.body,
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 2,
    textAlign: 'center',
  },
  dutyLabelCol: { flex: 0.55, textAlign: 'left', paddingLeft: 4 },
  dutyHeadCell: {
    fontFamily: font.bold,
    fontSize: 8.5,
    lineHeight: 11,
    color: '#FFFFFF',
    backgroundColor: colors.primary,
  },
  dutyRowLabel: { fontFamily: font.bold, color: colors.muted2, backgroundColor: colors.screenBg },

  weekStrip: { gap: 8 },
  weekItem: { backgroundColor: colors.screenBg, borderRadius: 10, padding: 10, minWidth: 92 },
  weekDate: { fontFamily: font.bold, fontSize: 10.5, color: colors.faint2 },
  weekTitle: { fontFamily: font.bold, fontSize: 12, color: colors.body, marginTop: 3 },

  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 8,
  },
  serviceName: { fontFamily: font.bold, fontSize: 12.5, color: colors.body, flexShrink: 1 },
  serviceTime: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted },

  staffRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  staffRole: { fontFamily: font.bold, fontSize: 11.5, color: colors.faint2, width: 74, flexShrink: 0 },
  staffNames: { fontFamily: font.medium, fontSize: 12.5, color: colors.body, flex: 1, lineHeight: 18 },

  linkPillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkPill: {
    backgroundColor: colors.tagBlueBg,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  linkPillText: { fontFamily: font.bold, fontSize: 12, color: colors.primary },

  toggleImagesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    marginTop: 4,
  },
  toggleImagesText: { fontFamily: font.bold, fontSize: 13, color: colors.primary },

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
