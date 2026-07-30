import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { churchInfo } from '../churchInfo';
import { useCurrentMotto } from '../data/welcome';
import { isAppReady, onAppReady } from '../appBoot';
import { font } from '../theme';

/**
 * 표어(Firestore)를 이 시간 안에 못 받아오면 포기하고 로고만이라도 보여준다.
 * 셀룰러 환경에서는 익명 로그인+조회에 700ms 넘게 걸리는 일이 흔해서,
 * 예전처럼 짧게 잡으면 로고가 먼저 뜨고 표어가 뒤늦게 팝업되는 것처럼 보인다.
 */
const CONTENT_WAIT_MS = 2200;
/** 로고+표어가 실제로 화면에 뜬 시점부터, 최소 이만큼은 보여준다(늦게 떴어도 읽을 시간은 보장) */
const MIN_CONTENT_SHOW_MS = 2200;
/** 무슨 신호도 안 와도(버그·통신 두절) 마운트 후 이 시간이 지나면 강제로 정리 */
const MAX_SHOW_MS = 5200;
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
  const contentFade = useRef(new Animated.Value(0)).current;
  const born = useRef(Date.now());
  // 콘텐츠(로고+표어)가 실제로 화면에 뜬 시각 — 최소 표시 시간을 여기서부터 잰다
  const revealedAt = useRef<number | null>(null);
  const appReadyRef = useRef(false);
  const hiddenRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const motto = useCurrentMotto();

  // 콘텐츠가 뜬 지 MIN_CONTENT_SHOW_MS가 지났고, 앱도 준비됐으면 스플래시를 치운다.
  // 두 조건 중 늦게 채워지는 쪽 시점부터 계산되므로, 표어가 늦게 와도 읽을 시간을 뺏기지 않는다.
  const tryHide = useCallback(() => {
    if (hiddenRef.current || revealedAt.current == null || !appReadyRef.current) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const wait = Math.max(0, MIN_CONTENT_SHOW_MS - (Date.now() - revealedAt.current));
    hideTimer.current = setTimeout(() => {
      hiddenRef.current = true;
      Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
        setGone(true),
      );
    }, wait);
  }, [fade]);

  // 로고와 표어가 따로 뜨지 않도록 — 표어가 준비되거나(대부분) 늦어지면 최대 대기 후 함께 보여준다
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      revealedAt.current = Date.now();
      Animated.timing(contentFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      tryHide();
    };
    if (motto) {
      reveal();
      return;
    }
    const t = setTimeout(reveal, CONTENT_WAIT_MS);
    return () => clearTimeout(t);
  }, [motto, contentFade, tryHide]);

  useEffect(() => {
    if (gone) return;
    const onReady = () => {
      appReadyRef.current = true;
      tryHide();
    };
    if (isAppReady()) onReady();
    const off = onAppReady(onReady);
    const cap = setTimeout(() => {
      // 안전판: 표어·appReady 신호가 끝내 안 와도 이 시간이 지나면 강제로 보여주고 치운다
      appReadyRef.current = true;
      if (revealedAt.current == null) {
        revealedAt.current = Date.now();
        Animated.timing(contentFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      }
      tryHide();
    }, MAX_SHOW_MS);
    return () => {
      off();
      clearTimeout(cap);
      if (hideTimer.current) clearTimeout(hideTimer.current);
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
      <Animated.View style={[StyleSheet.absoluteFill, styles.contentWrap, { opacity: contentFade }]}>
        <View style={{ flex: 1.3 }} />
        <View style={styles.center}>
          {/* motto 도착 전에도 자리를 미리 잡아둔다 — 나중에 팝업되며 로고를 밀어내리지 않게 */}
          <View style={styles.mottoRow}>
            {motto ? (
              <>
                <View style={styles.mottoBadge}>
                  <Text style={styles.mottoBadgeText}>{motto.badge}</Text>
                </View>
                <Text style={styles.mottoTitle}>{motto.title}</Text>
                <Text style={styles.mottoSubtitle}>{motto.subtitle}</Text>
                <Text style={styles.mottoVerse}>{motto.verse}</Text>
                <Text style={styles.mottoReference}>{motto.reference}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.logoChip}>
            {/* public/ 은 웹 루트로 그대로 나간다 — 앱 아이콘과 같은 교회 문양 */}
            <Image source={{ uri: '/icon-512.png' }} style={styles.logo} contentFit="contain" />
          </View>
          <Text style={styles.name}>트라이밸리{'\n'}장로교회</Text>
          <Text style={styles.slogan}>{churchInfo.slogan}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={[styles.foot, { marginBottom: Math.max(insets.bottom, 12) + 12 }]}>
          © 2026 {churchInfo.nameEn}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 100, alignItems: 'center', justifyContent: 'center' },
  contentWrap: { alignItems: 'stretch' },
  mottoRow: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 26, minHeight: 190, justifyContent: 'center' },
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
  center: { alignItems: 'center', justifyContent: 'center' },
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
    alignSelf: 'center',
    fontFamily: font.regular,
    fontSize: 10.5,
    color: '#8FA0B5',
  },
});
