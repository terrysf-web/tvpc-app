import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '../theme';

interface Props<K extends string> {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
}

/** 세그먼트 탭 — 활성: 파란 텍스트 + 2.5px 언더라인, 비활성: #8B9099 */
export function SegmentTabs<K extends string>({ tabs, active, onChange }: Props<K>) {
  return (
    <View style={styles.row}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Pressable key={t.key} style={styles.tab} onPress={() => onChange(t.key)}>
            <Text style={[styles.label, on && styles.labelActive]}>{t.label}</Text>
            <View style={[styles.underline, on && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.segInactive,
    paddingVertical: 12,
  },
  labelActive: {
    fontFamily: font.bold,
    color: colors.primary,
  },
  underline: {
    height: 2.5,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  underlineActive: {
    backgroundColor: colors.primary,
  },
});
