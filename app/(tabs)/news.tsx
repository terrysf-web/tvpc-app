import CalendarDays from 'lucide-react-native/dist/esm/icons/calendar-days.mjs';
import FileText from 'lucide-react-native/dist/esm/icons/file-text.mjs';
import Megaphone from 'lucide-react-native/dist/esm/icons/megaphone.mjs';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoSlot } from '../../src/components/PhotoSlot';
import { SegmentTabs } from '../../src/components/SegmentTabs';
import { Tag } from '../../src/components/Tag';
import { useEvents, useNews } from '../../src/data/hooks';
import { useNewsBanner } from '../../src/newsBanner';
import { useRouter } from 'expo-router';
import { openExternal } from '../../src/links';
import { colors, font, shadows } from '../../src/theme';

type NewsTab = 'notice' | 'event' | 'schedule';

const TABS: { key: NewsTab; label: string }[] = [
  { key: 'notice', label: '공지' },
  { key: 'event', label: '행사' },
  { key: 'schedule', label: '일정' },
];

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

/** 관리자가 올린 소식 배너의 원본 가로세로 비율 — 정사각형으로 잘라내지 않고
 * 올린 사진의 넓이 그대로 보여주기 위해 필요하다. */
function useAspectRatio(uri: string | null): number | null {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!uri) {
      setRatio(null);
      return;
    }
    let on = true;
    Image.getSize(
      uri,
      (w, h) => on && h > 0 && setRatio(w / h),
      () => on && setRatio(null),
    );
    return () => {
      on = false;
    };
  }, [uri]);
  return ratio;
}

export default function NewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { news } = useNews();
  const { events } = useEvents();
  // 관리자가 올린 소식 배너 — 교회 소식(주보 게시판) 카드의 썸네일로 쓴다
  const banner = useNewsBanner();
  // 정사각형으로 잘라내지 않고 올린 사진의 넓이 그대로 보여준다
  const bannerRatio = useAspectRatio(banner);
  const [tab, setTab] = useState<NewsTab>('notice');

  // 공지는 최근 게시순(이미 news 쿼리가 desc) 그대로, 행사는 각 행사 날짜(date)가
  // 게시일이 아니라 행사 자체 일자라 가까운 행사가 위로 오게 따로 오름차순 정렬한다.
  const filtered = news
    .filter((n) => n.category === (tab === 'event' ? 'event' : 'notice'))
    .sort((a, b) => (tab === 'event' ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : 0));

  // 일정 탭 — 교회 달력 전체(행사 페이지에 있는 행사는 행사 탭에 있으므로 제외)
  const schedule = events
    .filter((e) => !(e.url && e.url.includes('/event/')))
    .sort((a, b) => ((a.sortKey ?? a.dateLabel) < (b.sortKey ?? b.dateLabel) ? -1 : 1));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <Text style={styles.headerTitle}>소식</Text>
        <Pressable
          style={[styles.calBtn, { top: Math.max(insets.top, 20) + 5 }]}
          hitSlop={8}
          onPress={() => router.push('/calendar')}
        >
          <CalendarDays size={21} color={colors.title} strokeWidth={1.8} />
        </Pressable>
      </View>
      <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'schedule' ? (
          schedule.length === 0 ? (
            <Text style={styles.empty}>다가오는 일정이 아직 없습니다.</Text>
          ) : (
            <View style={[styles.scheduleCard, shadows.card]}>
              {schedule.map((e, i) => (
                <Pressable
                  key={e.id}
                  style={[styles.scheduleRow, i < schedule.length - 1 && styles.scheduleDivider]}
                  onPress={() => router.push('/calendar')}
                >
                  <View style={styles.scheduleDateChip}>
                    <Text style={styles.scheduleDateText}>
                      {e.dateLabel.split(' ')[0]}
                    </Text>
                    <Text style={styles.scheduleDaySub}>
                      {(e.dateLabel.split(' ')[1] ?? '').slice(0, 1)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scheduleTitle}>{e.title}</Text>
                    {e.detail ? <Text style={styles.scheduleDetail}>{e.detail}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )
        ) : (
          <>
            {filtered.length === 0 && (
              <Text style={styles.empty}>등록된 소식이 아직 없습니다.</Text>
            )}
            {filtered.map((n) => {
              // 교회 소식 카드는 관리자가 올린 배너를 우선 사용 —
              // 홈페이지 이미지 주소는 앱에서 안 열려 빈 박스가 되는 경우가 있다
              const isChurchNews = n.title.startsWith('교회 소식') || n.title.startsWith('주보');
              const thumbUri = isChurchNews && banner ? banner : n.imageUrl;
              return (
              <Pressable
                key={n.id}
                style={[styles.card, shadows.card]}
                onPress={() => {
                  if (!n.url) return;
                  if (n.url.startsWith('/')) {
                    // 주보에서 가져온 소식 — 앱 안의 주보 화면으로 바로 이동
                    router.push(n.url as Parameters<typeof router.push>[0]);
                  } else if (n.url.includes('tvpc.church')) {
                    router.push({ pathname: '/browser', params: { url: n.url, t: n.title } });
                  } else {
                    openExternal(n.url);
                  }
                }}
              >
                <View style={styles.textCol}>
                  <Tag
                    label={n.alert ? '긴급' : n.category === 'notice' ? '공지' : '행사'}
                    tone={n.alert || n.category !== 'notice' ? 'orange' : 'blue'}
                  />
                  <Text style={styles.title} numberOfLines={2}>
                    {n.title}
                  </Text>
                  {n.alert && n.body ? (
                    <Text style={styles.bodyPreview} numberOfLines={3}>
                      {n.body}
                    </Text>
                  ) : null}
                  <Text style={styles.date}>{fmtDate(n.date)}</Text>
                </View>
                <PhotoSlot
                  uri={thumbUri}
                  alt={n.title}
                  style={[
                    styles.thumb,
                    isChurchNews && banner && bannerRatio
                      ? { width: styles.thumb.height * bannerRatio }
                      : null,
                  ]}
                  contentFit={isChurchNews && banner ? 'contain' : 'cover'}
                >
                  {!thumbUri && (
                    <View style={styles.thumbIcon}>
                      {isChurchNews ? (
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
              );
            })}
          </>
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
  calBtn: { position: 'absolute', right: 18 },
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
  bodyPreview: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, color: colors.muted },
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

  scheduleCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
  },
  scheduleDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  scheduleDateChip: {
    width: 54,
    borderRadius: 11,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    paddingVertical: 7,
  },
  scheduleDateText: { fontFamily: font.extraBold, fontSize: 13, color: colors.primary },
  scheduleDaySub: { marginTop: 1, fontFamily: font.medium, fontSize: 11, color: colors.muted },
  scheduleTitle: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  scheduleDetail: { marginTop: 2, fontFamily: font.regular, fontSize: 12, color: colors.muted },
});
