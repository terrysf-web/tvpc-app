import { useRouter } from 'expo-router';
import ChevronLeft from 'lucide-react-native/dist/esm/icons/chevron-left.mjs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../theme';

/** 오버레이 화면 공통 헤더 — 뒤로가기 + 타이틀(17/700) + 우측 액션 */
export function OverlayHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
      <Pressable
        style={styles.iconBtn}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        hitSlop={8}
      >
        <ChevronLeft size={24} color={colors.title} strokeWidth={1.9} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.iconBtn}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.bold,
    fontSize: 17,
    color: colors.title,
  },
});
