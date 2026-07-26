import { useLocalSearchParams, useRouter } from 'expo-router';
import { ExternalLink, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
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

/**
 * 확대·이동이 되는 사진 한 장 (웹).
 * 두 손가락으로 벌리면 확대, 두 번 톡 치면 확대/원래대로, 확대 상태에서는 끌어서 이동.
 * 확대 중에는 좌우 넘기기를 잠가 사진 안에서만 움직이게 한다.
 */
function ZoomableImage({
  uri,
  width,
  height,
  onZoomChange,
}: {
  uri: string;
  width: number;
  height: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const hostRef = useRef<View>(null);

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host || typeof document === 'undefined') return;

    const img = document.createElement('img');
    img.src = uri;
    img.draggable = false;
    img.style.cssText = `width:${width}px;height:${height}px;object-fit:contain;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;transform-origin:center center;`;
    host.appendChild(img);

    let scale = 1;
    let tx = 0;
    let ty = 0;
    let startDist = 0;
    let startScale = 1;
    let startMid = { x: 0, y: 0 };
    let startTx = 0;
    let startTy = 0;
    let panFrom: { x: number; y: number } | null = null;
    let lastTap = 0;

    const apply = () => {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      onZoomChange(scale > 1.01);
    };
    const clampPan = () => {
      const maxX = (width * (scale - 1)) / 2;
      const maxY = (height * (scale - 1)) / 2;
      tx = Math.max(-maxX, Math.min(maxX, tx));
      ty = Math.max(-maxY, Math.min(maxY, ty));
    };
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startScale = scale;
        startMid = mid(e.touches);
        startTx = tx;
        startTy = ty;
        e.preventDefault();
        return;
      }
      if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 300) {
          // 두 번 톡 — 확대/원래대로
          scale = scale > 1.01 ? 1 : 2.5;
          tx = 0;
          ty = 0;
          clampPan();
          apply();
          e.preventDefault();
        }
        lastTap = now;
        if (scale > 1.01) {
          panFrom = { x: e.touches[0].clientX - tx, y: e.touches[0].clientY - ty };
          e.preventDefault();
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        scale = Math.max(1, Math.min(4, startScale * (dist(e.touches) / startDist)));
        const m = mid(e.touches);
        tx = startTx + (m.x - startMid.x);
        ty = startTy + (m.y - startMid.y);
        clampPan();
        apply();
        e.preventDefault();
      } else if (e.touches.length === 1 && panFrom && scale > 1.01) {
        tx = e.touches[0].clientX - panFrom.x;
        ty = e.touches[0].clientY - panFrom.y;
        clampPan();
        apply();
        e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return;
      panFrom = null;
      startDist = 0;
      if (scale <= 1.01) {
        scale = 1;
        tx = 0;
        ty = 0;
        apply();
      }
    };

    host.addEventListener('touchstart', onStart, { passive: false });
    host.addEventListener('touchmove', onMove, { passive: false });
    host.addEventListener('touchend', onEnd);
    return () => {
      host.removeEventListener('touchstart', onStart);
      host.removeEventListener('touchmove', onMove);
      host.removeEventListener('touchend', onEnd);
      if (img.parentNode === host) host.removeChild(img);
      onZoomChange(false);
    };
  }, [uri, width, height, onZoomChange]);

  return <View ref={hostRef} style={{ width, height, alignItems: 'center', justifyContent: 'center' }} />;
}

/** 앨범 사진첩 — 격자로 보고, 탭하면 전체화면으로 넘겨보기·확대 */
export default function PhotoAlbumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { photos, ready } = usePhotos();
  const { width, height } = useWindowDimensions();
  const album = photos.find((p) => p.id === id);

  const [viewer, setViewer] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const pagerRef = useRef<ScrollView>(null);
  const pageRef = useRef(0);

  const images = album?.images ?? [];
  const gap = 3;
  const cols = width >= 700 ? 4 : 3;
  const cell = Math.floor((Math.min(width, 520) - gap * (cols - 1)) / cols);

  const openAt = (i: number) => {
    pageRef.current = i;
    setPage(i);
    setViewer(i);
  };

  // 화면이 열리거나 가로·세로가 바뀌면 보던 사진 위치를 다시 맞춘다
  useEffect(() => {
    if (viewer === null) return;
    const t = setTimeout(
      () => pagerRef.current?.scrollTo({ x: pageRef.current * width, animated: false }),
      0,
    );
    return () => clearTimeout(t);
  }, [viewer, width, height]);

  const onZoomChange = React.useCallback((z: boolean) => setZoomed(z), []);

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

      {/* 전체화면 보기 — 좌우로 넘기고, 두 손가락·두 번 톡으로 확대 */}
      <Modal visible={viewer !== null} transparent={false} animationType="fade">
        <View style={styles.viewer}>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / width);
              pageRef.current = i;
              setPage(i);
            }}
          >
            {images.map((uri) => (
              <View key={uri} style={{ width, height, justifyContent: 'center' }}>
                {Platform.OS === 'web' ? (
                  <ZoomableImage uri={uri} width={width} height={height} onZoomChange={onZoomChange} />
                ) : (
                  <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
                )}
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
          {!zoomed && (
            <Text style={[styles.counter, { bottom: insets.bottom + 18 }]}>
              {page + 1} / {images.length}
            </Text>
          )}
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 11,
    overflow: 'hidden',
  },
});
