import { useRouter } from 'expo-router';
import BellRing from 'lucide-react-native/dist/esm/icons/bell-ring.mjs';
import BookOpen from 'lucide-react-native/dist/esm/icons/book-open.mjs';
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right.mjs';
import Heart from 'lucide-react-native/dist/esm/icons/heart.mjs';
import HeartHandshake from 'lucide-react-native/dist/esm/icons/heart-handshake.mjs';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { markAlertsRead } from '../src/alertsUnread';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useAdminAuth } from '../src/data/admin';
import { useNews } from '../src/data/hooks';
import { pathFromTag, useNotifHistory } from '../src/notifHistory';
import { usePushNotifications } from '../src/push';
import { colors, font, shadows } from '../src/theme';

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${y}년 ${m}월 ${day}일`;
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 알림 태그(verse-2026-08-13 등) 접두어로 종류를 가늠 — 아이콘·색만 다르게 */
function localMeta(tag: string): { label: string; Icon: typeof BellRing; bg: string; fg: string } {
  if (tag.startsWith('verse-')) {
    return { label: '오늘의 말씀', Icon: BookOpen, bg: colors.tagBlueBg, fg: colors.primary };
  }
  if (tag.startsWith('gratitude-')) {
    return { label: '감사일기', Icon: Heart, bg: colors.tagGreenBg, fg: colors.tagGreenText };
  }
  if (tag.startsWith('pray-')) {
    return { label: '기도', Icon: HeartHandshake, bg: colors.tagGreenBg, fg: colors.tagGreenText };
  }
  return { label: '알림', Icon: BellRing, bg: colors.tagOrangeBg, fg: colors.tagOrangeText };
}

/**
 * 알림이 가리키는 화면 경로 — tag로 먼저 알아내고(항상 정확), 모르는
 * tag일 때만 저장된 링크(https://app.tvpc.church/word 등)를 파싱한다.
 * (한때 서비스워커의 링크 기록이 어긋난 적이 있어, 그때 저장된 옛
 * 항목도 tag 덕분에 눌렀을 때 제 화면으로 가게 된다.)
 */
function entryPath(tag: string, link: string): string {
  const byTag = pathFromTag(tag);
  if (byTag) return byTag;
  try {
    return new URL(link).pathname || '/';
  } catch {
    return link.startsWith('/') ? link : '/';
  }
}

type Entry =
  | { kind: 'alert'; id: string; title: string; body?: string | null; date: string; ts: number }
  | {
      kind: 'local';
      id: number;
      title: string;
      body: string;
      ts: number;
      meta: ReturnType<typeof localMeta>;
      path: string;
    };

/**
 * 알림 보관함 — 홈 우측 상단 종 아이콘으로 진입. 긴급 공지(교회에서 보낸
 * 전체 공지 — news 컬렉션에 저장돼 있어 알림을 안 켠 기기도 볼 수 있음)와
 * 이 기기가 실제로 받은 알림(오늘의 말씀·감사일기 등 — src/notifHistory.ts,
 * 서비스워커가 받는 순간 기록해 둔 것)을 시간순으로 모아 보여준다. 놓치거나
 * 눌러서 확인 못 한 알림도 여기서 다시 볼 수 있다.
 */
export default function AlertsScreen() {
  const router = useRouter();
  const { news } = useNews();
  const { role } = useAdminAuth();
  const push = usePushNotifications();
  const localHistory = useNotifHistory();

  // 이 화면을 열면 홈 종 아이콘의 "안 읽음" 점을 지운다
  useEffect(() => {
    markAlertsRead();
  }, []);

  const entries: Entry[] = [
    ...news
      .filter((n) => n.alert)
      .map((a): Entry => ({
        kind: 'alert',
        id: a.id,
        title: a.title,
        body: a.body,
        date: a.date,
        ts: Date.parse(`${a.date}T00:00:00`) || 0,
      })),
    ...localHistory.map(
      (n): Entry => ({
        kind: 'local',
        id: n.id,
        title: n.title,
        body: n.body,
        ts: n.ts,
        meta: localMeta(n.tag),
        path: entryPath(n.tag, n.link),
      }),
    ),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <View style={styles.screen}>
      <OverlayHeader title="알림" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 목회자에게는 기도요청함 바로가기도 여기서 보이게 */}
        {role === 'pastor' && (
          <Pressable style={[styles.inboxCard, shadows.card]} onPress={() => router.push('/pray-inbox')}>
            <View style={styles.inboxChip}>
              <HeartHandshake size={18} color="#FFFFFF" strokeWidth={2} />
            </View>
            <Text style={styles.inboxLabel}>기도요청함 열기</Text>
            <ChevronRight size={18} color="#9CC3A9" strokeWidth={2} />
          </Pressable>
        )}
        {entries.length === 0 && (
          <View style={[styles.card, shadows.card, { alignItems: 'center' }]}>
            <BellRing size={26} color={colors.faint2} strokeWidth={1.7} />
            <Text style={styles.emptyText}>받은 알림이 없습니다.</Text>
          </View>
        )}
        {entries.map((e) =>
          e.kind === 'alert' ? (
            <View key={`alert-${e.id}`} style={[styles.card, shadows.card]}>
              <View style={styles.titleRow}>
                <View style={styles.iconChip}>
                  <BellRing size={16} color={colors.tagOrangeText} strokeWidth={2} />
                </View>
                <Text style={styles.title}>{e.title}</Text>
              </View>
              {e.body ? <Text style={styles.body}>{e.body}</Text> : null}
              <Text style={styles.date}>{fmtDate(e.date)}</Text>
            </View>
          ) : (
            <Pressable
              key={`local-${e.id}`}
              style={[styles.card, shadows.card]}
              onPress={() => router.push(e.path as never)}
            >
              <View style={styles.titleRow}>
                <View style={[styles.iconChip, { backgroundColor: e.meta.bg }]}>
                  <e.meta.Icon size={16} color={e.meta.fg} strokeWidth={2} />
                </View>
                <Text style={styles.title}>{e.title}</Text>
                <ChevronRight size={16} color={colors.faint2} strokeWidth={2} />
              </View>
              {e.body ? <Text style={styles.body}>{e.body}</Text> : null}
              <Text style={styles.date}>{fmtTs(e.ts)}</Text>
            </Pressable>
          ),
        )}
        <Text style={styles.hint}>
          {push.enabled
            ? '이 기기가 받은 알림이 여기에 모아서 보관됩니다. 놓친 알림도 다시 볼 수 있어요.'
            : '더보기 탭에서 "알림 받기"를 켜면, 받은 알림을 놓쳐도 여기서 다시 볼 수 있어요.'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  inboxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#F2FAF4',
    borderColor: '#D8EBDD',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  inboxChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.tagGreenText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxLabel: { flex: 1, fontFamily: font.bold, fontSize: 14, color: '#2C5E3A' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.tagOrangeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontFamily: font.bold, fontSize: 15, color: colors.title },
  body: {
    marginTop: 10,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.body,
  },
  date: { marginTop: 10, fontFamily: font.regular, fontSize: 11.5, color: colors.faint },
  emptyText: { marginTop: 8, fontFamily: font.regular, fontSize: 13, color: colors.muted },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.faint,
  },
});
