import { useRouter } from 'expo-router';
import { Images } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { PhotoSlot } from '../src/components/PhotoSlot';
import { usePhotos } from '../src/data/hooks';
import { openExternal } from '../src/links';
import { colors, font, shadows } from '../src/theme';

function fmtDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

/** 교회 사진 — 홈페이지 '나눔 › 교회 사진' 게시판을 앨범 카드로 보여준다 */
export default function PhotosScreen() {
  const router = useRouter();
  const { photos, ready } = usePhotos();

  const open = (url?: string | null, title?: string) => {
    if (!url) return;
    if (url.includes('tvpc.church')) {
      router.push({ pathname: '/browser', params: { url, t: title ?? '교회 사진' } });
    } else {
      openExternal(url);
    }
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="교회 사진" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!ready && photos.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
        ) : photos.length === 0 ? (
          <View style={[styles.card, shadows.card, { alignItems: 'center', paddingVertical: 30 }]}>
            <Images size={26} color={colors.faint2} strokeWidth={1.7} />
            <Text style={styles.emptyText}>아직 등록된 사진이 없습니다.</Text>
          </View>
        ) : (
          photos.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.card, shadows.imageCard]}
              onPress={() => open(p.url, p.title)}
            >
              <PhotoSlot uri={p.imageUrl} style={styles.cover}>
                {!p.imageUrl && (
                  <View style={styles.coverIcon}>
                    <Images size={30} color={colors.muted} strokeWidth={1.6} />
                  </View>
                )}
              </PhotoSlot>
              <View style={styles.cardText}>
                <Text style={styles.title} numberOfLines={2}>
                  {p.title}
                </Text>
                <Text style={styles.meta}>
                  {fmtDate(p.date)}
                  {p.images && p.images.length > 1 ? ` · 사진 ${p.images.length}장` : ''}
                </Text>
              </View>
            </Pressable>
          ))
        )}
        <Text style={styles.hint}>교회 홈페이지 사진 게시판에서 자동으로 가져옵니다.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  cover: { width: '100%', aspectRatio: 16 / 10 },
  coverIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { padding: 14, gap: 5 },
  title: { fontFamily: font.bold, fontSize: 15, lineHeight: 22, color: colors.title },
  meta: { fontFamily: font.regular, fontSize: 12, color: colors.faint },
  emptyText: { marginTop: 8, fontFamily: font.regular, fontSize: 13, color: colors.muted },
  hint: {
    marginTop: 4,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 11.5,
    color: colors.faint,
  },
});
