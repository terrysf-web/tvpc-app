import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { churchInfo } from '../churchInfo';
import { isAppReady, onAppReady } from '../appBoot';
import { font } from '../theme';

/** 너무 빨리 사라지면 번쩍임으로 보인다 — 최소 표시 시간 */
const MIN_SHOW_MS = 400;
/** 신호가 안 와도 이 시간이 지나면 치운다 (다른 화면 딥링크·통신 두절) */
const MAX_SHOW_MS = 2500;

/**
 * 브랜드 스플래시 — 로고와 슬로건.
 * 인위적인 지연 없이, 앱이 첫 그림(말씀·배경)을 준비하는 동안만 보인다.
 * 빠른 기기에서는 잠깐 스치고, 느린 통신에서는 빈 화면 대신 이 화면이 보인다.
 */
export function BrandSplash() {
  const [gone, setGone] = useState(Platform.OS !== 'web');
  const fade = useRef(new Animated.Value(1)).current;
  const born = useRef(Date.now());

  useEffect(() => {
    if (gone) return;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const hide = () => {
      const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - born.current));
      hideTimer = setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }).start(() =>
          setGone(true),
        );
      }, wait);
    };
    if (isAppReady()) {
      hide();
      return;
    }
    const off = onAppReady(hide);
    const cap = setTimeout(hide, MAX_SHOW_MS);
    return () => {
      off();
      clearTimeout(cap);
      if (hideTimer) clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]}>
      <LinearGradient
        colors={['#BDD7EF', '#D9E8F6', '#EFF5FB', '#F7FAFD']}
        locations={[0, 0.34, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <View style={styles.logoChip}>
          {/* public/ 은 웹 루트로 그대로 나간다 — 앱 아이콘과 같은 교회 문양 */}
          <Image source={{ uri: '/icon-512.png' }} style={styles.logo} contentFit="contain" />
        </View>
        <Text style={styles.name}>트라이밸리{'\n'}장로교회</Text>
        <Text style={styles.slogan}>{churchInfo.slogan}</Text>
      </View>
      <Text style={styles.foot}>© 2026 {churchInfo.nameEn}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 100, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  logoChip: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(30, 90, 168, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: 'rgba(30, 74, 140, 0.9)',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  logo: { width: 70, height: 70 },
  name: {
    fontFamily: font.extraBold,
    fontSize: 26,
    lineHeight: 35,
    letterSpacing: -0.4,
    textAlign: 'center',
    color: '#122B4F',
    marginBottom: 12,
  },
  slogan: { fontFamily: font.bold, fontSize: 14.5, color: '#1E5AA8' },
  foot: {
    position: 'absolute',
    bottom: 24,
    fontFamily: font.regular,
    fontSize: 10.5,
    color: '#8FA0B5',
  },
});
