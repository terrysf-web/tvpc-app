import { Tabs } from 'expo-router';
import { Bell, BookOpen, Home, MonitorPlay, MoreHorizontal, PlayCircle } from 'lucide-react-native';
import React from 'react';
import { Platform } from 'react-native';
import { useClockTick } from '../../src/data/hooks';
import { colors, font } from '../../src/theme';

/** 하단 5탭 — 홈 · 말씀(주일엔 온라인예배) · 설교 · 소식 · 더보기 */
export default function TabsLayout() {
  // 자정을 넘겨 주일이 되면 탭 이름이 저절로 바뀌도록 1분마다 갱신
  useClockTick();
  const isSunday = new Date().getDay() === 0;
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
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 8,
          paddingHorizontal: 4,
        },
        tabBarLabelStyle: {
          fontFamily: font.medium,
          fontSize: 10.5,
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
          title: isSunday ? '온라인예배' : '말씀',
          tabBarIcon: ({ color }) =>
            isSunday ? (
              <MonitorPlay size={23} color={color} strokeWidth={1.9} />
            ) : (
              <BookOpen size={23} color={color} strokeWidth={1.9} />
            ),
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
