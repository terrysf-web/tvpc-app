import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { churchInfo } from '../src/churchInfo';
import { useEvents } from '../src/data/hooks';
import { colors, font, shadows } from '../src/theme';
import type { EventDoc } from '../src/types';

const KDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * 일정의 실제 날짜(YYYY-MM-DD) — 홈페이지 동기화 일정은 sortKey가 있고,
 * 관리자 직접 등록 일정은 dateLabel("07.14 월요일")에서 유추한다
 * (연도는 오늘 기준 가장 가까운 미래·최근 과거로 추정).
 */
function eventDate(e: EventDoc): string | null {
  if (e.sortKey && /^\d{4}-\d{2}-\d{2}$/.test(e.sortKey)) return e.sortKey;
  const m = e.dateLabel.match(/(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  let y = now.getFullYear();
  const cand = new Date(y, Number(m[1]) - 1, Number(m[2]));
  if (cand.getTime() < now.getTime() - 180 * 86400e3) y += 1;
  return keyOf(y, Number(m[1]) - 1, Number(m[2]));
}

/** 앱 자체 달력 — 홈페이지 달력에서 매일 동기화한 일정을 달력만 깔끔하게 표시 */
export default function CalendarScreen() {
  const router = useRouter();
  const { events } = useEvents();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);

  // 날짜(YYYY-MM-DD) → 일정 목록
  const byDate = useMemo(() => {
    const map = new Map<string, EventDoc[]>();
    for (const e of events) {
      const d = eventDate(e);
      if (!d) continue;
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    return map;
  }, [events]);

  const { y, m } = cursor;
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = keyOf(today.getFullYear(), today.getMonth(), today.getDate());

  // 이번 달 주 단위 셀 (앞뒤 빈 칸 포함)
  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthPrefix = `${y}-${pad(m + 1)}`;
  const monthEvents = [...byDate.entries()]
    .filter(([d]) => d.startsWith(monthPrefix) && (!selected || d === selected))
    .sort(([a], [b]) => (a < b ? -1 : 1));

  // 이번 달에 일정이 없으면 다가오는 일정 전체를 대신 보여준다 (빈 화면 방지)
  const upcomingAll = [...byDate.entries()]
    .filter(([d]) => d >= todayKey)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const showUpcoming = !selected && monthEvents.length === 0 && upcomingAll.length > 0;
  const rows = showUpcoming ? upcomingAll : monthEvents;
  const nextDate = upcomingAll[0]?.[0];
  const nextInOtherMonth = !!nextDate && !nextDate.startsWith(monthPrefix);

  const move = (delta: number) => {
    const next = new Date(y, m + delta, 1);
    setCursor({ y: next.getFullYear(), m: next.getMonth() });
    setSelected(null);
  };

  const openEvent = (e: EventDoc) => {
    if (!e.url) return;
    router.push({ pathname: '/browser', params: { url: e.url, t: e.title } });
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="교회 달력" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 월 이동 */}
        <View style={[styles.calCard, shadows.card]}>
          <View style={styles.monthRow}>
            <Pressable onPress={() => move(-1)} hitSlop={10} style={styles.monthBtn}>
              <ChevronLeft size={20} color={colors.title} strokeWidth={1.9} />
            </Pressable>
            <Text style={styles.monthTitle}>
              {y}년 {m + 1}월
            </Text>
            <Pressable onPress={() => move(1)} hitSlop={10} style={styles.monthBtn}>
              <ChevronRight size={20} color={colors.title} strokeWidth={1.9} />
            </Pressable>
          </View>

          {/* 요일 */}
          <View style={styles.weekRow}>
            {KDAYS.map((d, i) => (
              <Text
                key={d}
                style={[
                  styles.weekday,
                  i === 0 && { color: '#D64545' },
                  i === 6 && { color: colors.primary },
                ]}
              >
                {d}
              </Text>
            ))}
          </View>

          {/* 날짜 그리드 */}
          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={i} style={styles.cell} />;
              const k = keyOf(y, m, day);
              const has = byDate.has(k);
              const isToday = k === todayKey;
              const isSel = k === selected;
              return (
                <Pressable
                  key={i}
                  style={styles.cell}
                  onPress={() => has && setSelected(isSel ? null : k)}
                >
                  <View
                    style={[
                      styles.dayChip,
                      isToday && styles.todayChip,
                      isSel && styles.selChip,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        i % 7 === 0 && { color: '#D64545' },
                        i % 7 === 6 && { color: colors.primary },
                        (isSel || isToday) && styles.dayTextStrong,
                        isSel && { color: '#FFFFFF' },
                      ]}
                    >
                      {day}
                    </Text>
                    <View style={[styles.dot, has && styles.dotOn, isSel && styles.dotSel]} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* 이 달에 일정이 없으면 다음 일정 있는 달로 바로 이동 */}
          {monthEvents.length === 0 && !selected && nextInOtherMonth && (
            <Pressable
              style={styles.jumpBtn}
              onPress={() =>
                setCursor({
                  y: Number(nextDate.slice(0, 4)),
                  m: Number(nextDate.slice(5, 7)) - 1,
                })
              }
            >
              <Text style={styles.jumpBtnText}>
                다음 일정 {Number(nextDate.slice(5, 7))}월 {Number(nextDate.slice(8))}일 — 보러
                가기 ›
              </Text>
            </Pressable>
          )}
        </View>

        {/* 해당 월(또는 선택한 날짜) 일정 목록 · 이 달에 없으면 다가오는 일정 전체 */}
        <Text style={styles.listTitle}>
          {selected
            ? `${Number(selected.slice(8))}일 일정`
            : showUpcoming
              ? '다가오는 일정'
              : `${m + 1}월 일정`}
        </Text>
        {rows.length === 0 && (
          <Text style={styles.empty}>등록된 일정이 없습니다.</Text>
        )}
        {rows.map(([d, list]) =>
          list.map((e) => (
            <Pressable
              key={e.id}
              style={[styles.eventRow, shadows.card]}
              onPress={() => openEvent(e)}
            >
              <View style={styles.dateChip}>
                <Text style={styles.dateChipDay}>{Number(d.slice(8))}</Text>
                <Text style={styles.dateChipDow}>
                  {showUpcoming
                    ? `${Number(d.slice(5, 7))}월`
                    : KDAYS[new Date(d + 'T00:00:00').getDay()]}
                </Text>
              </View>
              <View style={styles.eventCol}>
                <Text style={styles.eventTitle} numberOfLines={2}>
                  {e.title}
                </Text>
                {!!e.detail && <Text style={styles.eventDetail}>{e.detail}</Text>}
              </View>
            </Pressable>
          )),
        )}

        {/* 홈페이지 원본 달력 */}
        <Pressable
          style={styles.webLink}
          onPress={() =>
            router.push({
              pathname: '/browser',
              params: { url: churchInfo.pages.calendar, t: '교회 달력 (홈페이지)' },
            })
          }
        >
          <ExternalLink size={13} color={colors.muted} strokeWidth={1.9} />
          <Text style={styles.webLinkText}>홈페이지 달력 원본 보기</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 32 },

  calCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 12,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  monthBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontFamily: font.extraBold, fontSize: 16, color: colors.title },
  weekRow: { flexDirection: 'row', marginTop: 2, marginBottom: 6 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.medium,
    fontSize: 12,
    color: colors.muted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  dayChip: {
    width: 36,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayChip: { backgroundColor: colors.tagBlueBg },
  jumpBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.tagBlueBg,
  },
  jumpBtnText: { fontFamily: font.bold, fontSize: 12.5, color: colors.primary },
  selChip: { backgroundColor: colors.primary },
  dayText: { fontFamily: font.regular, fontSize: 13.5, color: colors.title },
  dayTextStrong: { fontFamily: font.bold },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.primary },
  dotSel: { backgroundColor: '#FFFFFF' },

  listTitle: {
    fontFamily: font.extraBold,
    fontSize: 15,
    color: colors.title,
    marginTop: 20,
    marginBottom: 10,
  },
  empty: { fontFamily: font.regular, fontSize: 13, color: colors.faint, marginBottom: 8 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
  },
  dateChip: {
    width: 46,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipDay: { fontFamily: font.extraBold, fontSize: 17, color: colors.primary },
  dateChipDow: { fontFamily: font.medium, fontSize: 10.5, color: colors.primary },
  eventCol: { flex: 1, gap: 3 },
  eventTitle: { fontFamily: font.bold, fontSize: 14, color: colors.title },
  eventDetail: { fontFamily: font.regular, fontSize: 12, color: colors.muted },

  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 14,
    paddingVertical: 8,
  },
  webLinkText: { fontFamily: font.regular, fontSize: 12.5, color: colors.muted },
});
