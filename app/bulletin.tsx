import { useLocalSearchParams, useRouter } from 'expo-router';
import BookOpen from 'lucide-react-native/dist/esm/icons/book-open.mjs';
import CalendarDays from 'lucide-react-native/dist/esm/icons/calendar-days.mjs';
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down.mjs';
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right.mjs';
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up.mjs';
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check.mjs';
import Clock from 'lucide-react-native/dist/esm/icons/clock.mjs';
import Cloud from 'lucide-react-native/dist/esm/icons/cloud.mjs';
import FileText from 'lucide-react-native/dist/esm/icons/file-text.mjs';
import Gift from 'lucide-react-native/dist/esm/icons/gift.mjs';
import Hand from 'lucide-react-native/dist/esm/icons/hand.mjs';
import ImageIcon from 'lucide-react-native/dist/esm/icons/image.mjs';
import ListChecks from 'lucide-react-native/dist/esm/icons/list-checks.mjs';
import Mail from 'lucide-react-native/dist/esm/icons/mail.mjs';
import Megaphone from 'lucide-react-native/dist/esm/icons/megaphone.mjs';
import Mic from 'lucide-react-native/dist/esm/icons/mic.mjs';
import Music from 'lucide-react-native/dist/esm/icons/music.mjs';
import Play from 'lucide-react-native/dist/esm/icons/play.mjs';
import Sun from 'lucide-react-native/dist/esm/icons/sun.mjs';
import Users from 'lucide-react-native/dist/esm/icons/users.mjs';
import Wallet from 'lucide-react-native/dist/esm/icons/wallet.mjs';
import Wine from 'lucide-react-native/dist/esm/icons/wine.mjs';
import X from 'lucide-react-native/dist/esm/icons/x.mjs';
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
import type { Bulletin, BulletinDutyTable, BulletinReading } from '../src/data/bulletin';
import { useBulletin, useBulletinDates, useLatestBulletinDate } from '../src/data/bulletin';
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

/** 히어로 카드 배경(hero-sunday-bg-v3.jpg) 가로:세로 비율 — 원본 그림 그대로라 잘리지 않는다 */
const HERO_ASPECT = 1920 / 1080;

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

/** "이사야 42장"을 "이사야\n42장"으로 — 화면 폭에 따라 아무 데서나 줄바꿈되지 않고
 * 책 이름과 장 번호가 항상 각자 한 줄에 오게 한다. */
function twoLinePassage(s: string): string {
  return s.replace(/\s+/, '\n');
}

/** "8월 2일" 같은 표기를 오늘 기준 실제 날짜(YYYY-MM-DD)로 — 예배위원 표에서 지난 주를 거른다 */
function monthDayKey(label: string): string | null {
  const m = label.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) return null;
  const now = new Date();
  let yy = now.getFullYear();
  const cand = new Date(yy, Number(m[1]) - 1, Number(m[2]));
  if (cand.getTime() < now.getTime() - 180 * 86400e3) yy += 1;
  return `${yy}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** 예배위원 표에서 이미 지난 주(오늘 이전) 칸은 뺀다 */
function futureDutyTable(t: BulletinDutyTable, todayKey: string): BulletinDutyTable {
  const keep = t.columns.map((c, i) => {
    const k = monthDayKey(c);
    return !k || k >= todayKey;
  });
  if (keep.every(Boolean)) return t;
  return {
    title: t.title,
    columns: t.columns.filter((_, i) => keep[i]),
    rows: t.rows.map((r) => ({ label: r.label, values: r.values.filter((_, i) => keep[i]) })),
  };
}

/** 예배 순서 항목별 아이콘 — 못 찾으면 원(Circle) 자리만 비워둔다 */
const ORDER_ICONS: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth: number }>> = {
  '성도의 교제': Users,
  '예배의 부름': Mail,
  '경배와 기도': Music,
  성찬식: Wine,
  성경봉독: BookOpen,
  설교: Mic,
  '결단의 찬양': Music,
  봉헌: Gift,
  축도: Hand,
};

function OrderIcon({ name }: { name: string }) {
  const Icon = ORDER_ICONS[name];
  return (
    <View style={styles.orderIconChip}>
      {Icon ? <Icon size={14} color={colors.primary} strokeWidth={2} /> : null}
    </View>
  );
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

  const [svcTab, setSvcTab] = useState<'1' | '2'>('1');
  // 히어로 카드 배경 그림 위 배지·버튼이 %로 위치를 잡는데, RN(web)에서
  // aspectRatio만으로 정해진 높이는 절대위치 자식의 %가 잘못 계산되는
  // 경우가 있어 — 실제 렌더된 폭을 재서 높이를 직접 픽셀로 계산해 넘긴다.
  const [heroWidth, setHeroWidth] = useState(0);
  const heroHeight = heroWidth > 0 ? heroWidth / HERO_ASPECT : undefined;
  const order = bulletin.order ?? [];
  const notices = bulletin.notices ?? [];
  const offering = bulletin.offering ?? null;
  const todayKey = new Date().toLocaleDateString('en-CA');
  const duty = (bulletin.duty ?? [])
    .map((t) => futureDutyTable(t, todayKey))
    .filter((t) => t.columns.length > 0);
  const staff = bulletin.staff ?? [];
  const dawnReadings: BulletinReading[] = bulletin.dawnReadings ?? [];
  const fridayReading = bulletin.fridayReading ?? null;
  const visibleNotices = noticesOpen ? notices : notices.slice(0, 4);

  const upcoming = events
    .filter((e) => eventSortKey(e.dateLabel, e.sortKey) >= bulletin.date)
    .sort((a, b) =>
      eventSortKey(a.dateLabel, a.sortKey) < eventSortKey(b.dateLabel, b.sortKey) ? -1 : 1,
    )
    .slice(0, 6);

  const hasCommunion = order.some((o) => o.name === '성찬식');
  const hasAsterisk = order.some(
    (item) => `${item.service1 ?? ''}${item.service2 ?? ''}${item.shared ?? ''}`.includes('*'),
  );
  const svcDetail = (item: (typeof order)[number]) => {
    if (item.name === '성도의 교제') return '교회 소식';
    if (item.service1 || item.service2) {
      return (svcTab === '1' ? item.service1 || item.service2 : item.service2 || item.service1) ?? '';
    }
    return item.shared || (item.name === '성찬식' || item.name === '봉헌' ? '다같이' : '');
  };
  const SERVICE_INFO = [
    { tab: '1' as const, short: '이른 비', label: '이른 비(1부)', time: '오전 8:50', Icon: Sun },
    { tab: '2' as const, short: '큰 비', label: '큰 비(2부)', time: '오전 11:00', Icon: Cloud },
  ];
  // 1부는 파랑, 2부는 초록 — 지금 어느 예배를 보고 있는지 색으로도 구분되게
  const SERVICE_ACCENT = {
    '1': { solid: colors.primary, text: colors.tagBlueText, bg: colors.tagBlueBg },
    '2': { solid: colors.tagGreenText, text: colors.tagGreenText, bg: colors.tagGreenBg },
  } as const;
  const curSvc = SERVICE_INFO.find((s) => s.tab === svcTab)!;
  const curAccent = SERVICE_ACCENT[svcTab];

  return (
    <>
      {bulletin.sermon ? (
        <View
          style={[styles.heroCard, shadows.hero, heroHeight != null && { height: heroHeight }]}
          onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
        >
          <Image
            source={{ uri: '/hero-sunday-bg-v3.jpg' }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>이번주 말씀</Text>
          </View>
          <View style={styles.heroMid}>
            <Text style={styles.heroDate}>
              {fmtKo(bulletin.date)}
              {hasCommunion ? ' · 성찬식' : ''}
            </Text>
            {bulletin.sermon.title ? <Text style={styles.heroTitle}>{bulletin.sermon.title}</Text> : null}
            <Text style={styles.heroMeta}>
              {[bulletin.sermon.scripture, bulletin.sermon.preacher].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pressable
            style={styles.heroBtn}
            onPress={() => router.push(`/verse/${bulletin.date}`)}
          >
            <Text style={styles.heroBtnText}>성경말씀보기</Text>
            <ChevronRight size={12} color="#FFF6ED" strokeWidth={2.6} />
          </Pressable>
        </View>
      ) : null}

      {order.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<Clock size={13} color={colors.tagBlueText} strokeWidth={2} />}
            tint={colors.tagBlueBg}
            title="오늘 예배 안내"
          />
          <View style={styles.svcSummaryRow}>
            {SERVICE_INFO.map((s) => {
              const active = svcTab === s.tab;
              const accent = SERVICE_ACCENT[s.tab];
              return (
                <Pressable
                  key={s.tab}
                  style={[
                    styles.svcSummaryCard,
                    active && { backgroundColor: accent.bg, borderColor: accent.solid },
                  ]}
                  onPress={() => setSvcTab(s.tab)}
                >
                  <View style={styles.svcSummaryTopRow}>
                    <View style={styles.svcSummaryIconLabel}>
                      <s.Icon size={13} color={accent.text} strokeWidth={2.2} />
                      <Text style={styles.svcSummaryLabel}>{s.label}</Text>
                    </View>
                    {active && <CircleCheck size={15} color={accent.solid} strokeWidth={2.2} />}
                  </View>
                  <View style={styles.svcSummaryTimeRow}>
                    <Clock size={12} color={colors.primary} strokeWidth={2.2} />
                    <Text style={styles.svcSummaryTime}>{s.time}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {order.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<ListChecks size={13} color={colors.tagBlueText} strokeWidth={2} />}
            tint={colors.tagBlueBg}
            title="예배 순서"
          />

          <View style={[styles.currentChip, { backgroundColor: curAccent.bg }]}>
            <Text style={[styles.currentChipText, { color: curAccent.text }]}>현재 예배</Text>
          </View>
          <View style={styles.currentRow}>
            <Text style={styles.currentName}>{curSvc.label}</Text>
            <Text style={styles.currentTime}>{curSvc.time}</Text>
          </View>

          <View style={styles.svcTabRow}>
            {SERVICE_INFO.map((s) => {
              const active = svcTab === s.tab;
              return (
                <Pressable
                  key={s.tab}
                  style={[
                    styles.svcTabBtn,
                    active && { backgroundColor: SERVICE_ACCENT[s.tab].solid },
                  ]}
                  onPress={() => setSvcTab(s.tab)}
                >
                  <Text style={[styles.svcTabText, active && styles.svcTabTextActive]}>
                    {s.tab}부 {s.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {order.map((item, i) => {
            const otherTab = svcTab === '1' ? '2' : '1';
            const otherSvc = SERVICE_INFO.find((s) => s.tab === otherTab)!;
            const otherText = svcTab === '1' ? item.service2 : item.service1;
            const curText = svcDetail(item);
            const differs =
              !!item.service1 && !!item.service2 && item.service1.trim() !== item.service2.trim();
            return (
              <View key={i} style={[styles.orderIconRow, i === order.length - 1 && styles.rowLast]}>
                <OrderIcon name={item.name} />
                <View style={styles.orderBody}>
                  <View style={styles.orderMainRow}>
                    <Text style={styles.orderIconName}>{item.name}</Text>
                    <Text style={styles.orderIconDetail}>{curText}</Text>
                  </View>
                  {differs && (
                    <Text style={styles.orderChange}>
                      <Text style={styles.orderChangeLabel}>{otherSvc.tab}부 {otherSvc.short}에서 변경</Text>
                      {' · '}
                      {otherText}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
          {hasAsterisk && <Text style={styles.orderFootnote}>* 표는 일어서 주시기 바랍니다.</Text>}
        </View>
      )}

      {(dawnReadings.length > 0 || fridayReading) && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<BookOpen size={13} color={colors.tagGreenText} strokeWidth={2} />}
            tint={colors.tagGreenBg}
            title="새벽예배 · 금요성령집회"
          />
          <View style={styles.readingRow}>
            {dawnReadings.map((r, i) => (
              <View key={i} style={styles.readingCol}>
                <Text style={styles.readingDay}>{r.day}</Text>
                <Text style={styles.readingPassage}>{twoLinePassage(r.passage)}</Text>
              </View>
            ))}
          </View>
          {fridayReading ? (
            <View style={styles.readingFridayRow}>
              <Text style={styles.readingFridayLabel}>금요성령집회 {fridayReading.day}</Text>
              <Text style={styles.readingFridayPassage}>{fridayReading.passage}</Text>
            </View>
          ) : null}
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
              <View style={styles.noticeNumBadge}>
                <Text style={styles.noticeNumText}>{i + 1}</Text>
              </View>
              <View style={styles.noticeTextCol}>
                <Text style={styles.noticeTitle}>{n.title}</Text>
                <Text style={styles.noticeBody}>{n.body}</Text>
              </View>
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
          {upcoming.map((e, i) => (
            <View key={i} style={[styles.weekRow, i === upcoming.length - 1 && styles.rowLast]}>
              <Text style={styles.weekDate}>{e.dateLabel}</Text>
              <Text style={styles.weekTitle}>{e.title}</Text>
            </View>
          ))}
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
        <View style={styles.linkGrid}>
          <Pressable style={styles.linkBtn} onPress={openLiveWorship}>
            <View style={[styles.linkBtnIcon, { backgroundColor: colors.tagBlueBg }]}>
              <Play size={17} color={colors.tagBlueText} strokeWidth={2.2} />
            </View>
            <Text style={styles.linkBtnText}>온라인 예배</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => openExternal(churchInfo.pages.newcomerForm)}>
            <View style={[styles.linkBtnIcon, { backgroundColor: colors.tagGreenBg }]}>
              <Users size={17} color={colors.tagGreenText} strokeWidth={2.2} />
            </View>
            <Text style={styles.linkBtnText}>새가족 등록</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push('/album')}>
            <View style={[styles.linkBtnIcon, { backgroundColor: colors.tagOrangeBg }]}>
              <ImageIcon size={17} color={colors.tagOrangeText} strokeWidth={2.2} />
            </View>
            <Text style={styles.linkBtnText}>교우 앨범</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push('/word')}>
            <View style={[styles.linkBtnIcon, { backgroundColor: colors.tagGrayBg }]}>
              <BookOpen size={17} color={colors.tagGrayText} strokeWidth={2.2} />
            </View>
            <Text style={styles.linkBtnText}>오늘의 말씀</Text>
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
  // 지난 주보는 주소에 날짜를 담아 연다 — 그래야 뒤로가기가 홈이 아니라
  // 이번 주 주보 화면으로 돌아온다(브라우저 뒤로가기·화면 밀기 모두 동일).
  const params = useLocalSearchParams<{ d?: string }>();
  const selected = typeof params.d === 'string' && params.d ? params.d : null;
  // 화면을 열자마자 "이번 주 주보" 내용부터 받는다 — 지난 주보 전체 목록(최대
  // 300건, 날짜 칩·목록용)은 따로, 동시에 받아서 서로 기다리지 않는다.
  const { date: latestDate, loading: latestLoading } = useLatestBulletinDate(
    firebaseEnabled && !selected,
  );
  const { dates, testDates, loading: datesLoading } = useBulletinDates(firebaseEnabled);
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
  const todayMissing = !selected && !latestLoading && isSunday && latestDate !== todayKey;
  const current = selected ?? (todayMissing ? null : latestDate);
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
  // 콘텐츠는 최신 날짜 조회(가벼움)만 끝나면 바로 뜬다 — 칩용 전체 목록(datesLoading)은
  // 별도로 채워지며 화면을 막지 않는다.
  const loading = (selected ? false : latestLoading) || metaLoading;
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
    backgroundColor: '#F3E9DC',
    borderRadius: 16,
    width: '100%',
    aspectRatio: HERO_ASPECT,
    overflow: 'hidden',
    position: 'relative',
  },
  // 배경 그림(hero-sunday-bg-v3.jpg)은 원본 그대로 안 자름 — 카드 비율도 그림과
  // 똑같아서(1920:1080) 어느 방향으로도 잘리지 않는다. 실제 선 위치를 픽셀 분석해
  // 맞춘 좌표: 위쪽 선 9.07%, 아래쪽 선 88.52%
  heroBadge: {
    position: 'absolute',
    top: '9.07%',
    left: '6.5%',
    transform: [{ translateY: 6 }, { translateX: -8 }],
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroBadgeText: { fontFamily: font.bold, fontSize: 11.5, color: '#5A3D2B' },
  heroMid: {
    position: 'absolute',
    top: '50%',
    left: '6.5%',
    right: '34%',
    transform: [{ translateY: -45 }],
  },
  heroDate: {
    fontFamily: font.bold,
    fontSize: 13,
    color: '#8A6A4E',
  },
  heroTitle: {
    fontFamily: font.extraBold,
    fontSize: 16.5,
    lineHeight: 22,
    color: '#3A2A1D',
    marginTop: 6,
  },
  heroMeta: { fontFamily: font.medium, fontSize: 12.5, color: '#6B4A35', marginTop: 6 },
  // 버튼은 아래쪽 선 밑 좁은 틈에 욱여넣는 대신, 선 위에 걸치듯 배치 —
  // 어떤 화면 폭에서도 여백 부족으로 잘리지 않는다.
  heroBtn: {
    position: 'absolute',
    top: '88.52%',
    right: '3.96%',
    transform: [{ translateY: -13 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#6B4A35',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  heroBtnText: { fontFamily: font.bold, fontSize: 12, color: '#FFF6ED' },

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

  // 오늘 예배 안내 — 1부/2부 요약 2단. 지금 보고 있는 쪽만 색 배경 + 테두리 + 체크
  svcSummaryRow: { flexDirection: 'row', gap: 10 },
  svcSummaryCard: {
    flex: 1,
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 12,
  },
  svcSummaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  svcSummaryIconLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  svcSummaryLabel: { fontFamily: font.extraBold, fontSize: 13.5, color: colors.title },
  svcSummaryTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  svcSummaryTime: { fontFamily: font.extraBold, fontSize: 15, color: colors.title },

  // 예배 순서 — 현재 예배 표시 + 1부/2부 탭 + 아이콘 목록
  currentChip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginBottom: 5,
  },
  currentChipText: { fontFamily: font.bold, fontSize: 10.5 },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  currentName: { fontFamily: font.extraBold, fontSize: 15, color: colors.title },
  currentTime: { fontFamily: font.bold, fontSize: 12, color: colors.muted },

  svcTabRow: {
    flexDirection: 'row',
    backgroundColor: colors.screenBg,
    borderRadius: 11,
    padding: 3,
    marginBottom: 6,
  },
  svcTabBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  svcTabText: { fontFamily: font.bold, fontSize: 11.5, color: colors.muted },
  svcTabTextActive: { color: '#FFFFFF' },

  orderIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  orderBody: { flex: 1 },
  orderMainRow: { flexDirection: 'row', alignItems: 'center' },
  orderChange: {
    fontFamily: font.medium,
    fontSize: 10.5,
    color: colors.muted,
    textAlign: 'right',
    marginTop: 3,
  },
  orderChangeLabel: { fontFamily: font.bold, color: colors.tagOrangeText },
  orderIconChip: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  orderIconName: { flex: 0.8, fontFamily: font.bold, fontSize: 13, color: colors.body },
  orderIconDetail: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'right',
  },
  orderFootnote: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.primary,
    marginTop: 8,
  },

  readingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  readingCol: {
    flexBasis: '18%',
    flexGrow: 1,
    backgroundColor: colors.screenBg,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  readingDay: { fontFamily: font.bold, fontSize: 10.5, color: colors.faint2 },
  readingPassage: {
    fontFamily: font.bold,
    fontSize: 11.5,
    color: colors.body,
    marginTop: 3,
    textAlign: 'center',
  },
  readingFridayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  readingFridayLabel: { fontFamily: font.bold, fontSize: 11.5, color: colors.tagOrangeText },
  readingFridayPassage: { fontFamily: font.bold, fontSize: 12.5, color: colors.body },

  noticeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  noticeNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.tagOrangeBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  noticeNumText: { fontFamily: font.extraBold, fontSize: 11, color: colors.tagOrangeText },
  noticeTextCol: { flex: 1 },
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
    fontSize: 11.5,
    lineHeight: 15,
    color: colors.body,
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 3,
    textAlign: 'center',
  },
  dutyLabelCol: { flex: 0.6, textAlign: 'left', paddingLeft: 4 },
  dutyHeadCell: {
    fontFamily: font.bold,
    fontSize: 10.5,
    lineHeight: 13,
    color: '#FFFFFF',
    backgroundColor: colors.primary,
  },
  dutyRowLabel: { fontFamily: font.bold, color: colors.muted2, backgroundColor: colors.screenBg },

  weekRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  weekDate: {
    fontFamily: font.bold,
    fontSize: 11,
    color: colors.primary,
    width: 92,
    flexShrink: 0,
  },
  weekTitle: { fontFamily: font.bold, fontSize: 13, color: colors.body, flex: 1 },

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

  linkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkBtn: {
    flexBasis: '46%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    paddingVertical: 12,
  },
  linkBtnIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtnText: { fontFamily: font.bold, fontSize: 12, color: colors.body },

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
