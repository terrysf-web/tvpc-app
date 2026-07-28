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
  /** 스크린리더·검색엔진용 그림 설명 (웹에서는 alt 속성이 된다) */
  alt?: string;
  /** 그림을 못 불러왔을 때 — 부모가 대신 글씨를 보여줄 수 있게 알려준다 */
  onError?: () => void;
  children?: React.ReactNode;
}

/**
 * 프로토타입의 <image-slot> 대응 — 실제 앱에서는 CMS/스토리지 URL 이미지를 표시하고,
 * URL이 없거나 로딩 중이면 그라데이션 배경을 보여준다.
 * deep 톤은 단색 대신 빛 번짐·링 장식을 얹은 레이어드 배경.
 */
export function PhotoSlot({ uri, style, tone = 'light', alt, onError, children }: Props) {
  // 주소는 있는데 그림을 못 불러온 경우(통신 끊김·삭제된 썸네일)에도
  // 빈 네모가 남지 않도록, 아래 그라데이션 배경으로 되돌린다.
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [uri]);
  const showImage = !!uri && !failed;

  return (
    <View style={[styles.base, style]}>
      {showImage ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          placeholder={null}
          alt={alt ?? ''}
          accessibilityLabel={alt}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
        />
      ) : tone === 'deep' ? (
        <>
          {/* 깊은 남색 사선 그라데이션 */}
          <LinearGradient
            colors={['#3573C4', '#1D4E8E', '#0E2850']}
            locations={[0, 0.52, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* 오른쪽 위 은은한 빛 번짐 */}
          <LinearGradient
            colors={['rgba(173,209,247,0.55)', 'rgba(173,209,247,0.0)']}
            start={{ x: 0.2, y: 0.1 }}
            end={{ x: 0.9, y: 0.95 }}
            style={styles.bloomLg}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.0)']}
            start={{ x: 0.3, y: 0.2 }}
            end={{ x: 0.85, y: 0.9 }}
            style={styles.bloomSm}
          />
          {/* 왼쪽 아래 따뜻한 새벽빛 */}
          <LinearGradient
            colors={['rgba(255,193,111,0.28)', 'rgba(255,193,111,0.0)']}
            start={{ x: 0.25, y: 0.25 }}
            end={{ x: 0.9, y: 0.9 }}
            style={styles.bloomWarm}
          />
          {/* 가는 링 장식 */}
          <View style={styles.ringLg} />
          <View style={styles.ringSm} />
        </>
      ) : (
        <LinearGradient
          colors={['#E9EDF2', '#DDE3EA']}
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
  bloomLg: {
    position: 'absolute',
    top: -80,
    right: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  bloomSm: {
    position: 'absolute',
    top: -20,
    right: 10,
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  bloomWarm: {
    position: 'absolute',
    bottom: -70,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  ringLg: {
    position: 'absolute',
    top: -46,
    right: 34,
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ringSm: {
    position: 'absolute',
    bottom: -34,
    left: 26,
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.10)',
  },
});
