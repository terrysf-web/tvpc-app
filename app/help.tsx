import { useRouter } from 'expo-router';
import {
  Bell,
  BookOpen,
  FileText,
  Download,
  HeartHandshake,
  Home,
  Images,
  Megaphone,
  Play,
  RefreshCw,
  SquarePlus,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { colors, font, shadows } from '../src/theme';

/** 도움말 한 꼭지 — 아이콘 · 제목 · 설명 여러 줄 */
interface Topic {
  key: string;
  icon: React.ReactNode;
  title: string;
  lines: string[];
}

const chip = (node: React.ReactNode, bg: string) => (
  <View style={[styles.chip, { backgroundColor: bg }]}>{node}</View>
);

/**
 * 앱 사용설명서 — 어르신도 따라 하실 수 있도록 화면 이름과 누를 곳을
 * 그대로 적는다. 새 기능이 생기면 여기에 한 꼭지를 더한다.
 */
export default function HelpScreen() {
  const router = useRouter();

  const topics: Topic[] = [
    {
      key: 'home',
      icon: chip(<Home size={20} color={colors.primary} strokeWidth={1.9} />, colors.tagBlueBg),
      title: '홈 — 오늘 무엇을 볼지',
      lines: [
        '맨 위 카드는 그날의 말씀입니다. 눌러서 본문 전체를 볼 수 있어요.',
        '주일에는 이 카드가 예배 안내로 바뀝니다. 오전에는 온라인예배 생중계로, 낮 12시 30분이 지나면 그 주일 예배 다시보기로 이어집니다.',
        '아래에는 다가오는 일정과 가장 최근 설교가 있습니다.',
      ],
    },
    {
      key: 'word',
      icon: chip(<BookOpen size={20} color={colors.primary} strokeWidth={1.9} />, colors.tagBlueBg),
      title: '말씀 — 읽고, 표시하고, 적어두기',
      lines: [
        '구절을 한 번 누르면 형광펜이 켜지고, 그 구절이 메모장에 옮겨집니다. 다시 누르면 지워집니다.',
        '별표를 누르면 그 말씀이 저장됩니다. 적어둔 메모와 형광펜도 함께 보관돼요.',
        '저장한 말씀은 아래 「저장한 말씀 보기」에서 다시 찾을 수 있습니다.',
      ],
    },
    {
      key: 'sermon',
      icon: chip(<Play size={20} color={colors.primary} strokeWidth={1.9} />, colors.tagBlueBg),
      title: '설교 — 지난 설교 다시 듣기',
      lines: [
        '맨 위가 가장 최근 설교이고, 아래로 지난 설교가 이어집니다.',
        '누르면 유튜브에서 재생됩니다. 다 보신 뒤에는 화면 왼쪽 위 「◀ TVPC」를 눌러 앱으로 돌아오세요.',
        '「팟캐스트」 칸에는 말씀 묵상 음성이 모여 있습니다.',
      ],
    },
    {
      key: 'bulletin',
      icon: chip(<FileText size={20} color={colors.tagGrayText} strokeWidth={1.9} />, colors.tagGrayBg),
      title: '주보 — 괄호 채우기와 설교 메모',
      lines: [
        '홈의 「주보 보기」로 들어갑니다. 위쪽 날짜를 누르면 그 주일 주보가 열려요.',
        '설교 노트의 괄호에 답을 적으면 칸이 글자에 맞춰 저절로 늘어납니다.',
        '적으신 내용은 이 전화기에만 저장되고 다른 분께 보이지 않습니다.',
        '더 지난 주보는 「지난 주보」에서 달별로 찾을 수 있습니다.',
      ],
    },
    {
      key: 'media',
      icon: chip(<Images size={20} color={colors.primary} strokeWidth={1.9} />, colors.tagBlueBg),
      title: '교회 미디어 — 사진과 영상',
      lines: [
        '홈의 「교회 미디어」로 들어가면 위에 「사진」과 「영상」 칸이 있습니다.',
        '사진은 교회 홈페이지 사진첩에서, 영상은 교회 유튜브에서 저절로 들어옵니다.',
        '영상은 앱 안에서 재생되고, 왼쪽 위 ✕를 누르면 보던 목록으로 돌아옵니다.',
      ],
    },
    {
      key: 'pray',
      icon: chip(
        <HeartHandshake size={20} color={colors.tagGreenText} strokeWidth={1.9} />,
        colors.tagGreenBg,
      ),
      title: '함께기도해요 — 목사님께 기도 부탁드리기',
      lines: [
        '더보기 › 함께기도해요에서 기도 제목을 보내실 수 있습니다.',
        '목사님만 보십니다. 이름을 비워두면 익명으로 전해집니다.',
        '목사님이 기도를 시작하시면 「함께 기도 중」으로 바뀌고, 알림을 켜두셨으면 알려드립니다.',
      ],
    },
    {
      key: 'news',
      icon: chip(
        <Megaphone size={20} color={colors.tagOrangeText} strokeWidth={1.9} />,
        colors.tagOrangeBg,
      ),
      title: '소식 · 온라인 헌금',
      lines: [
        '「소식」에는 교회 공지와 선교 소식이 올라옵니다.',
        '홈의 「온라인 헌금」에서 헌금 방법을 안내해 드립니다.',
      ],
    },
    {
      key: 'push',
      icon: chip(<Bell size={20} color={colors.primary} strokeWidth={1.9} />, colors.tagBlueBg),
      title: '알림 받기',
      lines: [
        '더보기 화면의 「알림 받기」를 켜시면 매일 아침 말씀과 교회 긴급 공지를 받아보실 수 있습니다.',
        '전화기가 물어보면 「허용」을 눌러 주세요.',
        '알림이 필요 없으시면 같은 자리에서 다시 끄시면 됩니다.',
      ],
    },
    {
      key: 'install',
      icon: chip(<SquarePlus size={20} color={colors.primary} strokeWidth={1.9} />, colors.tagBlueBg),
      title: '홈 화면에 추가하기',
      lines: [
        '전화기 첫 화면에 앱처럼 두시면 인터넷 주소를 칠 필요 없이 바로 열립니다.',
        '더보기 › 「홈 화면에 추가하기」를 누르시면 쓰시는 전화기에 맞는 방법을 그림으로 안내해 드립니다.',
      ],
    },
    {
      key: 'refresh',
      icon: chip(<RefreshCw size={20} color={colors.tagGrayText} strokeWidth={1.9} />, colors.tagGrayBg),
      title: '화면이 이상하거나 예전 그대로일 때',
      lines: [
        '더보기 › 「앱 새로고침」을 한 번 눌러 주세요. 최신 내용을 다시 불러옵니다.',
        '홈 화면에 추가한 앱은 예전 화면을 담아두고 쓰기 때문에, 바뀐 것이 안 보이면 이걸 눌러 주시면 됩니다.',
      ],
    },
    {
      key: 'memo',
      icon: chip(<Download size={20} color={colors.tagGreenText} strokeWidth={1.9} />, colors.tagGreenBg),
      title: '전화기를 바꾸실 때',
      lines: [
        '메모와 괄호 채우기는 그 전화기에만 저장됩니다.',
        '더보기 › 「내 메모 백업」으로 파일을 저장해 두시고, 새 전화기에서 「메모 가져오기」로 되살리실 수 있습니다.',
      ],
    },
  ];

  return (
    <View style={styles.screen}>
      <OverlayHeader title="앱 사용설명서" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          궁금하신 것을 찾아보세요. 아래 내용대로 눌러보시면 됩니다.
        </Text>

        {topics.map((t) => (
          <View key={t.key} style={[styles.card, shadows.card]}>
            <View style={styles.cardHead}>
              {t.icon}
              <Text style={styles.cardTitle}>{t.title}</Text>
            </View>
            {t.lines.map((line, i) => (
              <View key={i} style={styles.lineRow}>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.line}>{line}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* 도움말로도 안 풀리면 사람에게 */}
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
  lead: {
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginBottom: 14,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontFamily: font.extraBold, fontSize: 15.5, color: colors.title },
  lineRow: { flexDirection: 'row', gap: 7, marginTop: 6 },
  dot: { fontFamily: font.bold, fontSize: 14.5, lineHeight: 23, color: colors.faint2 },
  line: { flex: 1, fontFamily: font.regular, fontSize: 14.5, lineHeight: 23, color: colors.body },
  askCard: {
    backgroundColor: colors.tagBlueBg,
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
  },
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
