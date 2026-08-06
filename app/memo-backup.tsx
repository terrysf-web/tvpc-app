import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right.mjs';
import Download from 'lucide-react-native/dist/esm/icons/download.mjs';
import Upload from 'lucide-react-native/dist/esm/icons/upload.mjs';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { exportMemoBackup, importMemoBackup } from '../src/data/backup';
import { colors, font, shadows } from '../src/theme';

/** 메모 백업/복원 — 더보기 화면의 '내 메모 백업'·'메모 가져오기' 두 항목을 한 화면으로 모았다. */
export default function MemoBackupScreen() {
  const insets = useSafeAreaInsets();

  const notify = (m: string) => {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(m);
  };

  const onBackup = () => {
    try {
      const n = exportMemoBackup();
      notify(
        n > 0
          ? `메모 ${n}건을 백업 파일로 저장했습니다. 파일을 잘 보관해 주세요.`
          : '아직 백업할 메모가 없습니다.',
      );
    } catch {
      notify('백업에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const onRestore = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const n = await importMemoBackup(file);
        notify(`메모 ${n}건을 되살렸습니다. 앱을 새로고침합니다.`);
        window.location.reload();
      } catch (e) {
        notify(e instanceof Error ? e.message : '복원에 실패했습니다.');
      }
    };
    input.click();
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="메모 백업/복원" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          설교 메모, 괄호 답, 말씀 메모·형광펜, 저장한 말씀은 이 기기에만 저장돼요. 기기를
          바꾸거나 앱을 지우기 전에 파일로 저장해두면 나중에 그대로 되살릴 수 있어요.
        </Text>

        <View style={[styles.card, shadows.card]}>
          <Pressable style={styles.row} onPress={onBackup}>
            <View style={[styles.chip, { backgroundColor: colors.tagBlueBg }]}>
              <Download size={19} color={colors.primary} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>메모 백업 (파일로 저장)</Text>
              <Text style={styles.sub}>지금까지 쓴 메모를 파일 하나로 내려받아요</Text>
            </View>
            <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={onRestore}>
            <View style={[styles.chip, { backgroundColor: colors.tagGreenBg }]}>
              <Upload size={19} color={colors.tagGreenText} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>메모 복원 (백업 파일 가져오기)</Text>
              <Text style={styles.sub}>저장해둔 백업 파일을 골라 되살려요</Text>
            </View>
            <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
          </Pressable>
        </View>

        <Text style={styles.note}>
          백업 파일은 서버로 전송되지 않고 이 기기에서 바로 저장·복원됩니다.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, gap: 14 },
  intro: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    paddingHorizontal: 2,
  },
  card: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  chip: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  sub: { marginTop: 2, fontFamily: font.regular, fontSize: 12, color: colors.muted },
  note: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.faint,
    paddingHorizontal: 4,
  },
});
