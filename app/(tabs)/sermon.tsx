import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { SegmentTabs } from '../../src/components/SegmentTabs';
import { useSermons } from '../../src/data/hooks';
import { playSermon, sermonThumb } from '../../src/links';
import { colors, font, scrim, shadows, textShadow } from '../../src/theme';
import type { SermonDoc } from '../../src/types';

type SermonTab = 'recent' | 'topic' | 'podcast';

const TABS: { key: SermonTab; label: string }[] = [
  { key: 'recent', label: '최근 설교' },
  // 말씀별 탭은 당분간 숨김 — 코드는 유지 (TABS에 다시 넣으면 복원)
  { key: 'podcast', label: '팟캐스트' },
];

/** 카테고리 없으면 설교로 간주 (구버전 데이터·샘플 호환) */
export function isSermon(s: SermonDoc): boolean {
  return (s.category ?? 'sermon') === 'sermon';
}



function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

/** "시편 23:1–6" → "시편" */
function scriptureBook(scripture: string): string {
  const book = scripture.replace(/\s*\d.*$/, '').trim();
  return book || '기타';
}

export default function SermonScreen() {
  const insets = useSafeAreaInsets();
  const { sermons: all } = useSermons();
  const [tab, setTab] = useState<SermonTab>('recent');

  // 설교 탭·말씀별 탭에는 설교만, 팟캐스트는 별도. 찬양·기타 영상은 표시하지 않음
  const sermons = all.filter(isSermon);
  const podcasts = all.filter((s) => s.category === 'podcast');

  const featured = sermons.find((s) => s.featured) ?? sermons[0];
  // 섬네일을 못 불러오면 카드가 텅 비지 않도록 제목을 대신 보여준다
  const featuredThumb = featured ? sermonThumb(featured) : null;
  const [featuredFailed, setFeaturedFailed] = useState(false);
  useEffect(() => setFeaturedFailed(false), [featuredThumb]);
  const showFeaturedText = !featuredThumb || featuredFailed;
  const rest = sermons.filter((s) => s !== featured);

  /** 말씀별 탭 — 성경책별 그룹 */
  const grouped = useMemo(() => {
    if (tab !== 'topic') return null;
    const map = new Map<string, SermonDoc[]>();
    for (const s of sermons) {
      const k = scriptureBook(s.scripture);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => {
      // 성경구절이 없는 "기타" 그룹은 항상 맨 아래
      if (a[0] === '기타') return 1;
      if (b[0] === '기타') return -1;
      return a[0].localeCompare(b[0], 'ko');
    });
  }, [tab, sermons]);

  const listItem = (s: SermonDoc) => (
    <Pressable key={s.id} style={[styles.item, shadows.card]} onPress={() => playSermon(s)}>
      <PhotoSlot uri={sermonThumb(s)} alt={s.title} tone="deep" style={styles.thumb}>
        {s.duration ? (
          <View style={styles.thumbBadge}>
            <Text style={styles.thumbBadgeText}>{s.duration}</Text>
          </View>
        ) : null}
      </PhotoSlot>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {s.title}
        </Text>
        <Text style={styles.itemMeta} numberOfLines={1}>
          {[s.scripture, fmtDate(s.date)].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.itemMeta2} numberOfLines={1}>
          {[s.service, s.preacher].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <Text style={styles.headerTitle}>설교</Text>
      </View>
      <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'recent' && featured && (
          <Pressable
            style={[styles.featuredWrap, shadows.imageCard]}
            onPress={() => playSermon(featured)}
          >
            <PhotoSlot
              uri={featuredThumb}
              alt={featured.title}
              tone="deep"
              style={styles.featured}
              onError={() => setFeaturedFailed(true)}
            >
              {/* 섬네일에 이미 제목·강사가 박혀 있어 같은 글씨를 덧씌우지 않는다.
                  섬네일이 없거나 못 불러왔을 때만 제목을 대신 보여준다. */}
              {showFeaturedText && (
                <>
                  <LinearGradient colors={[...scrim]} style={StyleSheet.absoluteFill} />
                  <View style={styles.featuredBottom}>
                    <Text style={styles.featuredTitle} numberOfLines={2}>
                      {featured.title}
                    </Text>
                    <Text style={styles.featuredMeta}>
                      {[featured.subtitle, featured.preacher].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </>
              )}
              {featured.duration ? (
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{featured.duration}</Text>
                </View>
              ) : null}
              <View
                style={[styles.playBtn, showFeaturedText ? styles.playBtnRight : styles.playBtnLeft]}
              >
                <Play size={19} color={colors.primary} fill={colors.primary} strokeWidth={0} />
              </View>
            </PhotoSlot>
          </Pressable>
        )}

        {tab === 'recent' && rest.map(listItem)}
        {tab === 'recent' && sermons.length === 0 && (
          <Text style={styles.empty}>등록된 설교가 아직 없습니다.</Text>
        )}

        {grouped?.map(([group, items]) => (
          <View key={group}>
            <Text style={styles.groupTitle}>{group}</Text>
            {items.map(listItem)}
          </View>
        ))}

        {tab === 'podcast' && podcasts.map(listItem)}
        {tab === 'podcast' && podcasts.length === 0 && (
          <Text style={styles.empty}>등록된 말씀 팟캐스트가 아직 없습니다.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  header: {
    backgroundColor: colors.card,
    alignItems: 'center',
    paddingBottom: 12,
  },
  headerTitle: { fontFamily: font.bold, fontSize: 17, color: colors.title },
  content: { padding: 16, gap: 12, paddingBottom: 28 },

  featuredWrap: { borderRadius: 18, marginBottom: 4 },
  // 유튜브 섬네일(4:3에 검은 띠)을 16:9로 담으면 띠만 잘리고 영상은 온전히 보인다
  featured: { borderRadius: 18, aspectRatio: 16 / 9, justifyContent: 'flex-end' },
  // 섬네일 글씨를 가리지 않게 아래 구석에 — 섬네일이 보일 때는 인물 쪽인
  // 왼쪽, 제목을 대신 얹을 때는 그 글씨를 피해 오른쪽
  playBtn: {
    position: 'absolute',
    bottom: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  playBtnLeft: { left: 12 },
  playBtnRight: { right: 12 },
  // 재생 단추(아래 구석)·제목과 겹치지 않게 위쪽 구석으로
  durationBadge: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: 'rgba(10,20,38,0.72)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  durationText: { fontFamily: font.bold, fontSize: 11, color: '#FFFFFF' },
  featuredBottom: { padding: 14 },
  featuredTitle: { fontFamily: font.extraBold, fontSize: 15.5, color: '#FFFFFF', ...textShadow },
  featuredMeta: {
    marginTop: 3,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.85)',
    ...textShadow,
  },

  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.faint,
  },
  groupTitle: {
    fontFamily: font.extraBold,
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
    marginBottom: 10,
  },

  item: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    marginBottom: 0,
  },
  thumb: { width: 96, height: 54, borderRadius: 10 },
  thumbBadge: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    backgroundColor: 'rgba(10,20,38,0.72)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  thumbBadgeText: { fontFamily: font.bold, fontSize: 9.5, color: '#FFFFFF' },
  itemTitle: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  itemMeta: { marginTop: 3, fontFamily: font.medium, fontSize: 12, color: colors.muted2 },
  itemMeta2: { marginTop: 1, fontFamily: font.regular, fontSize: 12, color: colors.faint },
});
