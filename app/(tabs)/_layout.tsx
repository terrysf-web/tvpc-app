import { Tabs } from 'expo-router';
import { Bell, BookOpen, Home, MoreHorizontal, PlayCircle } from 'lucide-react-native';
import React from 'react';
import { Platform } from 'react-native';
import { colors, font } from '../../src/theme';

/** 하단 5탭 — 홈 · 말씀 · 설교 · 소식 · 더보기 */
export default function TabsLayout() {
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
