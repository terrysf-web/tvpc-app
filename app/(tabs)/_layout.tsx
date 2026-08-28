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
 * 글자를 아이콘 아래가 아니라 옆에 두면(tabBarLabelPosition:
 * 'beside-icon') 세로로 쌓이지 않아 훨씬 낮아도 된다 — 아이콘(21)과
 * 글자(줄높이 13)가 한 줄에 나란히 있으니 그 둘 중 큰 쪽(21) 기준으로
 * 위아래 여백만 더하면 된다: 위 여백 8 + 아이콘 21 + 아래 여백 8 = 37.
 * 여기가 모자라면 글자가 잘리지는 않고 위아래로 눌린 듯 보이니, 실기기
 * 확인 후 부족하면 이 값을 올린다.
 */
const BAR_H = 40;

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
          paddingTop: 8,
          paddingBottom: 8 + insets.bottom,
          paddingHorizontal: 4,
        },
        // 글자를 아이콘 아래가 아니라 옆에 둔다 — 칸이 훨씬 낮아진다
        tabBarLabelPosition: 'beside-icon',
        tabBarLabelStyle: {
          fontFamily: font.medium,
          fontSize: 10.5,
          marginLeft: 4,
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
