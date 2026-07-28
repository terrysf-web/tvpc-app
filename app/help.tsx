import { useRouter } from 'expo-router';
import {
  Bell,
  BookOpen,
  CalendarDays,
  Download,
  FileText,
  HandCoins,
  HeartHandshake,
  Home,
  Images,
  Megaphone,
  Play,
  RefreshCw,
  SquarePlus,
  Star,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
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

/** 주보 — 괄호에 답을 적는 모습 */
function FigBlank() {
  return (
    <View>
      <Text style={styles.blankLine}>
        <Text>1. 온전한 그리스도인은 </Text>
        <Text style={styles.blankBox}> 기도하는 </Text>
        <Text> 사람입니다.</Text>
      </Text>
      <View style={styles.blankHintRow}>
        <Here label="여기에 적으면 칸이 늘어납니다" />
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

/** 더보기 — 알림 받기 스위치가 켜진 모습 */
function FigSwitch() {
  return (
    <View style={styles.switchRow}>
      <View style={[styles.chip, { backgroundColor: colors.tagBlueBg }]}>
        <Bell size={18} color={colors.primary} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>알림 받기</Text>
        <Text style={styles.switchSub}>매일 아침 말씀과 교회 긴급 공지</Text>
      </View>
      <View style={styles.switchOn}>
        <View style={styles.switchKnob} />
      </View>
      <Here />
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
  go?: { label: string; to: string };
}

/**
 * 앱 사용 안내서 — 앱을 쓰시는 교인들이 보는 안내.
 * 어르신도 따라 하실 수 있도록 누를 곳 이름을 그대로 적고,
 * 헷갈리기 쉬운 곳은 그림으로 보여준다. 새 기능이 생기면 한 꼭지를 더한다.
 */
export default function HelpScreen() {
  const router = useRouter();
  const go = (to: string) => router.push(to as never);

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
      key: 'word',
      icon: <BookOpen size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '말씀 — 읽고, 표시하고, 적어두기',
      lines: [
        '구절을 한 번 누르면 형광펜이 켜지고, 그 구절이 아래 메모장으로 옮겨집니다.',
        '한 번 더 누르면 형광펜과 메모장 속 구절이 함께 지워집니다.',
        '위쪽 별표(★)를 누르면 그 말씀이 저장됩니다. 적어둔 메모와 형광펜도 같이 보관돼요.',
      ],
      figure: <FigVerse />,
      figureNote: '구절을 누르면 이렇게 표시됩니다',
      go: { label: '말씀 보러 가기', to: '/word' },
    },
    {
      key: 'saved',
      icon: <Star size={20} color={colors.tagOrangeText} strokeWidth={1.9} />,
      chipBg: colors.tagOrangeBg,
      title: '저장한 말씀 다시 보기',
      lines: [
        '말씀 화면 아래쪽 「저장한 말씀 보기」를 누르시면 그동안 별표 해두신 말씀이 모여 있습니다.',
        '그때 적어두신 메모도 함께 남아 있습니다.',
      ],
      go: { label: '저장한 말씀 열기', to: '/saved' },
    },
    {
      key: 'sermon',
      icon: <Play size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '설교 — 지난 설교 다시 보기',
      lines: [
        '맨 위가 가장 최근 설교이고, 아래로 지난 설교가 이어집니다.',
        '누르면 유튜브에서 재생됩니다. 다 보신 뒤에는 화면 왼쪽 위 「◀ TVPC」를 눌러 앱으로 돌아오세요.',
        '위쪽 「팟캐스트」를 누르시면 말씀 묵상 음성이 모여 있습니다.',
      ],
      go: { label: '설교 보러 가기', to: '/sermon' },
    },
    {
      key: 'bulletin',
      icon: <FileText size={20} color={colors.tagGrayText} strokeWidth={1.9} />,
      chipBg: colors.tagGrayBg,
      title: '주보 — 괄호 채우기와 설교 메모',
      lines: [
        '홈의 「주보 보기」로 들어갑니다. 위쪽 날짜를 누르면 그 주일 주보가 열려요.',
        '설교 노트의 괄호에 답을 적으면 칸이 글자에 맞춰 저절로 늘어납니다.',
        '적으신 내용은 이 전화기에만 저장되고 다른 분께 보이지 않습니다.',
        '더 지난 주보는 「지난 주보」에서 달별로 찾을 수 있습니다.',
      ],
      figure: <FigBlank />,
      figureNote: '괄호를 누르고 답을 적으시면 됩니다',
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
      icon: <HeartHandshake size={20} color={colors.tagGreenText} strokeWidth={1.9} />,
      chipBg: colors.tagGreenBg,
      title: '함께기도해요 — 목사님께 기도 부탁드리기',
      lines: [
        '더보기 › 함께기도해요에서 기도 제목을 보내실 수 있습니다.',
        '목사님만 보십니다. 이름을 비워두면 익명으로 전해집니다.',
        '목사님이 기도를 시작하시면 「함께 기도 중」으로 바뀌고, 알림을 켜두셨으면 알려드립니다.',
      ],
      go: { label: '기도 제목 보내기', to: '/pray-request' },
    },
    {
      key: 'news',
      icon: <Megaphone size={20} color={colors.tagOrangeText} strokeWidth={1.9} />,
      chipBg: colors.tagOrangeBg,
      title: '소식',
      lines: ['교회 공지와 선교 소식이 올라옵니다. 맨 아래 「소식」에서 보실 수 있어요.'],
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
      icon: <Bell size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '알림 받기',
      lines: [
        '더보기 화면의 「알림 받기」를 켜시면 매일 아침 말씀과 교회 긴급 공지를 받아보실 수 있습니다.',
        '전화기가 물어보면 「허용」을 눌러 주세요.',
        '알림이 필요 없으시면 같은 자리에서 다시 끄시면 됩니다.',
      ],
      figure: <FigSwitch />,
      figureNote: '더보기 화면에 있는 「알림 받기」',
    },
    {
      key: 'install',
      icon: <SquarePlus size={20} color={colors.primary} strokeWidth={1.9} />,
      chipBg: colors.tagBlueBg,
      title: '홈 화면에 추가하기',
      lines: [
        '전화기 첫 화면에 앱처럼 두시면 인터넷 주소를 칠 필요 없이 바로 열립니다.',
        '더보기 › 「홈 화면에 추가하기」를 누르시면 쓰시는 전화기에 맞는 방법을 그림으로 안내해 드립니다.',
      ],
    },
    {
      key: 'refresh',
      icon: <RefreshCw size={20} color={colors.tagGrayText} strokeWidth={1.9} />,
      chipBg: colors.tagGrayBg,
      title: '화면이 이상하거나 예전 그대로일 때',
      lines: [
        '더보기 › 「앱 새로고침」을 한 번 눌러 주세요. 최신 내용을 다시 불러옵니다.',
        '홈 화면에 추가한 앱은 예전 화면을 담아두고 쓰기 때문에, 바뀐 것이 안 보이면 이걸 눌러 주시면 됩니다.',
      ],
    },
    {
      key: 'memo',
      icon: <Download size={20} color={colors.tagGreenText} strokeWidth={1.9} />,
      chipBg: colors.tagGreenBg,
      title: '전화기를 바꾸실 때',
      lines: [
        '메모와 괄호 채우기는 그 전화기에만 저장됩니다.',
        '더보기 › 「내 메모 백업」으로 파일을 저장해 두시고, 새 전화기에서 「메모 가져오기」로 되살리실 수 있습니다.',
      ],
    },
  ];

  return (
    <View style={styles.screen}>
      <OverlayHeader title="앱 사용 안내서" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 처음 여신 분을 위한 세 걸음 */}
        <View style={[styles.startCard, shadows.card]}>
          <Text style={styles.startTitle}>처음 오셨다면 이 세 가지만</Text>
          {[
            '맨 아래 다섯 개의 아이콘(홈·말씀·설교·소식·더보기)이 앱의 전부입니다. 눌러서 오가시면 됩니다.',
            '더보기 › 「홈 화면에 추가하기」로 전화기 첫 화면에 두시면 다음부터 바로 열립니다.',
            '더보기 › 「알림 받기」를 켜시면 매일 아침 말씀이 옵니다.',
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
          <View key={t.key} style={[styles.card, shadows.card]}>
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

            {t.go ? (
              <Pressable style={styles.goBtn} onPress={() => go(t.go!.to)} hitSlop={6}>
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

  blankLine: { fontFamily: font.regular, fontSize: 13, lineHeight: 26, color: colors.body },
  blankBox: {
    fontFamily: font.bold,
    color: colors.primary,
    backgroundColor: colors.tagBlueBg,
  },
  blankHintRow: { marginTop: 8, alignItems: 'center' },

  tabRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 10 },
  tabCell: { flex: 1, alignItems: 'center', paddingTop: 9 },
  tabOff: { fontFamily: font.medium, fontSize: 13, color: colors.faint, marginBottom: 7 },
  tabOn: { fontFamily: font.bold, fontSize: 13, color: colors.primary, marginBottom: 7 },
  tabLineOff: { height: 2.5, width: '100%', backgroundColor: 'transparent' },
  tabLineOn: { height: 2.5, width: '100%', backgroundColor: colors.primary },

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
