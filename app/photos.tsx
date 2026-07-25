import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { ZoomViewer } from '../src/components/ZoomViewer';
import { churchInfo } from '../src/churchInfo';
import { usePhotos } from '../src/data/hooks';
import { colors, font, shadows } from '../src/theme';
import type { PhotoDoc } from '../src/types';

/** "2026.03.15" */
function dateLabel(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.replace(/-/g, '.') : d;
}

/**
 * 사진 한 장 — memo로 고정해, 다른 묶음이 늘어나도 이미 그린 사진은
 * 다시 그리지 않는다(사진이 수백 장이 될 수 있다).
 */
const PhotoTile = React.memo(function PhotoTile({
  photo,
  size,
  onZoom,
}: {
  photo: PhotoDoc;
  size: number;
  onZoom: (p: PhotoDoc) => void;
}) {
  return (
    <Pressable onPress={() => onZoom(photo)}>
      <Image
        source={{ uri: photo.thumbUrl || photo.imageUrl }}
        style={[styles.tile, { width: size, height: size }]}
        resizeMode="cover"
      />
    </Pressable>
  );
});

/**
 * 교회 사진 — 홈페이지(tvpc.church)에 올라온 사진을 묶음(글·행사)별로 모아 본다.
 * 사진은 홈페이지에 그대로 두고 주소만 받아오므로 저장소 비용이 들지 않는다.
 * 탭하면 전체화면으로 크게 볼 수 있다(교우 앨범과 같은 뷰어).
 */
export default function PhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { photos, ready } = usePhotos();
  const [zoom, setZoom] = useState<PhotoDoc | null>(null);
  const onZoom = React.useCallback((p: PhotoDoc) => setZoom(p), []);
  const closeZoom = React.useCallback(() => setZoom(null), []);

  // 묶음(같은 글·행사)별로 모으고, 묶음 안에서는 등록 순서를 유지한다
  const groups = useMemo(() => {
    const byAlbum = new Map<string, { album: string; date: string; items: PhotoDoc[] }>();
    for (const p of photos) {
      const key = `${p.date}|${p.album}`;
      const g = byAlbum.get(key);
      if (g) g.items.push(p);
      else byAlbum.set(key, { album: p.album, date: p.date, items: [p] });
    }
    return [...byAlbum.values()];
  }, [photos]);

  // 3열 그리드 — 화면이 넓으면 카드 폭을 520까지만 키운다(앨범과 같은 기준)
  const contentWidth = Math.min(width, 520) - 32;
  const gap = 6;
  const tile = Math.floor((contentWidth - gap * 2) / 3);

  const openWebsite = () =>
    router.push({
      pathname: '/browser',
      params: { url: churchInfo.pages.photos, t: '교회 사진' },
    });

  return (
    <View style={styles.screen}>
      <OverlayHeader title="교회 사진" />

      {!ready ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : groups.length === 0 ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, shadows.card]}>
            <View style={styles.iconChip}>
              <Camera size={22} color={colors.primary} strokeWidth={1.9} />
            </View>
            <Text style={styles.cardTitle}>사진을 모으는 중입니다</Text>
            <Text style={styles.cardSub}>
              교회 홈페이지에 새 사진이 올라오면 이곳에 자동으로 모입니다.{'\n'}
              지금은 홈페이지에서 바로 보실 수 있습니다.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={openWebsite}>
              <Text style={styles.primaryBtnText}>홈페이지 사진 페이지 열기</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint}>사진을 탭하면 크게 볼 수 있습니다</Text>
          {groups.map((g) => (
            <View key={`${g.date}|${g.album}`} style={styles.group}>
              <Text style={styles.groupTitle} numberOfLines={2}>
                {g.album}
              </Text>
              <Text style={styles.groupDate}>{dateLabel(g.date)}</Text>
              <View style={[styles.grid, { gap }]}>
                {g.items.map((p) => (
                  <PhotoTile key={p.id} photo={p} size={tile} onZoom={onZoom} />
                ))}
              </View>
            </View>
          ))}
          <Pressable style={styles.webLink} onPress={openWebsite}>
            <Text style={styles.webLinkText}>홈페이지에서 더 보기 ›</Text>
          </Pressable>
        </ScrollView>
      )}

      {zoom && Platform.OS === 'web' && (
        <ZoomViewer
          src={zoom.imageUrl}
          caption={zoom.caption || zoom.album}
          onClose={closeZoom}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { paddingHorizontal: 16, paddingTop: 14, alignItems: 'center' },

  hint: {
    alignSelf: 'stretch',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.faint,
  },

  group: { width: '100%', maxWidth: 520, marginBottom: 22 },
  groupTitle: { fontFamily: font.bold, fontSize: 15.5, color: colors.title, letterSpacing: -0.2 },
  groupDate: {
    marginTop: 2,
    marginBottom: 9,
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.muted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { borderRadius: 10, backgroundColor: colors.divider },

  card: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 30,
    paddingHorizontal: 22,
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
  cardTitle: { fontFamily: font.bold, fontSize: 15.5, color: colors.title },
  cardSub: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 13.5, color: '#FFFFFF' },

  webLink: { alignSelf: 'center', marginTop: 2, marginBottom: 10, padding: 8 },
  webLinkText: { fontFamily: font.medium, fontSize: 13, color: colors.primary },
});
