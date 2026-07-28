import { usePathname, useRouter } from 'expo-router';
import { BookOpenCheck, X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { endHelpTour, useHelpTour } from '../helpTour';
import { colors, font, shadows } from '../theme';

/** 하단 탭이 있는 화면 — 그만큼 위로 띄워야 탭을 가리지 않는다 */
const TAB_ROUTES = ['/', '/word', '/sermon', '/news', '/more'];
/** app/(tabs)/_layout.tsx 의 BAR_H 와 같은 값 */
const TAB_BAR_H = 64;
/** 화면 자체에 아래 도구줄이 있는 곳 — 그만큼 더 띄워 가리지 않게
 *  (말씀: 가− · 가+ · 책갈피 · 저장한 말씀) */
const OWN_BOTTOM_BAR: Record<string, number> = { '/word': 56 };

/**
 * 안내서에서 '바로 가기'로 떠나 있는 동안 화면 아래에 떠 있는 돌아가기 단추.
 * 어느 화면에 있든 한 번에 안내서로 돌아온다. ✕ 를 누르면 그만 따라다닌다.
 */
export function HelpReturnBar() {
  const on = useHelpTour();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // 안내서로 '돌아왔을 때'만 저절로 사라진다. 떠나기 전(아직 안내서에 있을 때)
  // 꺼버리면 표시가 켜지자마자 지워져 단추가 영영 안 나온다.
  const left = useRef(false);
  useEffect(() => {
    if (!on) {
      left.current = false;
      return;
    }
    if (pathname !== '/help') {
      left.current = true;
      return;
    }
    if (left.current) endHelpTour();
  }, [on, pathname]);

  if (!on || pathname === '/help') return null;

  const bottom =
    (TAB_ROUTES.includes(pathname) ? TAB_BAR_H : 0) +
    (OWN_BOTTOM_BAR[pathname] ?? 0) +
    insets.bottom +
    12;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Pressable
        style={[styles.pill, shadows.card]}
        onPress={() => {
          endHelpTour();
          router.push('/help');
        }}
        accessibilityRole="button"
        accessibilityLabel="앱 사용 안내서로 돌아가기"
      >
        <BookOpenCheck size={17} color="#FFFFFF" strokeWidth={2} />
        <Text style={styles.text}>안내서로 돌아가기</Text>
        <Pressable style={styles.close} onPress={endHelpTour} hitSlop={10}>
          <X size={14} color="rgba(255,255,255,0.75)" strokeWidth={2.4} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingLeft: 15,
    paddingRight: 9,
    paddingVertical: 10,
  },
  text: { fontFamily: font.bold, fontSize: 13.5, color: '#FFFFFF' },
  close: {
    marginLeft: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
