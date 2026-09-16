/**
 * 새로 올라온 것이 있다는 작은 빨간 점.
 * 카드 오른쪽 위, 탭 이름 오른쪽에 붙인다.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function NewDot({ style }: { style?: object }) {
  return <View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5484D',
    // 카드·탭 바탕과 맞닿아도 또렷하게
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});
