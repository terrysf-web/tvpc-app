import { useLocalSearchParams, useRouter } from 'expo-router';
import Maximize from 'lucide-react-native/dist/esm/icons/maximize.mjs';
import X from 'lucide-react-native/dist/esm/icons/x.mjs';
import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePraiseVideos } from '../src/data/hooks';
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
  const { v, t, list } = useLocalSearchParams<{ v: string; t?: string; list?: string }>();
  const { width, height } = useWindowDimensions();
  const frameRef = useRef<HTMLElement | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // 재생목록이면 그 안 곡 목록을 보여줘 직접 골라 들을 수 있게 한다 —
  // 유튜브 임베드 재생기 자체엔 이런 선택 목록이 뜨지 않아 우리가 직접
  // 그려준다. praiseVideos에서 이 재생목록 문서를 찾아 목록을 꺼낸다.
  const { videos } = usePraiseVideos();
  const playlistDoc = list ? videos.find((p) => p.playlistId === list) : undefined;
  const entries = playlistDoc?.entries ?? [];

  // 곡을 직접 고르면 그 영상 하나만 확실히 재생한다(재생목록 문맥을
  // 다시 넘기면, 그 영상이 재생목록 소속이 아닐 때 엉뚱한 걸 재생하는
  // 문제가 있었다). 안 고르면 재생목록 첫 곡부터 자동재생.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const currentVideoId = pickedId ?? v;

  // 곡을 고르면 iframe의 src를 통째로 바꾸지 않고(다시 불러오면 자동재생이
  // 브라우저에 막힐 수 있다), 이미 떠 있는 재생기에 유튜브 postMessage
  // 명령(loadVideoById)만 보내 그 자리에서 바로 이어서 재생한다.
  const pickSong = (id: string) => {
    setPickedId(id);
    const win = (frameRef.current as unknown as { contentWindow?: Window } | null)?.contentWindow;
    win?.postMessage(JSON.stringify({ event: 'command', func: 'loadVideoById', args: [id] }), '*');
  };

  // 화면을 꽉 채우되 영상 비율(16:9)은 유지 — 가로가 좁으면 폭 기준, 넓으면 높이 기준
  const avail = { w: width, h: Math.max(height - insets.top - insets.bottom - 96, 180) };
  const byWidth = { w: avail.w, h: (avail.w * 9) / 16 };
  const size = byWidth.h <= avail.h ? byWidth : { w: (avail.h * 16) / 9, h: avail.h };

  // 재생목록으로 들어왔으면(아직 곡을 직접 안 골랐으면) 그 영상의 watch
  // 주소(list 포함)를 써야 유튜브 앱/사이트에서도 같은 재생목록으로 열린다.
  const externalUrl = `https://www.youtube.com/watch?v=${currentVideoId}${list && !pickedId ? `&list=${list}` : ''}`;

  useEffect(() => {
    if (Platform.OS !== 'web' && v) {
      openExternal(externalUrl);
    }
  }, [v, list, pickedId]);

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
              // v는 항상 그 재생목록의 첫 곡 ID(sync-praise.mjs가
              // entries[0]와 같은 값으로 저장) — "videoseries"만 넘겼을
              // 때보다 특정 영상 ID를 같이 주는 단일 영상 임베드가
              // 자동재생이 더 확실히 되어 이 형태를 쓴다. list는 그대로
              // 붙여 재생목록 문맥(다음 곡 이어재생)은 유지한다. 곡을
              // 고르면(pickSong) 이 src를 다시 바꾸는 게 아니라
              // postMessage 명령으로 그 자리에서 곡만 바꾼다 —
              // enablejsapi·origin은 그 명령을 재생기가 받아주는 데 필요.
              src: `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(origin)}${list ? `&list=${list}` : ''}`,
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
        {entries.length > 0 ? (
          <ScrollView style={styles.songList} contentContainerStyle={styles.songListContent}>
            {entries.map((e) => {
              const active = e.id === currentVideoId;
              return (
                <Pressable
                  key={e.id}
                  style={[styles.songItem, active && styles.songItemActive]}
                  onPress={() => pickSong(e.id)}
                >
                  <Text
                    style={[styles.songItemText, active && styles.songItemTextActive]}
                    numberOfLines={1}
                  >
                    {e.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {/* 영상에 따라 앱 안 재생이 막혀 있을 수 있어(저작권 설정),
            그럴 때 유튜브로 넘어갈 수 있는 길을 항상 남겨 둔다 */}
        {Platform.OS === 'web' && v ? (
          <Pressable style={styles.ytLinkBtn} onPress={() => openExternal(externalUrl)} hitSlop={8}>
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
  songList: { maxHeight: 160, marginTop: 12, marginHorizontal: 18 },
  songListContent: { gap: 4, paddingBottom: 2 },
  songItem: { borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  songItemActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  songItemText: { fontFamily: font.medium, fontSize: 13.5, color: 'rgba(255,255,255,0.72)' },
  songItemTextActive: { fontFamily: font.bold, color: '#FFFFFF' },
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
