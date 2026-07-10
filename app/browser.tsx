import { useLocalSearchParams } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { openExternal } from '../src/links';
import { colors, font } from '../src/theme';

/** 앱 안에서 열 수 있는 호스트 — 교회 홈페이지만 허용 */
const ALLOWED_HOSTS = ['tvpc.church', 'www.tvpc.church'];

function isAllowed(url: string): boolean {
  try {
    return ALLOWED_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * 앱 내 웹페이지 뷰어 (주보 등 교회 홈페이지 콘텐츠).
 * 외부 브라우저 탭으로 나가지 않아 뒤로가기(←)로 앱에 바로 복귀한다.
 * 네이티브 앱에서는 인앱 브라우저(닫기 버튼 있음)로 연결.
 */
export default function BrowserScreen() {
  const { url, t } = useLocalSearchParams<{ url: string; t?: string }>();
  const insets = useSafeAreaInsets();
  const ok = !!url && isAllowed(url);

  useEffect(() => {
    if (Platform.OS !== 'web' && ok) {
      openExternal(url);
    }
  }, [url, ok]);

  return (
    <View style={styles.screen}>
      <OverlayHeader title={t || '교회 홈페이지'} />
      {Platform.OS === 'web' && ok ? (
        <>
          <View style={styles.frameWrap}>
            {React.createElement('iframe' as never, {
              src: url,
              style: { width: '100%', height: '100%', border: 0, backgroundColor: '#FFFFFF' },
              title: t || '교회 홈페이지',
            } as never)}
          </View>
          <Pressable
            style={[styles.fallback, { paddingBottom: Math.max(insets.bottom, 10) }]}
            onPress={() => openExternal(url)}
          >
            <ExternalLink size={14} color={colors.muted} strokeWidth={1.9} />
            <Text style={styles.fallbackText}>화면이 비어 보이면 여기를 눌러 새 탭에서 여세요</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.note}>{ok ? '페이지를 여는 중입니다…' : '열 수 없는 주소입니다.'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  frameWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  fallback: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  fallbackText: { fontFamily: font.regular, fontSize: 12, color: colors.muted },
  note: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.faint,
  },
});
