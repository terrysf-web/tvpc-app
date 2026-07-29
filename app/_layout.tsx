import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BrandSplash } from '../src/components/BrandSplash';
import { HelpReturnBar } from '../src/components/HelpReturnBar';
import { WelcomeScreen } from '../src/components/WelcomeScreen';
import { InstallGuide } from '../src/components/InstallGuide';
import { useMemoSync } from '../src/data/memoSync';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { width, height } = useWindowDimensions();
  const pathname = usePathname();
  // 로그인 계정(목회자·관리자)의 개인 메모를 기기 간 자동 동기화
  useMemoSync();

  useEffect(() => {
    // 글꼴을 기다리지 않고 바로 화면을 보여준다 — 느린 통신에서 몇 초씩
    // 빈 화면이 보이던 문제. 글꼴은 준비되는 대로 자연스럽게 바뀐다.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.screenBg },
      }}
    >
      <Stack.Screen name="(tabs)" />
      {/* 오버레이 화면 — 열리면 하단 탭이 숨고 뒤로가기로 복귀 */}
      <Stack.Screen name="offering" />
    </Stack>
  );

  // 컴퓨터 브라우저(넓은 화면)에서는 앱을 가운데 컬럼에 담아 사용성을 유지한다.
  // 관리자 화면은 자료 입력이 편하도록 더 넓게 편다.
  // 높이 조건도 두어, 폰을 가로로 돌렸을 때(넓지만 낮음)는 그대로 꽉 채운다.
  const isDesktopWeb = Platform.OS === 'web' && width >= 768 && height >= 600;

  // 화면 구조는 항상 같게 두고 모양만 바꾼다 — 구조가 바뀌면 화면이 새로 그려져
  // 보던 사진·입력 중이던 내용이 사라진다(가로로 돌릴 때 사진 보기가 닫히던 문제).
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={isDesktopWeb ? styles.desktopBg : styles.fill}>
        <View
          style={
            isDesktopWeb
              ? [styles.frame, { maxWidth: pathname.startsWith('/admin') ? 820 : 520 }]
              : styles.fill
          }
        >
          {stack}
          {/* 처음 여신 분께 '홈 화면에 추가' 방법을 한 번 안내 */}
          <InstallGuide />
          {/* 안내서에서 '바로 가기'로 떠나 있는 동안 돌아가는 단추 */}
          <HelpReturnBar />
          {/* 처음 실행·새 표어 때 한 번 — 교회 표어 웰컴 */}
          <WelcomeScreen />
          {/* 앱이 첫 그림을 준비하는 동안 로고·슬로건 (인위적 지연 없음) */}
          <BrandSplash />
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  desktopBg: {
    flex: 1,
    backgroundColor: '#DEE4EB',
    alignItems: 'center',
  },
  frame: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.screenBg,
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(15, 40, 80, 0.08)',
  },
});
