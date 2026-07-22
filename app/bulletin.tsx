import { useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';
import React from 'react';
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
import { useLatestBulletin } from '../src/data/bulletin';
import { useNews } from '../src/data/hooks';
import { firebaseEnabled } from '../src/firebase';
import { colors, font, shadows } from '../src/theme';

function fmtKo(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/**
 * 주보 뷰어 — 관리자가 올린 페이지 이미지를 전화기 화면 폭에 맞춰 한 장씩 보여준다.
 * 인쇄물 QR 코드(happytvpc.web.app/bulletin)로 누구나 열 수 있는 공개 화면.
 * 아직 이미지 주보가 없으면 홈페이지 주보 게시글로 안내한다.
 */
export default function BulletinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { bulletin, loading } = useLatestBulletin(firebaseEnabled);
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
      <OverlayHeader title={bulletin ? `주보 · ${fmtKo(bulletin.date)}` : '주보'} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : bulletin ? (
        <ScrollView
          contentContainerStyle={[styles.pages, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {bulletin.pages.map((p, i) => (
            <View key={i} style={[styles.pageWrap, shadows.card]}>
              <Image
                source={{ uri: p.image }}
                style={{ width: pageWidth, height: pageWidth * (p.h / p.w), borderRadius: 10 }}
                resizeMode="contain"
              />
              <Text style={styles.pageNum}>
                {i + 1} / {bulletin.pages.length}
              </Text>
            </View>
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
