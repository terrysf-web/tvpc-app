import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right.mjs';
import CircleQuestionMark from 'lucide-react-native/dist/esm/icons/circle-question-mark.mjs';
import Copyright from 'lucide-react-native/dist/esm/icons/copyright.mjs';
import Share2 from 'lucide-react-native/dist/esm/icons/share-2.mjs';
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { colors, font, shadows } from '../src/theme';

/** 앱 정보 — 더보기 화면의 '앱 공유하기'·'앱 사용 안내서'·'사진 출처' 세 항목을 한 화면으로 모았다. */
export default function AppInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onShare = () => {
    Share.share({
      message:
        '트라이밸리 장로교회 앱 — 매일 말씀과 교회 소식을 받아보세요.\nhttps://app.tvpc.church',
    }).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="앱 정보" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, shadows.card]}>
          <Pressable style={styles.row} onPress={onShare}>
            <View style={[styles.chip, { backgroundColor: colors.tagBlueBg }]}>
              <Share2 size={19} color={colors.primary} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>앱 공유하기</Text>
              <Text style={styles.sub}>가족·교우에게 앱 주소를 알려줘요</Text>
            </View>
            <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => router.push('/help')}>
            <View style={[styles.chip, { backgroundColor: colors.tagGreenBg }]}>
              <CircleQuestionMark size={19} color={colors.tagGreenText} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>앱 사용 안내서</Text>
              <Text style={styles.sub}>화면별로 어떻게 쓰는지 그림으로 안내해요</Text>
            </View>
            <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={() => router.push('/credits')}>
            <View style={[styles.chip, { backgroundColor: colors.tagOrangeBg }]}>
              <Copyright size={19} color={colors.tagOrangeText} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>출처 및 저작권</Text>
              <Text style={styles.sub}>성경 본문·배경 사진의 출처를 밝혀요</Text>
            </View>
            <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  chip: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  sub: { marginTop: 2, fontFamily: font.regular, fontSize: 12, color: colors.muted },
});
