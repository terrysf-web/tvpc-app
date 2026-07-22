import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
  });
  const { width } = useWindowDimensions();
  const pathname = usePathname();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

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
  const isDesktopWeb = Platform.OS === 'web' && width >= 768;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {isDesktopWeb ? (
        <View style={styles.desktopBg}>
          <View style={[styles.frame, { maxWidth: pathname.startsWith('/admin') ? 820 : 520 }]}>
            {stack}
          </View>
        </View>
      ) : (
        stack
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
