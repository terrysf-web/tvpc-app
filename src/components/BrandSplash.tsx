import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { churchInfo } from '../churchInfo';
import { useCurrentMotto } from '../data/welcome';
import { isAppReady, onAppReady } from '../appBoot';
import { font } from '../theme';

/** 너무 빨리 사라지면 번쩍임으로 보인다 — 최소 표시 시간 */
const MIN_SHOW_MS = 1800;
/** 표어 조회를 이 시간까지는 기다려준다 — 앱 콘텐츠가 먼저 준비돼도 표어 없이 바로 닫지 않는다 */
const MOTTO_TIMEOUT_MS = 3000;
/** 신호가 안 와도 이 시간이 지나면 치운다 (다른 화면 딥링크·통신 두절) */
const MAX_SHOW_MS = 4200;
/** 홈 화면 아이콘으로 다시 열 때 — 이만큼 이상 백그라운드에 있었으면 재생 */
const RESUME_AFTER_HIDDEN_MS = 1500;
/** 다시 열 때는 이미 다 준비돼 있으니 이만큼만 짧게 보여준다 */
const RESUME_SHOW_MS = 2000;
const FADE_MS = 260;

/**
 * 브랜드 스플래시 — 로고와 슬로건.
 * 처음 열 때는 앱이 첫 그림(말씀·배경)을 준비하는 동안 보이고,
 * 이미 떠 있는 앱을 홈 화면 아이콘으로 다시 열 때도(한참 뒤였다면) 잠깐 다시 보인다.
 *
 * 로고·이름·슬로건은 마운트 즉시 보인다 — 표어(Firestore 조회 필요)를
 * 기다리느라 화면이 통째로 비어 보이는 시간이 없게 하기 위해서다.
 * 다만 스플래시 자체를 치우는 시점은 표어 조회가 끝나거나(대부분) 포기할
 * 때까지 기다린다 — 안 그러면 앱 콘텐츠가 표어보다 먼저 준비됐을 때
 * (특히 첫 실행) 표어가 오기도 전에 스플래시가 사라져 그 표어를 영영
 * 보여줄 기회가 없어진다.
 */
export function BrandSplash() {
  const [gone, setGone] = useState(Platform.OS !== 'web');
  const fade = useRef(new Animated.Value(1)).current;
  const mottoFade = useRef(new Animated.Value(0)).current;
  const born = useRef(Date.now());
  const mottoSettledRef = useRef(false);
  const appReadyRef = useRef(false);
  const hiddenRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const motto = useCurrentMotto();

  const doTryHide = useCallback(() => {
    if (hiddenRef.current || !mottoSettledRef.current || !appReadyRef.current) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - born.current));
    hideTimer.current = setTimeout(() => {
      hiddenRef.current = true;
      Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
        setGone(true),
      );
    }, wait);
  }, [fade]);

  // 표어는 도착하는 대로 그 자리에서 따로 페이드인 — 로고가 기다릴 필요는 없다
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let done = false;
    if (motto) {
      done = true;
      mottoSettledRef.current = true;
      Animated.timing(mottoFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      doTryHide();
      return;
    }
    const t = setTimeout(() => {
      if (done) return;
      // 표어를 못 받아도(오프라인 등) 로고는 이미 떠 있으니 여기서는 그냥 포기하고 닫기를 허용한다
      mottoSettledRef.current = true;
      doTryHide();
    }, MOTTO_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [motto, mottoFade, doTryHide]);

  useEffect(() => {
    if (gone) return;
    const onReady = () => {
      appReadyRef.current = true;
      doTryHide();
    };
    if (isAppReady()) onReady();
    const off = onAppReady(onReady);
    const cap = setTimeout(() => {
      // 안전판: 무슨 신호도 안 와도 이 시간이 지나면 강제로 치운다
      appReadyRef.current = true;
      mottoSettledRef.current = true;
      doTryHide();
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
      <View style={[StyleSheet.absoluteFill, styles.contentWrap]}>
        <View style={{ flex: 1.3 }} />
        <View style={styles.center}>
          {/* motto 도착 전에도 자리를 미리 잡아둔다 — 나중에 나타나며 로고를 밀어내리지 않게 */}
          <Animated.View style={[styles.mottoRow, { opacity: mottoFade }]}>
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
          </Animated.View>
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
      </View>
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
  slogan: { fontFamily: 'NanumBrushScript', fontSize: 24, color: '#1E5AA8' },
  foot: {
    alignSelf: 'center',
    fontFamily: font.regular,
    fontSize: 10.5,
    color: '#8FA0B5',
  },
});
