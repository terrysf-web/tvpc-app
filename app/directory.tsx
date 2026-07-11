import { useRouter } from 'expo-router';
import { Lock, MapPin, Phone, Search } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useDirectory, useMember } from '../src/data/member';
import { firebaseEnabled } from '../src/firebase';
import { openExternal } from '../src/links';
import { colors, font, shadows } from '../src/theme';

/** 교회 주소록 — 승인된 교인 전용. 승인 교인들의 프로필로 구성된다. */
export default function DirectoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useMember();
  const { rows, loading } = useDirectory(state === 'approved');
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? rows.filter(
        (m) =>
          m.name.includes(search.trim()) ||
          m.phone.includes(search.trim()) ||
          m.email.includes(search.trim().toLowerCase()),
      )
    : rows;

  let body: React.ReactNode;
  if (!firebaseEnabled || state === 'none' || state === 'noProfile' || state === 'pending') {
    body = (
      <View style={[styles.lockCard, shadows.card]}>
        <View style={styles.lockChip}>
          <Lock size={24} color={colors.primary} strokeWidth={1.9} />
        </View>
        <Text style={styles.lockTitle}>교인 전용 메뉴입니다</Text>
        <Text style={styles.lockSub}>
          {state === 'pending'
            ? '가입 승인이 완료되면 주소록을 볼 수 있습니다.\n관리자 승인을 기다려 주세요.'
            : '교회 주소록은 승인된 교인만 볼 수 있습니다.\n마이페이지에서 로그인 또는 가입 신청해 주세요.'}
        </Text>
        {(state === 'none' || state === 'noProfile') && (
          <Pressable style={styles.lockBtn} onPress={() => router.push('/mypage')}>
            <Text style={styles.lockBtnText}>
              {state === 'noProfile' ? '교인 정보 등록하기' : '로그인 · 가입 신청'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  } else if (state === 'loading' || loading) {
    body = <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />;
  } else {
    body = (
      <>
        <View style={[styles.searchBox, shadows.card]}>
          <Search size={17} color={colors.faint} strokeWidth={1.9} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="이름·전화·이메일 검색"
            placeholderTextColor={colors.faint}
          />
        </View>
        <Text style={styles.count}>교인 {filtered.length}명</Text>
        {filtered.map((m) => (
          <View key={m.id} style={[styles.row, shadows.card]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{m.name.slice(0, 1)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{m.name}</Text>
              {m.phone ? <Text style={styles.meta}>{m.phone}</Text> : null}
              {m.address ? (
                <View style={styles.addrRow}>
                  <MapPin size={11} color={colors.faint} strokeWidth={1.9} />
                  <Text style={styles.meta}>{m.address}</Text>
                </View>
              ) : null}
            </View>
            {m.phone ? (
              <Pressable style={styles.callBtn} onPress={() => openExternal(`tel:${m.phone}`)} hitSlop={6}>
                <Phone size={17} color={colors.primary} strokeWidth={1.9} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {filtered.length === 0 && <Text style={styles.empty}>검색 결과가 없습니다.</Text>}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <OverlayHeader title="교회 주소록" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16 },

  lockCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    alignItems: 'center',
    padding: 26,
    marginTop: 12,
  },
  lockChip: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockTitle: { fontFamily: font.extraBold, fontSize: 16.5, color: colors.title },
  lockSub: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  lockBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 11,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  lockBtnText: { fontFamily: font.bold, fontSize: 13.5, color: '#FFFFFF' },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.body,
  },
  count: { fontFamily: font.medium, fontSize: 12, color: colors.faint, marginBottom: 10 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.card,
    borderRadius: 15,
    padding: 13,
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: font.extraBold, fontSize: 17, color: colors.primary },
  name: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  meta: { marginTop: 2, fontFamily: font.regular, fontSize: 12, color: colors.muted },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.faint,
  },
});
