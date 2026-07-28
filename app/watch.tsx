import { useLocalSearchParams, useRouter } from 'expo-router';
import { Maximize, X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openExternal } from '../src/links';
import { font } from '../src/theme';

/**
 * 설교 영상 재생 — 앱 안 전체화면 보기.
 * 검은 화면에 영상이 가득 차고, 가로로 돌리면 화면 전체를 채운다.
 * 우상단 버튼으로 기기 전체화면(웹 표준)도 요청할 수 있다.
 * 네이티브 앱에서는 유튜브 앱/브라우저로 연결.
 */
export default function WatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { v, t } = useLocalSearchParams<{ v: string; t?: string }>();
  const { width, height } = useWindowDimensions();
  const frameRef = useRef<HTMLElement | null>(null);

  // 화면을 꽉 채우되 영상 비율(16:9)은 유지 — 가로가 좁으면 폭 기준, 넓으면 높이 기준
  const avail = { w: width, h: Math.max(height - insets.top - insets.bottom - 96, 180) };
  const byWidth = { w: avail.w, h: (avail.w * 9) / 16 };
  const size = byWidth.h <= avail.h ? byWidth : { w: (avail.h * 16) / 9, h: avail.h };

  useEffect(() => {
    if (Platform.OS !== 'web' && v) {
      openExternal(`https://www.youtube.com/watch?v=${v}`);
    }
  }, [v]);

  // 기기 전체화면 — 안드로이드·컴퓨터에서 동작. 아이폰은 재생기 안 전체화면 버튼을 쓴다.
  const goFullscreen = () => {
    const el = frameRef.current as (HTMLElement & {
      webkitRequestFullscreen?: () => void;
      webkitEnterFullscreen?: () => void;
    }) | null;
    if (!el) return;
    (el.requestFullscreen?.() as Promise<void> | undefined)?.catch(() => {});
    el.webkitRequestFullscreen?.();
    el.webkitEnterFullscreen?.();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.playerArea, { paddingTop: insets.top }]}>
        {Platform.OS === 'web' && v ? (
          <View style={{ width: size.w, height: size.h, backgroundColor: '#000' }}>
            {React.createElement('iframe' as never, {
              ref: (el: HTMLElement | null) => {
                frameRef.current = el;
              },
              src: `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&playsinline=1&rel=0&modestbranding=1`,
              style: { width: '100%', height: '100%', border: 0, display: 'block' },
              allow:
                'accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share',
              allowFullScreen: true,
              title: t || '설교 영상',
            } as never)}
          </View>
        ) : (
          <Text style={styles.note}>영상을 여는 중입니다…</Text>
        )}
      </View>

      <View style={{ marginBottom: insets.bottom + 12 }}>
        {t ? (
          <Text style={styles.title} numberOfLines={2}>
            {t}
          </Text>
        ) : null}
        {/* 영상에 따라 앱 안 재생이 막혀 있을 수 있어(저작권 설정),
            그럴 때 유튜브로 넘어갈 수 있는 길을 항상 남겨 둔다 */}
        {Platform.OS === 'web' && v ? (
          <Pressable
            style={styles.ytLinkBtn}
            onPress={() => openExternal(`https://www.youtube.com/watch?v=${v}`)}
            hitSlop={8}
          >
            <Text style={styles.ytLinkText}>유튜브에서 보기 ›</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 닫기 · 전체화면 — 영상 위에 떠 있는 버튼 */}
      <Pressable
        style={[styles.iconBtn, { top: insets.top + 8, left: 12 }]}
        onPress={() => router.back()}
        hitSlop={10}
      >
        <X size={20} color="#FFFFFF" strokeWidth={2.2} />
      </Pressable>
      {Platform.OS === 'web' && v ? (
        <Pressable
          style={[styles.iconBtn, { top: insets.top + 8, right: 12 }]}
          onPress={goFullscreen}
          hitSlop={10}
        >
          <Maximize size={19} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000', justifyContent: 'center' },
  playerArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: {
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 18,
    textAlign: 'center',
  },
  note: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.6)',
  },
  ytLinkBtn: { marginTop: 10, alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14 },
  ytLinkText: { fontFamily: font.medium, fontSize: 13, color: 'rgba(255,255,255,0.62)' },
  iconBtn: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
