import { useRouter } from 'expo-router';
import BookOpen from 'lucide-react-native/dist/esm/icons/book-open.mjs';
import Download from 'lucide-react-native/dist/esm/icons/download.mjs';
import Play from 'lucide-react-native/dist/esm/icons/play.mjs';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useAdminAuth } from '../src/data/admin';
import { useRecentVerses } from '../src/data/hooks';
import { playSermonAudio, saveUrlToDevice } from '../src/links';
import { canManageSermonAudio } from '../src/roles';
import { colors, font, radius, shadows } from '../src/theme';

/** "2026-09-10" → "9월 10일 (목)" */
function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/**
 * 지난 새벽설교 — 홈 말씀 카드는 오늘 것 하나만 보여주므로, 어제 이전의
 * 말씀과 그날 설교 녹음은 이 목록에서 찾아 듣는다.
 *
 * 줄을 누르면 그날 말씀 전체(본문·묵상·메모)로 들어가고, 오른쪽 재생
 * 단추는 그 자리에서 바로 설교를 튼다. 설교가 없는 날은 단추가 안 나온다.
 */
export default function PastVersesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verses, ready } = useRecentVerses(60);
  // 설교 파일 내려받기는 목회자와 점검 계정에만 보인다 — 교인에게는 듣기만
  const { email, role } = useAdminAuth();
  const canSave = canManageSermonAudio(email, role);
  const withAudio = verses.filter((v) => !!v.sermonAudioUrl).length;

  return (
    <View style={styles.screen}>
      <OverlayHeader title="지난 새벽설교" />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {!ready && verses.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
        ) : verses.length === 0 ? (
          <View style={[styles.card, shadows.card, styles.empty]}>
            <BookOpen size={26} color={colors.faint2} strokeWidth={1.7} />
            <Text style={styles.emptyText}>아직 등록된 말씀이 없습니다.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              {withAudio > 0
                ? `설교 녹음이 있는 날은 ▶ 단추를 누르면 바로 들을 수 있습니다.`
                : `날짜를 누르면 그날 말씀 전체를 볼 수 있습니다.`}
            </Text>
            {verses.map((v) => (
              <View key={v.date} style={[styles.card, shadows.card, styles.row]}>
                <Pressable style={styles.rowMain} onPress={() => router.push(`/verse/${v.date}`)}>
                  <Text style={styles.rowDate}>{dateLabel(v.date)}</Text>
                  <Text style={styles.rowRef} numberOfLines={1}>
                    {v.reference}
                  </Text>
                  <Text style={styles.rowHero} numberOfLines={2}>
                    {v.heroText}
                  </Text>
                </Pressable>
                {!!v.sermonAudioUrl && canSave && (
                  <Pressable
                    style={styles.saveBtn}
                    hitSlop={8}
                    onPress={() =>
                      saveUrlToDevice(v.sermonAudioUrl as string, `설교 ${v.date}`)
                    }
                  >
                    <Download size={16} color={colors.primary} strokeWidth={2} />
                  </Pressable>
                )}
                {!!v.sermonAudioUrl && (
                  <Pressable
                    style={styles.playBtn}
                    hitSlop={8}
                    onPress={() => playSermonAudio(v.sermonAudioUrl, `${v.reference} 설교`)}
                  >
                    <Play size={16} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  hint: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.muted,
    marginBottom: 10,
  },
  card: { backgroundColor: colors.card, borderRadius: radius.card, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  rowMain: { flex: 1 },
  rowDate: { fontFamily: font.bold, fontSize: 13.5, color: colors.title },
  rowRef: { marginTop: 2, fontFamily: font.medium, fontSize: 12.5, color: colors.primary },
  rowHero: {
    marginTop: 4,
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
  },
  saveBtn: {
    marginLeft: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  playBtn: {
    marginLeft: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontFamily: font.regular, fontSize: 13, color: colors.faint },
});
