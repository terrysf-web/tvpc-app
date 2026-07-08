import { useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { openExternal } from '../src/links';
import { colors, font } from '../src/theme';

/**
 * 앱 내 영상 재생 화면 (웹 전용 유튜브 임베드).
 * 외부 탭으로 나가지 않으므로 iOS에서 about:blank 탭이 남는 문제가 없다.
 * 네이티브 앱에서는 유튜브 앱/브라우저로 연결.
 */
export default function WatchScreen() {
  const { v, t } = useLocalSearchParams<{ v: string; t?: string }>();
  const { width } = useWindowDimensions();
  const playerHeight = Math.min((width * 9) / 16, 320);

  useEffect(() => {
    if (Platform.OS !== 'web' && v) {
      openExternal(`https://www.youtube.com/watch?v=${v}`);
    }
  }, [v]);

  return (
    <View style={styles.screen}>
      <OverlayHeader title={t || '설교 영상'} />
      {Platform.OS === 'web' && v ? (
        <View style={[styles.playerWrap, { height: playerHeight }]}>
          {React.createElement('iframe' as never, {
            src: `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&playsinline=1&rel=0`,
            style: { width: '100%', height: '100%', border: 0 },
            allow:
              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            allowFullScreen: true,
            title: t || '설교 영상',
          } as never)}
        </View>
      ) : (
        <Text style={styles.note}>영상을 여는 중입니다…</Text>
      )}
      {t ? <Text style={styles.title}>{t}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  playerWrap: {
    backgroundColor: '#000000',
    width: '100%',
  },
  title: {
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 23,
    color: colors.title,
    padding: 16,
  },
  note: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.faint,
  },
});
