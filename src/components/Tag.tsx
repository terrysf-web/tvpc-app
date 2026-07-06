import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font } from '../theme';

export type TagTone = 'green' | 'blue' | 'orange' | 'gray';

const TONES: Record<TagTone, { text: string; bg: string }> = {
  green: { text: colors.tagGreenText, bg: colors.tagGreenBg },
  blue: { text: colors.tagBlueText, bg: colors.tagBlueBg },
  orange: { text: colors.tagOrangeText, bg: colors.tagOrangeBg },
  gray: { text: colors.tagGrayText, bg: colors.tagGrayBg },
};

/** 기도요청/소식 카테고리 태그 (radius 6, 11–12px 라벨) */
export function Tag({ label, tone }: { label: string; tone: TagTone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }]}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: font.bold,
    fontSize: 11.5,
    lineHeight: 14,
  },
});
