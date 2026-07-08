import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { SegmentTabs } from '../../src/components/SegmentTabs';
import { useSermons } from '../../src/data/hooks';
import { openExternal, sermonThumb, sermonVideoUrl } from '../../src/links';
import { colors, font, scrim, shadows, textShadow } from '../../src/theme';
import type { SermonDoc } from '../../src/types';

type SermonTab = 'recent' | 'topic' | 'podcast';

const TABS: { key: SermonTab; label: string }[] = [
  { key: 'recent', label: '최근 설교' },
  { key: 'topic', label: '말씀별' },
  { key: 'podcast', label: '팟캐스트' },
];

/** 카테고리 없으면 설교로 간주 (구버전 데이터·샘플 호환) */
export function isSermon(s: SermonDoc): boolean {
  return (s.category ?? 'sermon') === 'sermon';
}

function openSermon(s: SermonDoc) {
  // 개별 영상 ID가 있으면 해당 영상, 없으면 교회 유튜브 채널로
  openExternal(sermonVideoUrl(s));
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
  const rest = sermons.filter((s) => s !== featured);

  /** 말씀별 탭 — 성경책별 그룹 */
  const grouped = useMemo(() => {
    if (tab !== 'topic') return null;
    const map = new Map<string, SermonDoc[]>();
    for (const s of sermons) {
      const k = scriptureBook(s.scripture);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [tab, sermons]);

  const listItem = (s: SermonDoc) => (
    <Pressable key={s.id} style={[styles.item, shadows.card]} onPress={() => openSermon(s)}>
      <PhotoSlot uri={sermonThumb(s)} tone="deep" style={styles.thumb}>
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
          <View style={[styles.featuredWrap, shadows.imageCard]}>
            <PhotoSlot uri={sermonThumb(featured)} tone="deep" style={styles.featured}>
              <LinearGradient colors={[...scrim]} style={StyleSheet.absoluteFill} />
              <Pressable style={styles.playBtn} onPress={() => openSermon(featured)} hitSlop={8}>
                <Play size={22} color={colors.primary} fill={colors.primary} strokeWidth={0} />
              </Pressable>
              {featured.duration ? (
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{featured.duration}</Text>
                </View>
              ) : null}
              <View style={styles.featuredBottom}>
                <Text style={styles.featuredTitle} numberOfLines={2}>
                  {featured.title}
                </Text>
                <Text style={styles.featuredMeta}>
                  {[featured.subtitle, featured.preacher].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </PhotoSlot>
          </View>
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
  featured: { borderRadius: 18, height: 176, justifyContent: 'flex-end' },
  playBtn: {
    position: 'absolute',
    alignSelf: 'center',
    top: 88 - 27 - 14,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  durationBadge: {
    position: 'absolute',
    right: 12,
    bottom: 58,
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
  thumb: { width: 96, height: 60, borderRadius: 10 },
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
