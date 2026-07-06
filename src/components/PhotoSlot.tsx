import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

interface Props {
  /** 원격 이미지 URL — 없으면 그라데이션 플레이스홀더 */
  uri?: string | null;
  style?: ViewStyle | ViewStyle[];
  /**
   * deep: 위에 흰 텍스트가 올라가는 히어로용(브랜드 딥블루)
   * light: 리스트 썸네일용(옅은 회색)
   */
  tone?: 'deep' | 'light';
  children?: React.ReactNode;
}

/**
 * 프로토타입의 <image-slot> 대응 — 실제 앱에서는 CMS/스토리지 URL 이미지를 표시하고,
 * URL이 없거나 로딩 중이면 스켈레톤(그라데이션)을 보여준다.
 */
export function PhotoSlot({ uri, style, tone = 'light', children }: Props) {
  const gradient =
    tone === 'deep'
      ? (['#2A6BB5', '#163F73'] as const)
      : (['#E9EDF2', '#DDE3EA'] as const);

  return (
    <View style={[styles.base, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          placeholder={null}
        />
      ) : (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: '#E9EDF2',
  },
});
