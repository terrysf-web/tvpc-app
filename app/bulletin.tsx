import { useLocalSearchParams, useRouter } from 'expo-router';
import Baby from 'lucide-react-native/dist/esm/icons/baby.mjs';
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
import HeartHandshake from 'lucide-react-native/dist/esm/icons/heart-handshake.mjs';
import ImageIcon from 'lucide-react-native/dist/esm/icons/image.mjs';
import ListChecks from 'lucide-react-native/dist/esm/icons/list-checks.mjs';
import Mail from 'lucide-react-native/dist/esm/icons/mail.mjs';
import Maximize2 from 'lucide-react-native/dist/esm/icons/maximize-2.mjs';
import Megaphone from 'lucide-react-native/dist/esm/icons/megaphone.mjs';
import Mic from 'lucide-react-native/dist/esm/icons/mic.mjs';
import Music from 'lucide-react-native/dist/esm/icons/music.mjs';
import Play from 'lucide-react-native/dist/esm/icons/play.mjs';
import Sun from 'lucide-react-native/dist/esm/icons/sun.mjs';
import Users from 'lucide-react-native/dist/esm/icons/users.mjs';
import Wallet from 'lucide-react-native/dist/esm/icons/wallet.mjs';
import Wine from 'lucide-react-native/dist/esm/icons/wine.mjs';
import X from 'lucide-react-native/dist/esm/icons/x.mjs';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
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
import type {
  Bulletin,
  BulletinDutyTable,
  BulletinHymn,
  BulletinReading,
  BulletinScripture,
} from '../src/data/bulletin';
import { useAdminAuth } from '../src/data/admin';
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

// 공지 본문이 "주보 뒷면 QR 코드"만 안내하는 경우 — 종이 주보에서나 되는 거라
// 앱에는 스캔할 QR이 없다. 지도가 필요한 공지에 한해(2026-08-16 온가족
// 야외예배) 제목으로 매칭해, 교회에서 목적지까지 가는 길을 미리 그려 둔
// 지도 그림(관리자가 직접 올림)을 보여준다. 누르면 전체화면으로 커진다.
const NOTICE_MAP_IMAGES: Record<string, { uri: string; aspect: number }> = {
  '온가족 야외예배 및 체육대회': { uri: '/outdoor-worship-location-2026.png', aspect: 1740 / 1852 },
};

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
  // 야외예배 등 단일 예배 주보 — 항목 이름이 다르다
  '참회의 기도/신앙고백': Hand,
  '찬송 / 헌금': Music,
  '어린이 설교': Baby,
  '교회소식 / 새가족환영': Megaphone,
  기도: Hand,
  찬송: Music,
};

// 단일 예배(야외예배 등) 주보에서 한글/English 전환 시 쓰는 항목 이름 번역.
// 영어부 주보 문구를 참고했고("Call to Worship", "Announcements" 등은 그대로 가져옴),
// 영어부 주보에 없던 항목(참회의 기도/신앙고백·어린이 설교·기도)은 직접 옮겼다.
// 그 주의 세부 내용(설교자·찬송 제목 등)까지는 번역하지 않는다 — PDF에서
// 자동 추출한 한글 텍스트를 매주 사람이 번역해 줄 수 없기 때문에, 항목
// 이름(고정된 순서표 라벨)만 바뀐다.
const ORDER_LABELS_EN: Record<string, string> = {
  '성도의 교제': 'Fellowship',
  '예배의 부름': 'Call to Worship',
  '경배와 기도': 'Praise & Prayer',
  성찬식: 'Communion',
  성경봉독: 'Scripture Reading',
  설교: 'Sermon',
  '결단의 찬양': 'Hymn of Commitment',
  봉헌: 'Offering',
  축도: 'Benediction',
  '참회의 기도/신앙고백': 'Prayer of Confession / Affirmation of Faith',
  '찬송 / 헌금': 'Hymn / Offering',
  '어린이 설교': "Children's Sermon",
  '교회소식 / 새가족환영': 'Announcements / Welcome New Families',
  기도: 'Prayer',
  찬송: 'Song of Response',
};

function OrderIcon({ name }: { name: string }) {
  const Icon = ORDER_ICONS[name];
  return (
    <View style={styles.orderIconChip}>
      {Icon ? <Icon size={14} color={colors.primary} strokeWidth={2} /> : null}
    </View>
  );
}

/** 예배 순서 항목 문구에서 "찬송가 28장" 같은 표기를 찾아 그 곡의 가사를 붙인다 */
function findHymnForItem(text: string, hymns: BulletinHymn[]): BulletinHymn | null {
  const m = text.match(/찬송가\s*(\d+)\s*장/);
  if (!m) return null;
  return hymns.find((h) => h.number === m[1]) ?? null;
}

/** 항목 문구에서 "1:31" 같은 장·절을 찾아 그 본문을 붙인다(책 이름은 안 봐도
 * 장·절이 같은 본문이 그 주에 하나뿐이라 사실상 이걸로 충분하다) */
function findScriptureForItem(text: string, scriptures: BulletinScripture[]): BulletinScripture | null {
  const m = text.match(/\d+\s*:\s*\d+(?:[-–]\d+)?/);
  if (!m) return null;
  const ref = m[0].replace(/\s+/g, '');
  return scriptures.find((s) => s.reference.replace(/\s+/g, '').endsWith(ref)) ?? null;
}

/** 예배 순서 항목을 눌러 펼쳤을 때 — 가사·본문(있으면 한글/English 전환).
 * defaultLang — 단일 예배 주보에서 위쪽 한글/English 탭을 골라 둔 상태로 펼치면
 * 그 언어부터 보여준다(둘 다 있을 때만 의미 있고, 없으면 있는 언어로 대체). */
function OrderExpandPanel({
  hymn,
  scripture,
  defaultLang,
}: {
  hymn?: BulletinHymn | null;
  scripture?: BulletinScripture | null;
  defaultLang?: 'ko' | 'en';
}) {
  const ko = hymn ? hymn.lyricsKo : scripture?.textKo;
  const en = hymn ? hymn.lyricsEn : scripture?.textEn;
  const preferred = defaultLang === 'en' ? !!en : defaultLang === 'ko' ? !!ko : false;
  const [lang, setLang] = useState<'ko' | 'en'>(preferred ? defaultLang! : ko ? 'ko' : 'en');
  const text = lang === 'ko' ? ko : en;
  const both = !!ko && !!en;
  return (
    <View style={styles.expandPanel}>
      {both && (
        <View style={styles.expandLangRow}>
          <Pressable
            style={[styles.expandLangBtn, lang === 'ko' && styles.expandLangBtnActive]}
            onPress={() => setLang('ko')}
          >
            <Text style={[styles.expandLangText, lang === 'ko' && styles.expandLangTextActive]}>한글</Text>
          </Pressable>
          <Pressable
            style={[styles.expandLangBtn, lang === 'en' && styles.expandLangBtnActive]}
            onPress={() => setLang('en')}
          >
            <Text style={[styles.expandLangText, lang === 'en' && styles.expandLangTextActive]}>English</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.expandText}>{text ?? '—'}</Text>
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
function BulletinCards({
  bulletin,
  scrollRef,
}: {
  bulletin: Bulletin;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const router = useRouter();
  const { events } = useEvents();
  const { services } = useServices();
  const [noticesOpen, setNoticesOpen] = useState(false);
  // 공지에 붙인 지도 그림을 전체화면으로 볼 때 — 닫으면 그대로 주보로 돌아온다
  const [mapImageOpen, setMapImageOpen] = useState<string | null>(null);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [svcTab, setSvcTab] = useState<'1' | '2'>('1');
  // 야외예배처럼 1부/2부 없이 예배가 하나뿐인 주(=order 항목 전부가 service1/2
  // 없이 shared만 씀)는 1부/2부 탭이 무의미하다(둘 다 내용이 같고 시간도
  // 틀리게 나옴) — 그 탭 자리를 한글/English 전환으로 대신 쓴다.
  const [orderLang, setOrderLang] = useState<'ko' | 'en'>('ko');
  // "오늘 예배 안내"에서 예배를 고르면 아래 "예배 순서" 카드가 화면에
  // 다 들어오게 스크롤해 준다 — 탭만 바뀌고 화면은 그대로면 뭐가 바뀐 건지
  // 어중간하게 보이기 쉬워서.
  const orderCardY = useRef(0);
  const scrollToOrder = () => {
    scrollRef?.current?.scrollTo({ y: Math.max(orderCardY.current - 12, 0), animated: true });
  };
  // 히어로 카드 배경 그림 위 배지·버튼이 %로 위치를 잡는데, RN(web)에서
  // aspectRatio만으로 정해진 높이는 절대위치 자식의 %가 잘못 계산되는
  // 경우가 있어 — 실제 렌더된 폭을 재서 높이를 직접 픽셀로 계산해 넘긴다.
  const [heroWidth, setHeroWidth] = useState(0);
  const heroHeight = heroWidth > 0 ? heroWidth / HERO_ASPECT : undefined;
  const order = bulletin.order ?? [];
  // 찬송가 가사·성경 본문 전체 — 야외예배 등 특별 주보에만 있다. 있으면 예배
  // 순서에서 해당 항목을 눌러 펼쳐 볼 수 있다.
  const hymns = bulletin.hymns ?? [];
  const scriptures = bulletin.scriptures ?? [];
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const notices = bulletin.notices ?? [];
  // 교우 동정(부고·이사·선교 등) — 교회 소식과 원본에서도 다른 카테고리라
  // 따로 카드로 보여준다. 없는 주가 더 많다.
  const familyNews = bulletin.familyNews ?? [];
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
  // 모든 항목이 service1/service2 없이 shared만 쓰면 1부/2부 구분 없는 단일
  // 예배 주보(야외예배 등)다.
  const isSingleService = order.length > 0 && order.every((o) => !o.service1 && !o.service2);
  const svcDetail = (item: (typeof order)[number]) => {
    if (item.name === '성도의 교제') return '교회 소식';
    if (item.service1 || item.service2) {
      return (svcTab === '1' ? item.service1 || item.service2 : item.service2 || item.service1) ?? '';
    }
    return item.shared || (item.name === '성찬식' || item.name === '봉헌' ? '다같이' : '');
  };
  const SERVICE_INFO = [
    { tab: '1' as const, label: '이른 비(1부)', time: '오전 8:50', Icon: Sun },
    { tab: '2' as const, label: '큰 비(2부)', time: '오전 11:00', Icon: Cloud },
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

      {/* 1부/2부가 있는 주에만 의미가 있다 — 야외예배 등 단일 예배 주에는 고를
          예배가 하나뿐이라 이 카드 자체를 보여주지 않는다. */}
      {order.length > 0 && !isSingleService && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<Clock size={13} color={colors.tagBlueText} strokeWidth={2} />}
            tint={colors.tagBlueBg}
            title="오늘 예배 안내"
            count="누르면 예배 순서로 이동"
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
                  onPress={() => {
                    setSvcTab(s.tab);
                    scrollToOrder();
                  }}
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
        <View
          style={[styles.contentCard, shadows.card]}
          onLayout={(e) => {
            orderCardY.current = e.nativeEvent.layout.y;
          }}
        >
          <SectionTitle
            icon={<ListChecks size={13} color={colors.tagBlueText} strokeWidth={2} />}
            tint={colors.tagBlueBg}
            title="예배 순서"
          />

          {!isSingleService && (
            <>
              <View style={[styles.currentChip, { backgroundColor: curAccent.bg }]}>
                <Text style={[styles.currentChipText, { color: curAccent.text }]}>현재 예배</Text>
              </View>
              <View style={styles.currentRow}>
                <Text style={styles.currentName}>{curSvc.label}</Text>
                <Text style={styles.currentTime}>{curSvc.time}</Text>
              </View>
            </>
          )}

          {/* 1부/2부가 있는 주 — 예배 선택 탭 / 단일 예배 주 — 한글·English 전환 탭 */}
          <View style={styles.svcTabRow}>
            {isSingleService
              ? (['ko', 'en'] as const).map((l) => {
                  const active = orderLang === l;
                  return (
                    <Pressable
                      key={l}
                      style={[styles.svcTabBtn, active && { backgroundColor: colors.primary }]}
                      onPress={() => setOrderLang(l)}
                    >
                      <Text style={[styles.svcTabText, active && styles.svcTabTextActive]}>
                        {l === 'ko' ? '한글' : 'English'}
                      </Text>
                    </Pressable>
                  );
                })
              : SERVICE_INFO.map((s) => {
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
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
          </View>
          {order.map((item, i) => {
            const rawDetail = svcDetail(item);
            const hymn = hymns.length ? findHymnForItem(rawDetail, hymns) : null;
            const scripture = !hymn && scriptures.length ? findScriptureForItem(rawDetail, scriptures) : null;
            const expandable = !!(hymn || scripture);
            const isOpen = expandable && expandedIdx === i;
            const Row = expandable ? Pressable : View;
            const name =
              isSingleService && orderLang === 'en' ? (ORDER_LABELS_EN[item.name] ?? item.name) : item.name;
            // 세부 내용이 "*"(일어서 주시기 바랍니다 표시) 하나뿐이면 오른쪽 칸엔
            // 사실상 빈 것과 같으니, 그 별표는 이름 뒤에 붙이고 오른쪽은 진짜로 비운다.
            const asteriskOnly = rawDetail.trim() === '*';
            const detail = asteriskOnly ? '' : rawDetail;
            const displayName = asteriskOnly ? `${name}*` : name;
            return (
              <View key={i}>
                <Row
                  style={[styles.orderIconRow, i === order.length - 1 && !isOpen && styles.rowLast]}
                  onPress={expandable ? () => setExpandedIdx(isOpen ? null : i) : undefined}
                >
                  <OrderIcon name={item.name} />
                  {/* 세부 내용이 없으면(다같이 하는 순서 등) 오른쪽이 빈 채로
                      남으니, 그때는 이름 칸이 그 자리까지 채운다. */}
                  <Text style={[styles.orderIconName, !detail && styles.orderIconNameFull]}>{displayName}</Text>
                  {!!detail && <Text style={styles.orderIconDetail}>{detail}</Text>}
                  {/* 챙기기 쉽게 눌러서 펼칠 수 있다는 걸 글자로도 알려준다 —
                      화살표 아이콘만으로는 눈에 잘 안 띈다는 의견 반영 */}
                  {expandable && (
                    <View style={styles.orderExpandHint}>
                      <Text style={styles.orderExpandHintText}>{hymn ? '가사' : '본문'}</Text>
                      {isOpen ? (
                        <ChevronUp size={12} color={colors.tagBlueText} strokeWidth={2.4} />
                      ) : (
                        <ChevronDown size={12} color={colors.tagBlueText} strokeWidth={2.4} />
                      )}
                    </View>
                  )}
                </Row>
                {isOpen && (
                  <OrderExpandPanel
                    key={isSingleService ? orderLang : 'ko'}
                    hymn={hymn}
                    scripture={scripture}
                    defaultLang={isSingleService ? orderLang : undefined}
                  />
                )}
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
          {visibleNotices.map((n, i) => {
            const mapImage = NOTICE_MAP_IMAGES[n.title];
            // 지도 그림을 바로 아래에 보여주는 공지는 "주보 뒷면 QR 코드" 안내가
            // 더는 맞지 않으니 "아래 지도"로 바꿔 보여준다(원본 데이터는 그대로 둠)
            const bodyText = mapImage
              ? n.body.replace(/\(주보\s*뒷면\s*QR\s*코드\)/, '(아래 지도)')
              : n.body;
            return (
              <View key={i} style={[styles.noticeRow, i === visibleNotices.length - 1 && styles.rowLast]}>
                <View style={styles.noticeNumBadge}>
                  <Text style={styles.noticeNumText}>{i + 1}</Text>
                </View>
                <View style={styles.noticeTextCol}>
                  <Text style={styles.noticeTitle}>{n.title}</Text>
                  <Text style={styles.noticeBody}>{bodyText}</Text>
                  {mapImage && (
                    <Pressable
                      style={styles.noticeMapThumbWrap}
                      onPress={() => setMapImageOpen(mapImage.uri)}
                    >
                      <Image
                        source={{ uri: mapImage.uri }}
                        style={[styles.noticeMapThumb, { aspectRatio: mapImage.aspect }]}
                        resizeMode="contain"
                      />
                      <View style={styles.noticeMapHint}>
                        <Maximize2 size={11} color="#FFFFFF" strokeWidth={2.4} />
                        <Text style={styles.noticeMapHintText}>크게 보기</Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
          {notices.length > 4 && (
            <Pressable style={styles.morePill} onPress={() => setNoticesOpen((v) => !v)}>
              <Text style={styles.morePillText}>
                {noticesOpen ? '접기' : `+${notices.length - 4}건 더보기`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {familyNews.length > 0 && (
        <View style={[styles.contentCard, shadows.card]}>
          <SectionTitle
            icon={<HeartHandshake size={13} color={colors.tagPurpleText} strokeWidth={2} />}
            tint={colors.tagPurpleBg}
            title="교우 동정"
          />
          {familyNews.map((n, i) => (
            <View key={i} style={[styles.noticeRow, i === familyNews.length - 1 && styles.rowLast]}>
              <View style={styles.familyTagChip}>
                <Text style={styles.familyTagText}>{n.title}</Text>
              </View>
              <Text style={[styles.noticeBody, styles.familyBody]}>{n.body}</Text>
            </View>
          ))}
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

      {/* 공지에 붙인 지도 그림 — 전체화면으로 크게 보고, 닫으면 주보로 돌아온다.
          Modal 자체를 실제로 열 때만 만들어서, 주보 탭 열 때마다 잠깐
          비쳤다 사라지는 일이 없게 한다. */}
      {mapImageOpen && (
        <Modal visible transparent={false} animationType="fade">
          <View style={styles.mapViewer}>
            <Image
              source={{ uri: mapImageOpen }}
              style={{ width: winWidth, height: winHeight }}
              resizeMode="contain"
            />
            <Pressable
              style={[styles.mapViewerCloseBtn, { top: insets.top + 10 }]}
              onPress={() => setMapImageOpen(null)}
              hitSlop={10}
            >
              <X size={22} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
          </View>
        </Modal>
      )}
    </>
  );
}

export default function BulletinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  // 지난 주보는 주소에 날짜를 담아 연다 — 그래야 뒤로가기가 홈이 아니라
  // 이번 주 주보 화면으로 돌아온다(브라우저 뒤로가기·화면 밀기 모두 동일).
  const params = useLocalSearchParams<{ d?: string }>();
  const selected = typeof params.d === 'string' && params.d ? params.d : null;
  // 화면을 열자마자 "이번 주 주보" 내용부터 받는다 — 지난 주보 전체 목록(최대
  // 300건, 날짜 칩·목록용)은 따로, 동시에 받아서 서로 기다리지 않는다.
  const { date: latestDate, loading: latestLoading } = useLatestBulletinDate(
    firebaseEnabled && !selected,
  );
  const { dates: allDates, testDates, loading: datesLoading } = useBulletinDates(firebaseEnabled);
  // 목업/미리보기 주보(source가 'test'로 시작)는 관리자로 로그인했을 때만
  // 날짜 목록에 보인다 — 다른 관리자들과 상의 중인 초안이 일반 교인에게
  // 먼저 노출되지 않게.
  const { isAdmin } = useAdminAuth();
  const dates = isAdmin ? allDates : allDates.filter((d) => !testDates.has(d));
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
  // 목록에는 안 보여도, 주소로 날짜를 직접 넣어 들어오면 열릴 수 있으니
  // 문서 자체의 source로 한 번 더 막는다.
  const isLockedPreview = !!bulletin?.source?.startsWith('test') && !isAdmin;
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
      ) : isLockedPreview ? (
        <View style={styles.waitingWrap}>
          <Text style={styles.waitingTitle}>관리자 확인용 미리보기입니다</Text>
          <Text style={styles.waitingText}>
            아직 검토 중인 주보 목업이라 관리자로 로그인해야 볼 수 있어요.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/admin')}>
            <Text style={styles.primaryBtnText}>관리자 로그인</Text>
          </Pressable>
        </View>
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
          ref={scrollRef}
          contentContainerStyle={[styles.pages, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {hasStructured ? <BulletinCards bulletin={bulletin} scrollRef={scrollRef} /> : null}

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
  // 세부 내용이 없는 줄(다같이 등)은 이름이 오른쪽 빈 공간까지 채우게
  orderIconNameFull: { flex: 1 },
  orderIconDetail: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'right',
  },
  // 가사·본문이 있어 눌러 펼칠 수 있는 줄 — 화살표만으로는 눈에 안 띄어
  // 글자 칩을 같이 붙인다.
  orderExpandHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  orderExpandHintText: { fontFamily: font.bold, fontSize: 10, color: colors.tagBlueText },
  orderFootnote: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.primary,
    marginTop: 8,
  },

  // 예배 순서 항목을 눌러 펼친 가사·본문
  expandPanel: {
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 9,
  },
  expandLangRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 9,
    padding: 3,
    marginBottom: 9,
    alignSelf: 'flex-start',
  },
  expandLangBtn: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 7 },
  expandLangBtnActive: { backgroundColor: colors.primary },
  expandLangText: { fontFamily: font.bold, fontSize: 11.5, color: colors.muted },
  expandLangTextActive: { color: '#FFFFFF' },
  expandText: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 21,
    color: colors.body,
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
  noticeMapThumbWrap: { marginTop: 8, borderRadius: 10, overflow: 'hidden' },
  noticeMapThumb: {
    width: '100%',
    backgroundColor: colors.tagGrayBg,
  },
  noticeMapHint: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 7,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  noticeMapHintText: { fontFamily: font.bold, fontSize: 10.5, color: '#FFFFFF' },
  mapViewer: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  mapViewerCloseBtn: {
    position: 'absolute',
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  morePill: {
    marginTop: 4,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },

  // 교우 동정 — 번호 대신 [부고]/[이사]/[선교] 같은 태그 칩
  familyTagChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tagPurpleBg,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginTop: 1,
    flexShrink: 0,
  },
  familyTagText: { fontFamily: font.extraBold, fontSize: 11, color: colors.tagPurpleText },
  familyBody: { marginTop: 0 },
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
