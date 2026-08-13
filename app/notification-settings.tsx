import BookOpen from 'lucide-react-native/dist/esm/icons/book-open.mjs';
import Heart from 'lucide-react-native/dist/esm/icons/heart.mjs';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { NOTIFICATION_TIMES, NOTIFICATION_TOPICS, usePushNotifications } from '../src/push';
import { colors, font, shadows } from '../src/theme';

const TOPIC_STYLE: Record<string, { Icon: typeof BookOpen; bg: string; fg: string }> = {
  verse: { Icon: BookOpen, bg: colors.tagBlueBg, fg: colors.primary },
  gratitude: { Icon: Heart, bg: colors.tagGreenBg, fg: colors.tagGreenText },
};

/**
 * 알림 종류별(오늘의 말씀·감사일기) 켜고 끄기 + 받고 싶은 시각 설정.
 * 더보기 화면의 "알림 받기" 카드가 이 상세 설정까지 다 담으면 목록 아래
 * 다른 메뉴가 화면 밖으로 밀려나 안 보인다는 지적을 받아, 별도 화면으로 뺐다.
 */
export default function NotificationSettingsScreen() {
  const push = usePushNotifications();

  return (
    <View style={styles.screen}>
      <OverlayHeader title="알림 시각 설정" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>알림 종류마다 받고 싶은 시각을 따로 고를 수 있어요.</Text>

        {NOTIFICATION_TOPICS.map((t) => {
          const on = push.topics.has(t.key);
          const time = push.topicTimes[t.key];
          const timeLabel = NOTIFICATION_TIMES.find((n) => n.key === time)?.label ?? '';
          const { Icon, bg, fg } = TOPIC_STYLE[t.key] ?? TOPIC_STYLE.verse;
          const busy = push.topicBusy === t.key;
          return (
            <View key={t.key} style={[styles.card, shadows.card]}>
              <View style={styles.row}>
                <View style={[styles.chip, { backgroundColor: bg }]}>
                  <Icon size={18} color={fg} strokeWidth={1.9} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t.label}</Text>
                  <Text style={styles.desc}>매일 {timeLabel}에 알려드려요</Text>
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={on}
                    onValueChange={(v) => push.setTopic(t.key, v)}
                    trackColor={{ false: colors.faint2, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>
              {on && (
                <View style={styles.timeRow}>
                  {NOTIFICATION_TIMES.map((nt) => {
                    const active = time === nt.key;
                    return (
                      <Pressable
                        key={nt.key}
                        disabled={busy}
                        style={[styles.timePill, active && styles.timePillActive]}
                        onPress={() => push.setTopicTime(t.key, nt.key)}
                      >
                        <Text style={[styles.timePillText, active && styles.timePillTextActive]}>
                          {nt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {push.error ? <Text style={styles.errorText}>{push.error}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  hint: {
    marginBottom: 14,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  desc: { marginTop: 2, fontFamily: font.regular, fontSize: 12, color: colors.muted3 },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  timePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.screenBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  timePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timePillText: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted },
  timePillTextActive: { color: '#FFFFFF' },
  errorText: {
    marginTop: 4,
    fontFamily: font.regular,
    fontSize: 12.5,
    color: colors.heartActive,
  },
});
