import { useLocalSearchParams, useRouter } from 'expo-router';
import { ExternalLink, X } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../../src/components/OverlayHeader';
import { usePhotos } from '../../src/data/hooks';
import { openExternal } from '../../src/links';
import { colors, font } from '../../src/theme';

/** NextGEN 썸네일 주소 — .../gallery/<폴더>/<파일> → .../gallery/<폴더>/thumbs/thumbs_<파일> */
function thumbUrl(full: string): string {
  const i = full.lastIndexOf('/');
  if (i < 0) return full;
  return `${full.slice(0, i)}/thumbs/thumbs_${full.slice(i + 1)}`;
}

/** 격자 사진 한 칸 — 썸네일이 없으면 원본으로 대체 */
function GridPhoto({ uri, size, onPress }: { uri: string; size: number; onPress: () => void }) {
  const [src, setSrc] = useState(thumbUrl(uri));
  return (
    <Pressable onPress={onPress}>
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, backgroundColor: colors.tagGrayBg }}
        resizeMode="cover"
        onError={() => src !== uri && setSrc(uri)}
      />
    </Pressable>
  );
}

/** 앨범 사진첩 — 격자로 보고, 탭하면 전체화면으로 좌우로 넘겨본다 */
export default function PhotoAlbumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { photos, ready } = usePhotos();
  const { width, height } = useWindowDimensions();
  const album = photos.find((p) => p.id === id);

  const [viewer, setViewer] = useState<number | null>(null);
  const pagerRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const images = album?.images ?? [];
  const gap = 3;
  const cols = width >= 700 ? 4 : 3;
  const cell = Math.floor((Math.min(width, 520) - gap * (cols - 1)) / cols);

  const openAt = (i: number) => {
    setViewer(i);
    setPage(i);
    // 모달이 열린 뒤 해당 사진 위치로 이동
    setTimeout(() => pagerRef.current?.scrollTo({ x: i * width, animated: false }), 0);
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title={album?.title ?? '교회 사진'} />
      {!album ? (
        ready ? (
          <Text style={styles.note}>앨범을 찾을 수 없습니다.</Text>
        ) : (
          <ActivityIndicator style={{ marginTop: 50 }} color={colors.primary} />
        )
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
          <View style={[styles.grid, { gap }]}>
            {images.map((uri, i) => (
              <GridPhoto key={uri} uri={uri} size={cell} onPress={() => openAt(i)} />
            ))}
          </View>
          {images.length === 0 && (
            <Text style={styles.note}>이 앨범의 사진을 아직 가져오지 못했습니다.</Text>
          )}
          <Pressable
            style={styles.siteLink}
            onPress={() => album.url && openExternal(album.url)}
            hitSlop={6}
          >
            <ExternalLink size={15} color={colors.muted} strokeWidth={1.9} />
            <Text style={styles.siteLinkText}>교회 홈페이지에서 전체 보기</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* 전체화면 보기 — 좌우로 넘기면 다음 사진 */}
      <Modal visible={viewer !== null} transparent={false} animationType="fade">
        <View style={styles.viewer}>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / width))
            }
          >
            {images.map((uri) => (
              <View key={uri} style={{ width, height, justifyContent: 'center' }}>
                <Image
                  source={{ uri }}
                  style={{ width, height: height - 120 }}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>
          <Pressable
            style={[styles.closeBtn, { top: insets.top + 10 }]}
            onPress={() => setViewer(null)}
            hitSlop={10}
          >
            <X size={22} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
          <Text style={[styles.counter, { bottom: insets.bottom + 22 }]}>
            {page + 1} / {images.length}
          </Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingTop: 3,
  },
  note: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.faint,
  },
  siteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    padding: 8,
  },
  siteLinkText: { fontFamily: font.medium, fontSize: 13, color: colors.muted },

  viewer: { flex: 1, backgroundColor: '#000000' },
  closeBtn: {
    position: 'absolute',
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    alignSelf: 'center',
    fontFamily: font.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
});
