import { Tabs } from 'expo-router';
import { Bell, BookOpen, Home, MoreHorizontal, PlayCircle } from 'lucide-react-native';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../../src/theme';

/**
 * 아이콘과 글자가 들어가는 높이 — 화면 아래 안전영역은 여기에 더한다.
 * 여기가 모자라면 글자가 (지워지는 게 아니라) 납작하게 눌려 잘려 보인다.
 * 안쪽 여백 8 + 아이콘 23 + 글자 위 여백 4 + 글자 14 + 아래 숨 = 64.
 */
const BAR_H = 64;

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
          paddingBottom: insets.bottom,
          paddingHorizontal: 4,
        },
        tabBarLabelStyle: {
          fontFamily: font.medium,
          fontSize: 10.5,
          lineHeight: 14,
          marginTop: 4,
        },
        tabBarActiveBackgroundColor: 'transparent',
        sceneStyle: { backgroundColor: colors.screenBg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <Home size={23} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="word"
        options={{
          title: '말씀',
          tabBarIcon: ({ color }) => <BookOpen size={23} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="sermon"
        options={{
          title: '설교',
          tabBarIcon: ({ color }) => <PlayCircle size={23} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: '소식',
          tabBarIcon: ({ color }) => <Bell size={23} color={color} strokeWidth={1.9} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: '더보기',
          tabBarIcon: ({ color }) => <MoreHorizontal size={23} color={color} strokeWidth={1.9} />,
        }}
      />
    </Tabs>
  );
}
