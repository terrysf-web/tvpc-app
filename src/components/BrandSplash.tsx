import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { churchInfo } from '../churchInfo';
import { useCurrentMotto } from '../data/welcome';
import { isAppReady, onAppReady } from '../appBoot';
import { font } from '../theme';

/** 너무 빨리 사라지면 번쩍임으로 보인다 — 최소 표시 시간 */
const MIN_SHOW_MS = 2600;
/** 신호가 안 와도 이 시간이 지나면 치운다 (다른 화면 딥링크·통신 두절) */
const MAX_SHOW_MS = 3800;
/** 홈 화면 아이콘으로 다시 열 때 — 이만큼 이상 백그라운드에 있었으면 재생 */
const RESUME_AFTER_HIDDEN_MS = 1500;
/** 다시 열 때는 이미 다 준비돼 있으니 이만큼만 짧게 보여준다 */
const RESUME_SHOW_MS = 2000;
const FADE_MS = 260;

/**
 * 브랜드 스플래시 — 로고와 슬로건.
 * 처음 열 때는 앱이 첫 그림(말씀·배경)을 준비하는 동안 보이고,
 * 이미 떠 있는 앱을 홈 화면 아이콘으로 다시 열 때도(한참 뒤였다면) 잠깐 다시 보인다.
 */
export function BrandSplash() {
  const [gone, setGone] = useState(Platform.OS !== 'web');
  const fade = useRef(new Animated.Value(1)).current;
  const born = useRef(Date.now());
  const insets = useSafeAreaInsets();
  const motto = useCurrentMotto();

  useEffect(() => {
    if (gone) return;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const hide = () => {
      const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - born.current));
      hideTimer = setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
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

  // 앱이 뜬 채로 홈 화면 아이콘을 다시 눌러도(=탭이 앞으로 돌아옴) 표시되게
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt != null && Date.now() - hiddenAt >= RESUME_AFTER_HIDDEN_MS) {
        born.current = Date.now();
        fade.setValue(1);
        setGone(false);
        setTimeout(() => {
          Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
            setGone(true),
          );
        }, RESUME_SHOW_MS);
      }
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fade]);

  if (gone) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]}>
      <LinearGradient
        colors={['#BDD7EF', '#D9E8F6', '#EFF5FB', '#F7FAFD']}
        locations={[0, 0.34, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      {motto ? (
        <View style={[styles.mottoRow, { top: Math.max(insets.top, 24) + 16 }]}>
          <View style={styles.mottoBadge}>
            <Text style={styles.mottoBadgeText}>{motto.badge}</Text>
          </View>
          <Text style={styles.mottoTitle}>{motto.title}</Text>
          <Text style={styles.mottoSubtitle}>{motto.subtitle}</Text>
          <Text style={styles.mottoVerse}>{motto.verse}</Text>
          <Text style={styles.mottoReference}>{motto.reference}</Text>
        </View>
      ) : null}
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
  mottoRow: { position: 'absolute', alignItems: 'center', paddingHorizontal: 24 },
  mottoBadge: {
    backgroundColor: 'rgba(18,50,91,0.78)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 10,
  },
  mottoBadgeText: { fontFamily: font.bold, fontSize: 12, color: '#FFFFFF' },
  mottoTitle: {
    fontFamily: font.extraBold,
    fontSize: 19,
    letterSpacing: -0.3,
    color: '#122B4F',
  },
  mottoSubtitle: {
    fontFamily: font.bold,
    fontSize: 14,
    color: '#1E5AA8',
    marginTop: 2,
  },
  mottoVerse: {
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 20,
    textAlign: 'center',
    color: '#3A5A85',
    marginTop: 14,
  },
  mottoReference: {
    fontFamily: font.bold,
    fontSize: 11,
    color: '#7590B5',
    marginTop: 4,
  },
  center: { alignItems: 'center' },
  logoChip: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
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
