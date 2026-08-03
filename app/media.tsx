import { useRouter } from 'expo-router';
import Images from 'lucide-react-native/dist/esm/icons/images.mjs';
import Play from 'lucide-react-native/dist/esm/icons/play.mjs';
import Video from 'lucide-react-native/dist/esm/icons/video.mjs';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { PhotoSlot } from '../src/components/PhotoSlot';
import { SegmentTabs } from '../src/components/SegmentTabs';
import { usePhotos, useSermons } from '../src/data/hooks';
import { playSermon, sermonThumb } from '../src/links';
import { colors, font, shadows } from '../src/theme';
import type { SermonDoc } from '../src/types';

type MediaTab = 'photo' | 'video';

const TABS: { key: MediaTab; label: string }[] = [
  { key: 'photo', label: '사진' },
  { key: 'video', label: '영상' },
];

function fmtDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * 교회 미디어 — 사진(홈페이지 사진 게시판 앨범)과 영상(교회 유튜브의
 * 찬양·행사 영상)을 한 곳에서 본다. 설교·팟캐스트는 설교 탭에 따로 있으므로
 * 여기서는 그 밖의 영상만 모은다.
 */
export default function MediaScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<MediaTab>('photo');
  const { photos, ready } = usePhotos();
  const { sermons, loading: videoLoading } = useSermons();

  // 설교·팟캐스트를 뺀 나머지(찬양·기타) — 성가대 찬양, 워십팀, 연주, 행사 영상
  const videos = sermons.filter((s) => s.category === 'praise' || s.category === 'etc');

  // 영상은 앱 안 재생기로 연다 — 유튜브 앱으로 넘기면 다 보고 닫았을 때
  // 유튜브에 남아 앱으로 돌아오지 못한다. (영상 주소가 없으면 예전대로)
  const openVideo = (v: SermonDoc) => {
    if (v.youtubeId) {
      router.push({ pathname: '/watch', params: { v: v.youtubeId, t: v.title } });
    } else {
      playSermon(v);
    }
  };

  // 앨범을 앱 안 사진첩으로 연다. 사진을 아직 못 가져온 앨범만 홈페이지로.
  const open = (p: { id: string; images?: string[]; url?: string | null; title: string }) => {
    if (p.images && p.images.length > 0) {
      router.push({ pathname: '/photo/[id]', params: { id: p.id } });
    } else if (p.url) {
      router.push({ pathname: '/browser', params: { url: p.url, t: p.title } });
    }
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="교회 미디어" />
      <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'photo' &&
          (!ready && photos.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
          ) : photos.length === 0 ? (
            <View style={[styles.card, shadows.card, styles.emptyCard]}>
              <Images size={26} color={colors.faint2} strokeWidth={1.7} />
              <Text style={styles.emptyText}>아직 등록된 사진이 없습니다.</Text>
            </View>
          ) : (
            <>
              {photos.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.card, shadows.imageCard]}
                  onPress={() => open(p)}
                >
                  <PhotoSlot uri={p.imageUrl} alt={p.title} style={styles.cover}>
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
                      {p.photoCount ? ` · 사진 ${p.photoCount}장` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <Text style={styles.hint}>교회 홈페이지 사진 게시판에서 자동으로 가져옵니다.</Text>
            </>
          ))}

        {tab === 'video' &&
          (videoLoading && videos.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
          ) : videos.length === 0 ? (
            <View style={[styles.card, shadows.card, styles.emptyCard]}>
              <Video size={26} color={colors.faint2} strokeWidth={1.7} />
              <Text style={styles.emptyText}>아직 등록된 영상이 없습니다.</Text>
            </View>
          ) : (
            <>
              {videos.map((v) => (
                <Pressable
                  key={v.id}
                  style={[styles.card, shadows.imageCard]}
                  onPress={() => openVideo(v)}
                >
                  <PhotoSlot uri={sermonThumb(v)} alt={v.title} tone="deep" style={styles.coverVideo}>
                    <View style={styles.playBtn}>
                      <Play size={17} color={colors.primary} fill={colors.primary} strokeWidth={0} />
                    </View>
                    {v.duration ? (
                      <View style={styles.durationBadge}>
                        <Text style={styles.durationText}>{v.duration}</Text>
                      </View>
                    ) : null}
                  </PhotoSlot>
                  <View style={styles.cardText}>
                    <Text style={styles.title} numberOfLines={2}>
                      {v.title}
                    </Text>
                    <Text style={styles.meta}>{fmtDate(v.date)}</Text>
                  </View>
                </Pressable>
              ))}
              <Text style={styles.hint}>교회 유튜브 채널에서 자동으로 가져옵니다.</Text>
            </>
          ))}
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
  emptyCard: { alignItems: 'center', paddingVertical: 30 },
  cover: { width: '100%', aspectRatio: 16 / 10 },
  // 유튜브 섬네일은 4:3에 검은 띠가 있는 그림이라, 16:9로 두면 띠만
  // 정확히 잘려 나가고 영상은 하나도 안 잘린다
  coverVideo: { width: '100%', aspectRatio: 16 / 9 },
  coverIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 섬네일에 제목이 박혀 있는 경우가 많아, 글씨를 가리지 않게 왼쪽 아래 구석에
  playBtn: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  durationBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(10,26,52,0.72)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  durationText: { fontFamily: font.bold, fontSize: 11.5, color: '#FFFFFF' },
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
