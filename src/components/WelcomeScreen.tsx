import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dismissForNow } from '../installPrompt';
import { useWelcome } from '../data/welcome';
import { colors, font } from '../theme';

/**
 * 웰컴 — 교회 표어 화면. 처음 실행과 표어가 바뀔 때 한 번.
 * 그림 위쪽이 밝은 하늘이라 글씨는 남색(밝은 배경 말씀 카드와 같은 처리).
 */
export function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { show, motto, image, dismiss } = useWelcome();

  // 웰컴이 떠 있는 동안 '홈 화면에 추가' 안내가 겹쳐 뜨지 않게 이번 회기는 미룬다
  useEffect(() => {
    if (show) dismissForNow();
  }, [show]);

  if (!show || !motto) return null;

  const openGuide = () => {
    dismiss();
    router.push('/help');
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]}>
      {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      <View style={[styles.top, { marginTop: Math.max(insets.top, 24) + 42 }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{motto.badge}</Text>
        </View>
        <Text style={styles.title}>{motto.title}</Text>
        <Text style={styles.subtitle}>{motto.subtitle}</Text>
        <Text style={styles.verse}>{motto.verse}</Text>
        <Text style={styles.reference}>{motto.reference}</Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <Pressable style={styles.startBtn} onPress={dismiss}>
          <Text style={styles.startText}>시작하기</Text>
        </Pressable>
        <Pressable style={styles.guideBtn} onPress={openGuide} hitSlop={6}>
          <Text style={styles.guideText}>앱 사용 안내서 보기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const glow = {
  textShadowColor: 'rgba(255,255,255,0.9)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

const styles = StyleSheet.create({
  wrap: { zIndex: 50, backgroundColor: '#EAF2F8', justifyContent: 'space-between' },
  top: { alignItems: 'center', paddingHorizontal: 24 },
  badge: {
    backgroundColor: 'rgba(18,50,91,0.78)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 18,
  },
  badgeText: { fontFamily: font.bold, fontSize: 12.5, color: '#FFFFFF' },
  title: {
    fontFamily: font.extraBold,
    fontSize: 34,
    letterSpacing: -0.5,
    color: '#122B4F',
    ...glow,
  },
  subtitle: {
    fontFamily: font.extraBold,
    fontSize: 23,
    color: colors.primary,
    marginTop: 4,
    ...glow,
  },
  verse: {
    fontFamily: font.medium,
    fontSize: 13.5,
    lineHeight: 24,
    textAlign: 'center',
    color: '#17406E',
    marginTop: 22,
    ...glow,
  },
  reference: { fontFamily: font.bold, fontSize: 12, color: '#5B7BA6', marginTop: 6, ...glow },
  bottom: { paddingHorizontal: 24, alignItems: 'center' },
  startBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: 'rgba(8,20,38,0.9)',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  startText: { fontFamily: font.extraBold, fontSize: 15.5, color: '#FFFFFF' },
  guideBtn: {
    marginTop: 13,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  guideText: { fontFamily: font.bold, fontSize: 12.5, color: '#17406E' },
});
