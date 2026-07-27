/**
 * 홈 화면에 추가 안내 — 처음 앱을 여신 분께 한 번만 올라오는 카드.
 * 아이폰은 [공유] → [홈 화면에 추가] 순서를,
 * 안드로이드는 브라우저의 설치 창을 바로 띄우거나 메뉴 위치를 알려드린다.
 */
import { BellRing, ExternalLink, MonitorDown, Plus, Share, SquarePlus, X, Zap } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  browserKind,
  browserLabel,
  canInstallDirectly,
  deviceKind,
  dismissForNow,
  markGuideSeen,
  noteAutoShown,
  promptInstall,
  shouldAutoShow,
  snapshot,
  subscribe,
} from '../installPrompt';
import { colors, font, shadows } from '../theme';

/** 안내가 처음 화면을 가리지 않도록 조금 기다렸다 올라온다 */
const DELAY_MS = 2500;

export function InstallGuide() {
  const [open, setOpen] = useState(false);
  // 브라우저의 설치 제안이 늦게 도착할 수 있어 구독해 둔다
  const [, setTick] = useState(snapshot());
  const slide = React.useRef(new Animated.Value(0)).current;
  const requests = React.useRef(snapshot());

  useEffect(() => subscribe(() => setTick(snapshot())), []);

  // 첫 방문이면 잠시 뒤 저절로 열린다
  useEffect(() => {
    if (!shouldAutoShow()) return;
    const id = setTimeout(() => {
      noteAutoShown();
      setOpen(true);
    }, DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  // '더보기 › 홈 화면에 추가'로 다시 열 수 있게
  useEffect(
    () =>
      subscribe(() => {
        const now = snapshot();
        if (now.split(':')[0] !== requests.current.split(':')[0]) setOpen(true);
        requests.current = now;
      }),
    [],
  );

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 260,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [open, slide]);

  if (Platform.OS !== 'web' || !open) return null;

  const kind = deviceKind();
  const browser = browserKind();
  const label = browserLabel();
  // 앱 안에서 열린 창(카카오톡 등)은 홈 화면에 추가를 못 한다 — 브라우저로 옮기도록 안내
  const direct = canInstallDirectly() && browser !== 'inapp';

  // 그냥 닫기 — 다음에 앱을 새로 열면 한 번 더 (최대 세 번)
  const close = () => {
    dismissForNow();
    setOpen(false);
  };

  // 다시 보지 않기 — 이 기기에서는 다시 올라오지 않는다
  const never = () => {
    markGuideSeen();
    setOpen(false);
  };

  const install = async () => {
    const ok = await promptInstall();
    if (ok) never();
  };

  // 공유·메뉴 버튼 위치가 브라우저마다 달라 안내를 나눈다.
  // 폰이 영어로 설정된 분도 그대로 찾을 수 있게 메뉴 이름은 영어를 같이 적는다.
  const shareIcon = <Share size={18} color={colors.primary} strokeWidth={2} />;
  const plusIcon = <SquarePlus size={18} color={colors.primary} strokeWidth={2} />;
  const addStep = {
    icon: plusIcon,
    text: '목록을 내려 "홈 화면에 추가 / Add to Home Screen"을 고르세요',
  };
  const finishIcon = <Plus size={18} color={colors.primary} strokeWidth={2} />;
  const finishStep = { icon: finishIcon, text: '오른쪽 위 "추가 / Add"를 누르세요' };

  const steps =
    kind === 'desktop'
      ? browser === 'safari'
        ? [
            { icon: shareIcon, text: '위 메뉴에서 "파일 / File"을 여세요' },
            { icon: plusIcon, text: '"독에 추가 / Add to Dock"을 고르세요' },
            { icon: finishIcon, text: '"추가 / Add"를 누르세요' },
          ]
        : [
            { icon: <MonitorDown size={18} color={colors.primary} strokeWidth={2} />, text: '주소창 오른쪽 끝의 설치 아이콘을 누르세요' },
            { icon: plusIcon, text: '"설치 / Install"을 누르세요' },
          ]
      : browser === 'inapp'
      ? [
          { icon: <Text style={styles.dots}>⋯</Text>, text: '오른쪽 위 ⋯ 버튼을 누르세요' },
          {
            icon: <ExternalLink size={18} color={colors.primary} strokeWidth={2} />,
            text: '"다른 브라우저로 열기 / Open in browser"를 고르세요',
          },
          { icon: plusIcon, text: '열린 브라우저에서 이 안내를 다시 따라 하시면 됩니다' },
        ]
      : kind === 'ios'
        ? browser === 'safari'
          ? [
              { icon: shareIcon, text: '화면 아래 가운데의 공유 버튼을 누르세요' },
              addStep,
              finishStep,
            ]
          : [
              // 아이폰 크롬·엣지·파이어폭스는 주소창 오른쪽 끝에 공유 버튼이 있다
              { icon: shareIcon, text: '주소창 오른쪽 끝의 공유 버튼을 누르세요' },
              addStep,
              finishStep,
            ]
        : browser === 'samsung'
          ? [
              { icon: <Text style={styles.dots}>☰</Text>, text: '화면 아래 메뉴(☰) 버튼을 누르세요' },
              { icon: plusIcon, text: '"현재 페이지 추가 / Add page to"를 고르세요' },
              { icon: plusIcon, text: '"홈 화면 / Home screen"을 고르면 끝납니다' },
            ]
          : [
              { icon: <Text style={styles.dots}>⋮</Text>, text: '오른쪽 위 점 세 개(⋮) 버튼을 누르세요' },
              {
                icon: plusIcon,
                text: '"앱 설치 / Install app" 또는 "홈 화면에 추가 / Add to Home screen"을 고르세요',
              },
            ];

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={close} />
      <Animated.View
        style={[
          styles.sheet,
          shadows.hero,
          {
            opacity: slide,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}
      >
        <Pressable style={styles.closeBtn} onPress={close} hitSlop={10}>
          <X size={18} color={colors.muted} strokeWidth={2} />
        </Pressable>

        <View style={styles.iconChip}>
          <SquarePlus size={26} color={colors.primary} strokeWidth={2} />
        </View>
        <Text style={styles.title}>
          {kind === 'desktop' ? '바탕화면에 설치해 보세요' : '홈 화면에 추가해 보세요'}
        </Text>
        <Text style={styles.sub}>
          {kind === 'desktop'
            ? '한 번 설치하면 창 하나로 바로 열리고,\n주소창 없이 앱처럼 쓸 수 있어요.'
            : '바탕화면 아이콘으로 한 번에 열리고,\n주소창 없이 앱처럼 편하게 볼 수 있어요.'}
        </Text>

        <View style={styles.benefits}>
          <View style={styles.benefit}>
            <Zap size={15} color={colors.tagOrangeText} strokeWidth={2.2} />
            <Text style={styles.benefitText}>한 번에 열기</Text>
          </View>
          <View style={styles.benefit}>
            <BellRing size={15} color={colors.tagGreenText} strokeWidth={2.2} />
            <Text style={styles.benefitText}>교회 소식 알림</Text>
          </View>
        </View>

        {label && !direct ? (
          <Text style={styles.browserNote}>
            지금 쓰시는 {label} 기준 안내예요
          </Text>
        ) : null}

        {direct ? (
          <Pressable style={styles.primaryBtn} onPress={install}>
            <Text style={styles.primaryBtnText}>
              {kind === 'desktop' ? '지금 설치하기' : '홈 화면에 추가하기'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.steps}>
            {steps.map((s, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepNo}>
                  <Text style={styles.stepNoText}>{i + 1}</Text>
                </View>
                <View style={styles.stepIcon}>{s.icon}</View>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footRow}>
          <Pressable style={styles.laterBtn} onPress={close} hitSlop={6}>
            <Text style={styles.laterText}>{direct ? '나중에 할게요' : '알겠습니다'}</Text>
          </Pressable>
          <Pressable style={styles.laterBtn} onPress={never} hitSlop={6}>
            <Text style={[styles.laterText, styles.neverText]}>다시 보지 않기</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12, 26, 46, 0.45)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 26,
    paddingBottom: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  closeBtn: { position: 'absolute', top: 14, right: 14, padding: 6 },
  iconChip: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontFamily: font.bold, fontSize: 19, color: colors.title, marginBottom: 8 },
  sub: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 16,
  },
  benefits: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.screenBg,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  benefitText: { fontFamily: font.medium, fontSize: 13, color: colors.body },
  browserNote: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.muted2,
    marginBottom: 10,
  },
  steps: { alignSelf: 'stretch', gap: 10, marginBottom: 6 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.screenBg,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  stepNo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNoText: { fontFamily: font.bold, fontSize: 12, color: '#FFFFFF' },
  stepIcon: { width: 22, alignItems: 'center' },
  dots: { fontFamily: font.bold, fontSize: 18, color: colors.primary, lineHeight: 20 },
  stepText: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.body, lineHeight: 20 },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 16, color: '#FFFFFF' },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  laterBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  laterText: { fontFamily: font.medium, fontSize: 14, color: colors.muted2 },
  neverText: { color: colors.faint, textDecorationLine: 'underline' },
});
