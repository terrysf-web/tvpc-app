import { Tabs } from 'expo-router';
import Bell from 'lucide-react-native/dist/esm/icons/bell.mjs';
import BookOpen from 'lucide-react-native/dist/esm/icons/book-open.mjs';
import Home from 'lucide-react-native/dist/esm/icons/house.mjs';
import MoreHorizontal from 'lucide-react-native/dist/esm/icons/ellipsis.mjs';
import PlayCircle from 'lucide-react-native/dist/esm/icons/circle-play.mjs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../../src/theme';

/**
 * 아이콘과 글자가 들어가는 높이 — 화면 아래 안전영역은 여기에 더한다.
 *
 * 여기가 모자라면 글자가 (지워지는 게 아니라) 납작하게 눌려 잘려 보인다.
 * 탭 한 칸이 스스로 위아래 5씩 여백을 갖고 있어 그만큼도 세어야 한다:
 *   위 여백 5 + 칸 여백 10 + 아이콘칸 22 + 글자 위 2 + 글자 13 = 52
 * 막대가 두꺼우면 홈 화면 아래(최근 설교)가 잘리므로 딱 맞게 잡는다.
 */
const BAR_H = 53;

/** 하단 5탭 — 홈 · 말씀 · 설교 · 소식 · 더보기 */
export default function TabsLayout() {
  // 높이를 숫자로 못 박으면, 아이폰 홈 화면 앱처럼 아래 안전영역(홈 인디케이터)이
  // 있는 기기에서 그 공간이 탭 높이를 잡아먹어 글자가 잘려 안 보인다.
  // 컴퓨터에서는 안전영역이 0이라 멀쩡해 보여 놓치기 쉽다.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
          height: BAR_H + insets.bottom,
          paddingTop: 5,
          paddingBottom: insets.bottom,
          paddingHorizontal: 4,
        },
        // 아이콘을 감싸는 칸이 기본 28이라 글자 자리를 잡아먹는다 — 아이콘 크기에 맞춘다
        tabBarIconStyle: { height: 22 },
        tabBarLabelStyle: {
          fontFamily: font.medium,
          fontSize: 10.5,
          lineHeight: 13,
          marginTop: 2,
        },
        tabBarActiveBackgroundColor: 'transparent',
        sceneStyle: { backgroundColor: colors.screenBg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <Home size={21} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="word"
        options={{
          title: '말씀',
          tabBarIcon: ({ color }) => <BookOpen size={21} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="sermon"
        options={{
          title: '설교',
          tabBarIcon: ({ color }) => <PlayCircle size={21} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: '소식',
          tabBarIcon: ({ color }) => <Bell size={21} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: '더보기',
          tabBarIcon: ({ color }) => <MoreHorizontal size={21} color={color} strokeWidth={1.9} />,
        }}
      />
    </Tabs>
  );
}
