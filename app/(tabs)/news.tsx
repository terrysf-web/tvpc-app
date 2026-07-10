import { CalendarDays, FileText, Megaphone } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { SegmentTabs } from '../../src/components/SegmentTabs';
import { Tag } from '../../src/components/Tag';
import { useNews } from '../../src/data/hooks';
import { useRouter } from 'expo-router';
import { openExternal } from '../../src/links';
import { colors, font, shadows } from '../../src/theme';

type NewsTab = 'all' | 'notice' | 'event';

const TABS: { key: NewsTab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'notice', label: '공지' },
  { key: 'event', label: '행사' },
];

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

export default function NewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { news } = useNews();
  const [tab, setTab] = useState<NewsTab>('all');

  const filtered = tab === 'all' ? news : news.filter((n) => n.category === tab);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <Text style={styles.headerTitle}>소식</Text>
      </View>
      <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 && (
          <Text style={styles.empty}>등록된 소식이 아직 없습니다.</Text>
        )}
        {filtered.map((n) => (
          <Pressable
            key={n.id}
            style={[styles.card, shadows.card]}
            onPress={() => {
              if (!n.url) return;
              if (n.url.includes('tvpc.church')) {
                router.push({ pathname: '/browser', params: { url: n.url, t: n.title } });
              } else {
                openExternal(n.url);
              }
            }}
          >
            <View style={styles.textCol}>
              <Tag
                label={n.category === 'notice' ? '공지' : '행사'}
                tone={n.category === 'notice' ? 'blue' : 'orange'}
              />
              <Text style={styles.title} numberOfLines={2}>
                {n.title}
              </Text>
              <Text style={styles.date}>{fmtDate(n.date)}</Text>
            </View>
            <PhotoSlot uri={n.imageUrl} style={styles.thumb}>
              {!n.imageUrl && (
                <View style={styles.thumbIcon}>
                  {n.title.startsWith('주보') ? (
                    <FileText size={26} color={colors.muted} strokeWidth={1.6} />
                  ) : n.category === 'notice' ? (
                    <Megaphone size={26} color={colors.muted} strokeWidth={1.6} />
                  ) : (
                    <CalendarDays size={26} color={colors.muted} strokeWidth={1.6} />
                  )}
                </View>
              )}
            </PhotoSlot>
          </Pressable>
        ))}
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
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.faint,
  },

  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  textCol: { flex: 1, gap: 7 },
  title: { fontFamily: font.bold, fontSize: 14.5, lineHeight: 21, color: colors.title },
  date: { fontFamily: font.regular, fontSize: 12, color: colors.faint },
  thumb: { width: 74, height: 74, borderRadius: 12 },
  thumbIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
