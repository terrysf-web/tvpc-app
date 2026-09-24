import { useRouter } from 'expo-router';
import AudioLines from 'lucide-react-native/dist/esm/icons/audio-lines.mjs';
import Bell from 'lucide-react-native/dist/esm/icons/bell.mjs';
import BellRing from 'lucide-react-native/dist/esm/icons/bell-ring.mjs';
import BookOpen from 'lucide-react-native/dist/esm/icons/book-open.mjs';
import Bookmark from 'lucide-react-native/dist/esm/icons/bookmark.mjs';
import CalendarDays from 'lucide-react-native/dist/esm/icons/calendar-days.mjs';
import CircleDot from 'lucide-react-native/dist/esm/icons/circle-dot.mjs';
import Download from 'lucide-react-native/dist/esm/icons/download.mjs';
import FileText from 'lucide-react-native/dist/esm/icons/file-text.mjs';
import HandCoins from 'lucide-react-native/dist/esm/icons/hand-coins.mjs';
import Heart from 'lucide-react-native/dist/esm/icons/heart.mjs';
import Home from 'lucide-react-native/dist/esm/icons/house.mjs';
import Images from 'lucide-react-native/dist/esm/icons/images.mjs';
import Music from 'lucide-react-native/dist/esm/icons/music.mjs';
import PlayCircle from 'lucide-react-native/dist/esm/icons/circle-play.mjs';
import RefreshCw from 'lucide-react-native/dist/esm/icons/refresh-cw.mjs';
import SquarePlus from 'lucide-react-native/dist/esm/icons/square-plus.mjs';
import X from 'lucide-react-native/dist/esm/icons/x.mjs';
import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { setHelpAnchor, startHelpTour, takeHelpAnchor } from '../src/helpTour';
import { colors, font, shadows } from '../src/theme';

/* ────────────────────────────────────────────────────────────
 * 그림 조각 — 사진 대신 앱과 같은 색·모양으로 직접 그린다.
 * 화면이 바뀌어도 낡지 않고, 앱 용량도 늘지 않는다.
 * ──────────────────────────────────────────────────────────── */

/** 그림을 감싸는 판 — 실제 화면의 한 조각처럼 보이게 */
function Figure({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <View style={styles.figure}>
      <View style={styles.figureInner}>{children}</View>
      {note ? <Text style={styles.figureNote}>{note}</Text> : null}
    </View>
  );
}

/** '여기를 누르세요' 표시 */
function Here({ label = '여기' }: { label?: string }) {
  return (
    <View style={styles.hereTag}>
      <Text style={styles.hereText}>{label}</Text>
    </View>
  );
}

/** 홈 바로가기 아이콘 넷 */
function FigQuick() {
  const cells = [
    { t: '교회소식', bg: colors.tagOrangeBg },
    { t: '주보 보기', bg: colors.tagGrayBg },
    { t: '교회 미디어', bg: colors.tagBlueBg },
    { t: '온라인 헌금', bg: colors.tagGreenBg },
  ];
  return (
    <View style={styles.quickRow}>
      {cells.map((c) => (
        <View key={c.t} style={styles.quickCell}>
          <View style={[styles.quickChip, { backgroundColor: c.bg }]} />
          <Text style={styles.quickLabel} numberOfLines={1}>
            {c.t}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** 말씀 — 구절 하나에 형광펜이 켜진 모습 */
function FigVerse() {
  return (
    <View>
      <View style={styles.verseRow}>
        <Text style={styles.verseNum}>1</Text>
        <Text style={styles.verseText}>여호와는 나의 목자시니 내게 부족함이 없으리로다</Text>
      </View>
      <View style={[styles.verseRow, styles.verseOn]}>
        <Text style={styles.verseNum}>2</Text>
        <Text style={styles.verseText}>그가 나를 푸른 풀밭에 누이시며</Text>
        <Here />
      </View>
      <View style={styles.verseRow}>
        <Text style={styles.verseNum}>3</Text>
        <Text style={styles.verseText}>내 영혼을 소생시키시고</Text>
      </View>
    </View>
  );
}

/** 주보 — 빈 괄호에 답을 적으면 넓이가 늘어나는 모습 */
function FigBlank() {
  return (
    <View>
      {/* 적기 전 — 빈 괄호 */}
      <View style={styles.blankRow}>
        <Text style={styles.blankText}>1. 온전한 그리스도인은 (</Text>
        <View style={styles.blankEmpty} />
        <Text style={styles.blankText}>) 사람입니다.</Text>
      </View>
      <View style={styles.blankHereRow}>
        <Here label="여기에 적습니다" />
      </View>

      <Text style={styles.blankArrow}>↓</Text>

      {/* 적은 뒤 — 글자에 맞춰 넓어진 괄호 */}
      <View style={styles.blankRow}>
        <Text style={styles.blankText}>1. 온전한 그리스도인은 (</Text>
        <Text style={styles.blankFilled}>기도하는</Text>
        <Text style={styles.blankText}>) 사람입니다.</Text>
      </View>
    </View>
  );
}

/** 교회 미디어 — 사진·영상 고르는 곳 */
function FigTabs() {
  return (
    <View style={styles.tabRow}>
      <View style={styles.tabCell}>
        <Text style={styles.tabOff}>사진</Text>
        <View style={styles.tabLineOff} />
      </View>
      <View style={styles.tabCell}>
        <Text style={styles.tabOn}>영상</Text>
        <View style={styles.tabLineOn} />
      </View>
    </View>
  );
}

/** 화면 위쪽 칸(말씀·설교) — 눌러서 오가는 곳. 새 글이 있는 칸에는 빨간 점 */
function FigSegTabs({
  labels,
  active,
  dotAt,
}: {
  labels: string[];
  active: number;
  dotAt?: number;
}) {
  return (
    <View style={styles.tabRow}>
      {labels.map((l, i) => (
        <View key={l} style={styles.tabCell}>
          <View style={styles.segLabelRow}>
            <Text style={i === active ? styles.tabOn : styles.tabOff}>{l}</Text>
            {dotAt === i ? <View style={styles.segDot} /> : null}
          </View>
          <View style={i === active ? styles.tabLineOn : styles.tabLineOff} />
        </View>
      ))}
    </View>
  );
}

/** 맨 아래 탭 막대 — 「설교」에 새로 올라온 것이 있다는 빨간 점 */
function FigBottomBar() {
  const cells = ['홈', '말씀', '설교', '소식', '더보기'];
  return (
    <View style={styles.barRow}>
      {cells.map((c, i) => (
        <View key={c} style={styles.barCell}>
          <View style={styles.barIconWrap}>
            <View style={[styles.barIcon, i === 0 && styles.barIconOn]} />
            {c === '설교' ? <View style={styles.barDot} /> : null}
          </View>
          <Text style={[styles.barLabel, i === 0 && styles.barLabelOn]}>{c}</Text>
        </View>
      ))}
    </View>
  );
}

/** 홈 카드의 「설교 듣기」와 듣던 자리를 옮기는 막대 */
function FigPlayBar() {
  return (
    <View>
      <View style={styles.playBtn}>
        <Text style={styles.playBtnText}>설교 듣기</Text>
      </View>
      <View style={styles.playTrack}>
        <View style={styles.playFill} />
      </View>
      <View style={styles.playUnder}>
        <Text style={styles.playTime}>3:12 / 22:25</Text>
        <Here label="끌어서 옮기기" />
      </View>
    </View>
  );
}

/** 더보기 — 알림 종류 하나를 켜고, 받고 싶은 시각을 고르는 모습 */
function FigTopicTime() {
  const times = ['오전 8시', '오후 12:30', '오후 7시'];
  return (
    <View>
      <View style={styles.switchRow}>
        <View style={[styles.chip, { backgroundColor: colors.tagBlueBg, width: 30, height: 30, borderRadius: 10 }]}>
          <BookOpen size={16} color={colors.primary} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>오늘의 말씀</Text>
          <Text style={styles.switchSub}>매일 오전 8시에 알려드려요</Text>
        </View>
        <View style={styles.switchOn}>
          <View style={styles.switchKnob} />
        </View>
      </View>
      <View style={styles.timePillRow}>
        {times.map((label, i) => (
          <View key={label} style={[styles.timePill, i === 0 && styles.timePillOn]}>
            <Text style={[styles.timePillText, i === 0 && styles.timePillTextOn]}>{label}</Text>
          </View>
        ))}
        <Here label="원하는 시각으로" />
      </View>
    </View>
  );
}

/* ──────────────────────────────────────────────────────────── */

interface Topic {
  key: string;
  icon: React.ReactNode;
  chipBg: string;
  title: string;
  lines: string[];
  figure?: React.ReactNode;
  figureNote?: string;
  /** 한 꼭지에 그림이 둘 필요할 때(예: 말씀 — 위쪽 칸과 형광펜) */
  figures?: { node: React.ReactNode; note: string }[];
  go?: { label: string; to: string };
}

/**
 * 앱 사용 안내서 — 앱을 쓰시는 교인들이 보는 안내.
 * 어르신도 따라 하실 수 있도록 누를 곳 이름을 그대로 적고,
 * 헷갈리기 쉬운 곳은 그림으로 보여준다. 새 기능이 생기면 한 꼭지를 더한다.
 */
export default function HelpScreen() {
  const router = useRouter();
  // 떠나기 전에 표시를 켜고, 어느 꼭지에서 떠나는지 적어 둔다 —
  // 돌아왔을 때 맨 위가 아니라 보던 자리로 되돌리기 위해
  const go = (key: string, to: string) => {
    startHelpTour();
    setHelpAnchor(key);
    router.push(to as never);
  };

  // 돌아왔다면 그 꼭지가 자리를 잡는 순간 그 자리로 옮긴다
  const scroller = useRef<ScrollView>(null);
  const [anchor] = useState<string | null>(() => takeHelpAnchor());
  const onCardLayout = (key: string) => (e: LayoutChangeEvent) => {
    if (key !== anchor) return;
    const y = Math.max(e.nativeEvent.layout.y - 12, 0);
    scroller.current?.scrollTo({ y, animated: false });
  };

  const chip = (node: React.ReactNode, bg: string) => (
    <View style={[styles.chip, { backgroundColor: bg }]}>{node}</View>
  );

  const topics: Topic[] = [
    {
      key: 'home',
      icon: <Home size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '홈 — 오늘 무엇을 볼지',
      lines: [
        '맨 위 카드는 그날의 말씀입니다. 눌러서 본문 전체를 볼 수 있어요.',
        '주일에는 이 카드가 예배 안내로 바뀝니다. 오전에는 온라인예배 생중계로, 낮 12시 30분이 지나면 그 주일 예배 다시보기로 이어집니다.',
        '그 아래 네 개의 아이콘이 자주 쓰는 곳으로 가는 지름길입니다.',
      ],
      figure: <FigQuick />,
      figureNote: '홈 가운데의 「한눈에 보기」 네 개 아이콘',
      go: { label: '홈으로 가보기', to: '/' },
    },
    {
      key: 'newdot',
      icon: <CircleDot size={20} color="#E5484D" strokeWidth={1.9} />,
      chipBg: colors.tagOrangeBg,
      title: '빨간 점 — 새로 올라온 것을 알려드려요',
      lines: [
        '새 글이 올라오면 그 자리에 작은 빨간 점이 붙습니다. 무엇이 새로 올라왔는지 하나하나 들어가 보지 않으셔도 됩니다.',
        '맨 아래 「말씀·설교·소식」과 홈의 「한눈에 보기」 카드에 붙고, 그 안에 칸이 여러 개면 새 글이 있는 칸에도 붙습니다.',
        '한 번 열어 보시면 그 자리의 점은 사라집니다.',
        '새 주보가 올라온 날에도 「주보 보기」에 점이 붙습니다.',
      ],
      figure: <FigBottomBar />,
      figureNote: '「설교」에 새로 올라온 것이 있다는 표시',
      figures: [
        {
          node: <FigSegTabs labels={['주일설교', '새벽설교', '팟캐스트']} active={0} dotAt={1} />,
          note: '들어가 보면, 새 글이 있는 칸에도 점이 붙어 있습니다',
        },
      ],
    },
    {
      key: 'word',
      icon: <BookOpen size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '말씀 — 읽고, 표시하고, 적어두기',
      lines: [
        '위쪽에 「본문·묵상·적용·기도·메모」 다섯 칸이 있습니다. 눌러서 오가시면 됩니다.',
        '「본문」에서 구절을 한 번 누르면 형광펜이 켜지고, 그 구절이 「메모」 칸으로 옮겨집니다.',
        '한 번 더 누르면 형광펜과 메모 속 구절이 함께 지워집니다.',
        '위쪽 책갈피 표시를 누르면 그 말씀이 저장됩니다. 적어둔 메모와 형광펜도 같이 보관돼요.',
        '주일에는 예배에서 설교로 듣는 본문이라 「본문」과 「메모」만 나옵니다.',
        '지난 새벽설교를 여실 때도 같은 다섯 칸으로 보실 수 있습니다.',
      ],
      figure: <FigSegTabs labels={['본문', '묵상', '적용', '기도', '메모']} active={0} />,
      figureNote: '말씀 화면 위쪽 다섯 칸',
      figures: [{ node: <FigVerse />, note: '구절을 누르면 이렇게 표시됩니다' }],
      go: { label: '말씀 보러 가기', to: '/word' },
    },
    {
      key: 'saved',
      icon: <Bookmark size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '저장한 메모 다시 보기',
      lines: [
        '말씀 화면 아래쪽 「저장한 메모」를 누르시면 그동안 별표 해두신 말씀과 메모가 모여 있습니다.',
        '그때 적어두신 메모도 함께 남아 있습니다.',
      ],
      go: { label: '저장한 메모 열기', to: '/saved' },
    },
    {
      key: 'sermon',
      icon: <PlayCircle size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '설교 — 주일설교·새벽설교·팟캐스트',
      lines: [
        '위쪽에 「주일설교·새벽설교·팟캐스트」 세 칸이 있습니다.',
        '「주일설교」는 맨 위가 가장 최근 설교이고, 아래로 지난 설교가 이어집니다. 누르면 유튜브에서 재생되고, 다 보신 뒤에는 화면 왼쪽 위 「◀ TVPC」를 눌러 앱으로 돌아오세요.',
        '「새벽설교」는 지난 새벽예배 말씀입니다. 예전에 더보기 메뉴에 있던 「지난 새벽설교」가 이 자리로 옮겨 왔습니다.',
        '「팟캐스트」에는 말씀 묵상 음성이 모여 있습니다.',
      ],
      figure: <FigSegTabs labels={['주일설교', '새벽설교', '팟캐스트']} active={1} />,
      figureNote: '설교 화면 위쪽 세 칸',
      go: { label: '설교 보러 가기', to: '/sermon' },
    },
    {
      key: 'listen',
      icon: <AudioLines size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '홈에서 설교 바로 듣기',
      lines: [
        '그날 새벽설교 녹음이 올라온 날에는 홈 맨 위 카드에 「설교 듣기」가 나옵니다. 누르면 화면을 옮기지 않고 그 자리에서 바로 들립니다.',
        '아래 막대를 손가락으로 끌면 듣던 자리를 옮기실 수 있습니다. 끝까지 들으신 뒤 다시 누르면 처음부터 들려드립니다.',
        '전화기 화면이 꺼져도 설교는 계속 들립니다. 잠금 화면에서 멈추고 다시 트실 수 있어요.',
      ],
      figure: <FigPlayBar />,
      figureNote: '「설교 듣기」와 듣던 자리를 옮기는 막대',
      go: { label: '홈으로 가보기', to: '/' },
    },
    {
      key: 'bulletin',
      icon: <FileText size={20} color={colors.tagGrayText} strokeWidth={1.9} />,
      chipBg: colors.tagGrayBg,
      title: '주보 — 괄호 채우기와 설교 메모',
      lines: [
        '홈의 「주보 보기」로 들어갑니다. 위쪽 날짜를 누르면 그 주일 주보가 열려요.',
        '설교 순서의 「성경말씀보기」를 누르면 그 주일 본문이 열리고, 「메모」 칸에 괄호 채우기·설교 메모·나눔 질문이 함께 있습니다.',
        '괄호를 누르고 답을 적으면, 괄호가 글자에 맞춰 저절로 넓어집니다.',
        '주일에는 맨 아래 「말씀」 › 「메모」에서도 같은 자리로 바로 가실 수 있습니다.',
        '적으신 내용은 이 전화기에만 저장되고 다른 분께 보이지 않습니다.',
        '더 지난 주보는 「지난 주보」에서 달별로 찾을 수 있습니다. 메모를 적어둔 날에는 날짜 옆에 ● 표시가 붙습니다.',
      ],
      figure: <FigBlank />,
      figureNote: '괄호 안에 글자를 넣으면 자동으로 넓이가 조절됩니다',
      go: { label: '주보 열기', to: '/bulletin' },
    },
    {
      key: 'media',
      icon: <Images size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '교회 미디어 — 사진과 영상',
      lines: [
        '홈의 「교회 미디어」로 들어가면 위에 「사진」과 「영상」이 있습니다.',
        '사진은 교회 홈페이지 사진첩에서, 영상은 교회 유튜브에서 저절로 들어옵니다.',
        '영상은 앱 안에서 재생되고, 왼쪽 위 ✕를 누르면 보던 목록으로 돌아옵니다.',
      ],
      figure: <FigTabs />,
      figureNote: '위쪽 「사진」·「영상」을 눌러 오갑니다',
      go: { label: '교회 미디어 열기', to: '/media' },
    },
    {
      key: 'calendar',
      icon: <CalendarDays size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '교회 달력',
      lines: [
        '홈의 「다가오는 일정」 오른쪽 「전체 달력 ›」을 누르면 이달 일정을 한눈에 보실 수 있습니다.',
      ],
      go: { label: '달력 열기', to: '/calendar' },
    },
    {
      key: 'pray',
      icon: <Text style={styles.prayEmoji}>🙏</Text>,
      chipBg: colors.tagGreenBg,
      title: '함께기도해요 — 목사님께 기도 부탁드리기',
      lines: [
        '더보기 메뉴 › 「함께기도해요」에서 기도 제목을 보내실 수 있습니다.',
        '목사님만 보십니다. 이름은 꼭 적어주세요.',
        '목사님이 기도를 시작하시면 「함께 기도 중」으로 바뀌고, 알림을 켜두셨으면 알려드립니다.',
      ],
      go: { label: '기도 제목 보내기', to: '/pray-request' },
    },
    {
      key: 'news',
      icon: <Bell size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '소식',
      lines: ['교회 공지와 교회 소식이 올라옵니다. 맨 아래 「소식」에서 보실 수 있어요.'],
      go: { label: '소식 보러 가기', to: '/news' },
    },
    {
      key: 'offering',
      icon: <HandCoins size={20} color={colors.tagGreenText} strokeWidth={1.9} />,
      chipBg: colors.tagGreenBg,
      title: '온라인 헌금',
      lines: ['홈의 「온라인 헌금」에서 헌금하시는 방법을 안내해 드립니다.'],
      go: { label: '헌금 안내 보기', to: '/offering' },
    },
    {
      key: 'push',
      icon: <BellRing size={20} color={colors.tagOrangeText} strokeWidth={1.9} />,
      chipBg: colors.tagOrangeBg,
      title: '알림 받기',
      lines: [
        '더보기 메뉴의 「알림 받기」를 켜시면 전화기가 물어봅니다. 「허용」을 눌러 주세요.',
        '켜신 뒤에는 「오늘의 말씀」과 「감사일기」를 각각 따로 켜고 끄실 수 있고, 받고 싶은 시각도 오전 8시·낮 12시 30분·저녁 7시 중 원하시는 대로 고르실 수 있습니다.',
        '교회의 긴급 공지는 알림을 켜두신 모든 분께 시각과 상관없이 바로 전해집니다.',
        '알림이 필요 없으시면 같은 자리에서 다시 끄시면 됩니다.',
      ],
      figure: <FigTopicTime />,
      figureNote: '알림 종류마다 받고 싶은 시각을 따로 고를 수 있어요',
    },
    {
      key: 'alerts',
      icon: <Bell size={20} color={colors.tagOrangeText} strokeWidth={1.9} />,
      chipBg: colors.tagOrangeBg,
      title: '알림 다시 보기',
      lines: [
        '홈 화면 오른쪽 위 종 모양을 누르면 그동안 받은 알림이 모여 있습니다.',
        '오늘의 말씀·감사일기·교회의 긴급 공지까지, 알림을 놓치거나 못 보고 지나치셨어도 여기서 다시 확인하고 눌러서 바로 열어보실 수 있습니다.',
      ],
      go: { label: '알림 열어보기', to: '/alerts' },
    },
    {
      key: 'install',
      icon: <SquarePlus size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '홈 화면에 추가하기',
      lines: [
        '전화기 첫 화면에 앱처럼 두시면 인터넷 주소를 칠 필요 없이 바로 열립니다.',
        '더보기 메뉴 › 「홈 화면에 추가하기」를 누르시면 쓰시는 전화기에 맞는 방법을 그림으로 안내해 드립니다.',
        '더보기 메뉴에 이 항목이 안 보이신다면 이미 첫 화면에 추가되어 있는 것입니다. 더 하실 일이 없습니다.',
      ],
    },
    {
      key: 'refresh',
      icon: <RefreshCw size={20} color={colors.tagGrayText} strokeWidth={1.9} />,
      chipBg: colors.tagGrayBg,
      title: '화면이 이상하거나 예전 그대로일 때',
      lines: [
        '이제는 새 판이 올라오면 앱이 스스로 최신으로 맞춥니다. 다른 앱을 쓰다 돌아오실 때 조용히 새로 불러옵니다(설교를 듣고 계실 때나 글을 쓰고 계실 때는 끊기지 않게 기다립니다).',
        '그래도 바뀐 것이 안 보이면 더보기 메뉴 › 「앱 새로고침」을 한 번 눌러 주세요.',
        '한참 만에 앱을 다시 여시면 어제 보던 깊숙한 화면이 아니라 홈으로 열립니다. 잠깐 다녀오신 경우에는 보던 자리를 그대로 지켜드려요.',
      ],
    },
    {
      key: 'memo',
      icon: <Download size={20} color={colors.tagGreenText} strokeWidth={1.9} />,
      chipBg: colors.tagGreenBg,
      title: '전화기를 바꾸실 때',
      lines: [
        '메모와 괄호 채우기는 그 전화기에만 저장됩니다.',
        '더보기 메뉴 › 「메모 백업/복원」에서 파일로 저장해 두시고, 새 전화기에서 같은 화면의 복원 버튼으로 되살리실 수 있습니다.',
      ],
    },
    {
      key: 'praise',
      icon: <Music size={20} color={colors.tagPurpleText} strokeWidth={1.9} />,
      chipBg: colors.tagPurpleBg,
      title: '찬양앱',
      lines: ['더보기 메뉴 › 「찬양앱」을 누르면 가사·악보를 확인할 수 있는 사이트로 이동합니다.'],
    },
  ];

  return (
    <View style={styles.screen}>
      <OverlayHeader
        title="앱 사용 안내서"
        right={
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="안내서 닫기"
          >
            <X size={22} color={colors.title} strokeWidth={2.1} />
          </Pressable>
        }
      />
      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 처음 여신 분을 위한 세 걸음 */}
        <View style={[styles.startCard, shadows.card]}>
          <Text style={styles.startTitle}>처음 오셨다면 이 세 가지만</Text>
          {[
            '맨 아래 다섯 개의 아이콘(홈·말씀·설교·소식·더보기)이 앱의 전부입니다. 눌러서 오가시면 됩니다.',
            '더보기 메뉴 › 「홈 화면에 추가하기」로 전화기 첫 화면에 두시면 다음부터 바로 열립니다.',
            '더보기 메뉴 › 「알림 받기」를 켜시면 매일 오늘의 말씀 알림이 옵니다.',
          ].map((t, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{t}</Text>
            </View>
          ))}
        </View>

        {topics.map((t) => (
          <View key={t.key} style={[styles.card, shadows.card]} onLayout={onCardLayout(t.key)}>
            <View style={styles.cardHead}>
              {chip(t.icon, t.chipBg)}
              <Text style={styles.cardTitle}>{t.title}</Text>
            </View>

            {t.lines.map((line, i) => (
              <View key={i} style={styles.lineRow}>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.line}>{line}</Text>
              </View>
            ))}

            {t.figure ? <Figure note={t.figureNote ?? ''}>{t.figure}</Figure> : null}
            {(t.figures ?? []).map((f, i) => (
              <Figure key={i} note={f.note}>
                {f.node}
              </Figure>
            ))}

            {t.go ? (
              <Pressable style={styles.goBtn} onPress={() => go(t.key, t.go!.to)} hitSlop={6}>
                <Text style={styles.goText}>{t.go.label} ›</Text>
              </Pressable>
            ) : null}
          </View>
        ))}

        {/* 안내서로도 안 풀리면 사람에게 */}
        <Pressable
          style={[styles.askCard, shadows.card]}
          onPress={() => router.push('/info/contact')}
        >
          <Text style={styles.askTitle}>그래도 잘 안 되시면</Text>
          <Text style={styles.askText}>
            「도움받기」에서 교회로 연락하실 수 있습니다. 편하게 물어봐 주세요.
          </Text>
          <Text style={styles.askLink}>도움받기 열기 ›</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },

  startCard: {
    backgroundColor: colors.tagBlueBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  startTitle: { fontFamily: font.extraBold, fontSize: 15.5, color: colors.title, marginBottom: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 10 },
  stepNum: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontFamily: font.bold, fontSize: 12, color: '#FFFFFF' },
  stepText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.body,
  },

  card: { backgroundColor: colors.card, borderRadius: 16, padding: 15, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  chip: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  prayEmoji: { fontSize: 19, lineHeight: 24 },
  cardTitle: { flex: 1, fontFamily: font.extraBold, fontSize: 15.5, color: colors.title },
  lineRow: { flexDirection: 'row', gap: 7, marginTop: 6 },
  dot: { fontFamily: font.bold, fontSize: 14.5, lineHeight: 23, color: colors.faint2 },
  line: { flex: 1, fontFamily: font.regular, fontSize: 14.5, lineHeight: 23, color: colors.body },
  goBtn: { marginTop: 12, alignSelf: 'flex-start' },
  goText: { fontFamily: font.bold, fontSize: 14, color: colors.primary },

  // 그림 조각
  figure: {
    marginTop: 12,
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  figureInner: { gap: 2 },
  figureNote: {
    marginTop: 9,
    fontFamily: font.medium,
    fontSize: 12,
    color: colors.faint,
    textAlign: 'center',
  },
  hereTag: {
    backgroundColor: '#C0392B',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'center',
  },
  hereText: { fontFamily: font.bold, fontSize: 11, color: '#FFFFFF' },

  quickRow: { flexDirection: 'row', gap: 7 },
  quickCell: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 11,
    paddingVertical: 9,
    alignItems: 'center',
    gap: 5,
  },
  quickChip: { width: 26, height: 26, borderRadius: 9 },
  quickLabel: { fontFamily: font.medium, fontSize: 10, color: colors.body },

  verseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  verseOn: { backgroundColor: '#FCEFC4' },
  verseNum: { fontFamily: font.bold, fontSize: 11, color: colors.faint, width: 11 },
  verseText: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: colors.body },

  blankRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  blankText: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 24, color: colors.body },
  // 주보의 실제 입력칸과 같은 모양 — 옅은 파란 바탕에 파란 밑줄
  blankEmpty: {
    width: 46,
    height: 20,
    marginHorizontal: 2,
    borderRadius: 4,
    backgroundColor: '#F0F6FD',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  blankFilled: {
    marginHorizontal: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: '#F0F6FD',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    fontFamily: font.bold,
    fontSize: 12.5,
    lineHeight: 20,
    color: colors.primary,
  },
  blankHereRow: { marginTop: 7, alignItems: 'center' },
  blankArrow: {
    marginTop: 6,
    marginBottom: 4,
    textAlign: 'center',
    fontSize: 14,
    color: colors.faint,
  },

  tabRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 10 },
  tabCell: { flex: 1, alignItems: 'center', paddingTop: 9 },
  tabOff: { fontFamily: font.medium, fontSize: 13, color: colors.faint, marginBottom: 7 },
  tabOn: { fontFamily: font.bold, fontSize: 13, color: colors.primary, marginBottom: 7 },
  tabLineOff: { height: 2.5, width: '100%', backgroundColor: 'transparent' },
  tabLineOn: { height: 2.5, width: '100%', backgroundColor: colors.primary },

  // 칸 이름 옆의 빨간 점(새로 올라온 것 표시)
  segLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  segDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#E5484D', marginTop: 1 },

  // 맨 아래 탭 막대 그림
  barRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 9,
  },
  barCell: { flex: 1, alignItems: 'center', gap: 5 },
  barIconWrap: { width: 22, height: 18, alignItems: 'center', justifyContent: 'center' },
  barIcon: { width: 17, height: 15, borderRadius: 4, backgroundColor: colors.tagGrayBg },
  barIconOn: { backgroundColor: colors.tagBlueBg },
  barDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E5484D',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  barLabel: { fontFamily: font.medium, fontSize: 10.5, color: colors.faint },
  barLabelOn: { fontFamily: font.bold, color: colors.primary },

  // 홈 카드의 「설교 듣기」와 진행 막대 그림
  playBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  playBtnText: { fontFamily: font.bold, fontSize: 13, color: '#FFFFFF' },
  playTrack: {
    marginTop: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(30,90,168,0.18)',
    overflow: 'hidden',
  },
  playFill: { width: '32%', height: 6, borderRadius: 3, backgroundColor: colors.primary },
  playUnder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  playTime: { fontFamily: font.medium, fontSize: 11.5, color: colors.muted },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.card,
    borderRadius: 11,
    padding: 10,
  },
  switchLabel: { fontFamily: font.bold, fontSize: 13, color: colors.title },
  switchSub: { fontFamily: font.regular, fontSize: 11, color: colors.faint, marginTop: 1 },
  switchOn: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 2.5,
  },
  switchKnob: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#FFFFFF' },
  timePillRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, flexWrap: 'wrap' },
  timePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  timePillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  timePillText: { fontFamily: font.medium, fontSize: 11, color: colors.faint },
  timePillTextOn: { color: '#FFFFFF' },

  askCard: { backgroundColor: colors.tagBlueBg, borderRadius: 16, padding: 16, marginTop: 4 },
  askTitle: { fontFamily: font.extraBold, fontSize: 15, color: colors.title },
  askText: {
    marginTop: 6,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.body,
  },
  askLink: { marginTop: 10, fontFamily: font.bold, fontSize: 14, color: colors.primary },
});
