import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme';

/**
 * 코드 스플릿(React.lazy)된 화면이 내려받아지는 동안 잠깐 보이는 로딩 화면.
 * 무거운 화면(관리자·주보·교우 앨범 등)은 처음 접속 시 받는 번들에서 빼고
 * 그 화면으로 이동할 때만 따로 받는다 — 그 사이 빈 화면 대신 이걸 보여준다.
 */
export function RouteFallback() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.screenBg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
