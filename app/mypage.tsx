import { useRouter } from 'expo-router';
import {
  Bell,
  Bookmark,
  ChevronRight,
  HandCoins,
  HeartHandshake,
  Settings,
  UserRound,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useUser } from '../src/data/user';
import { colors, font, shadows } from '../src/theme';

export default function MyPageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useUser();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);

  const MENU = [
    { key: 'info', label: '내 정보', icon: UserRound, onPress: () => { setName(user.name); setEmail(user.email); setEditing(true); } },
    { key: 'noti', label: '알림 설정', icon: Bell, onPress: () => {} },
    { key: 'fav', label: '즐겨찾기 설교', icon: Bookmark, onPress: () => router.push('/sermon') },
    { key: 'prayer', label: '기도요청 관리', icon: HeartHandshake, onPress: () => router.push('/prayer') },
    { key: 'offering', label: '헌금 내역', icon: HandCoins, onPress: () => router.push('/offering') },
    { key: 'settings', label: '설정', icon: Settings, onPress: () => {} },
  ];

  const save = () => {
    updateUser({ name: name.trim() || user.name, email: email.trim() });
    setEditing(false);
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader title="마이페이지" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 프로필 카드 */}
        <View style={[styles.profileCard, shadows.card]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name.slice(0, 1)}</Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        {/* 메뉴 리스트 */}
        <View style={[styles.menuCard, shadows.card]}>
          {MENU.map((m, i) => (
            <Pressable
              key={m.key}
              style={[styles.menuRow, i < MENU.length - 1 && styles.menuDivider]}
              onPress={m.onPress}
            >
              <m.icon size={19} color={colors.muted} strokeWidth={1.9} />
              <Text style={styles.menuLabel}>{m.label}</Text>
              <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* 내 정보 수정 */}
      <Modal visible={editing} animationType="fade" transparent onRequestClose={() => setEditing(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>내 정보</Text>
            <Text style={styles.inputLabel}>이름</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} />
            <Text style={styles.inputLabel}>이메일</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.modalBtnRow}>
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setEditing(false)}>
                <Text style={styles.modalBtnGhostText}>취소</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={save}>
                <Text style={styles.modalBtnPrimaryText}>저장</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16 },

  profileCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: 26,
    marginBottom: 14,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontFamily: font.extraBold, fontSize: 28, color: colors.primary },
  name: { fontFamily: font.extraBold, fontSize: 18, color: colors.title },
  email: { marginTop: 4, fontFamily: font.regular, fontSize: 13, color: colors.muted },

  menuCard: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  menuLabel: { flex: 1, fontFamily: font.medium, fontSize: 14.5, color: colors.body },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,18,32,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: colors.card, borderRadius: 18, padding: 20 },
  modalTitle: { fontFamily: font.extraBold, fontSize: 17, color: colors.title, marginBottom: 8 },
  inputLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.muted,
  },
  input: {
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 14.5,
    color: colors.body,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 13 },
  modalBtnGhost: { backgroundColor: colors.tagGrayBg },
  modalBtnGhostText: { fontFamily: font.bold, fontSize: 14.5, color: colors.muted },
  modalBtnPrimary: { backgroundColor: colors.primary },
  modalBtnPrimaryText: { fontFamily: font.bold, fontSize: 14.5, color: '#FFFFFF' },
});
