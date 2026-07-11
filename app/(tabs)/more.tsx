import { useRouter } from 'expo-router';
import {
  BellRing,
  BookUser,
  Building2,
  ChevronRight,
  Clock,
  HandCoins,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Share2,
  UserRound,
  Users,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../../src/data/user';
import { usePushNotifications } from '../../src/push';
import { colors, font, shadows } from '../../src/theme';

const MENU = [
  { key: 'directory', label: '교회 주소록 (교인 전용)', icon: BookUser },
  { key: 'about', label: '교회 소개', icon: Building2 },
  { key: 'staff', label: '교역자 소개', icon: Users },
  { key: 'newcomer', label: '새가족 안내', icon: UserRound },
  { key: 'service', label: '예배 시간 안내', icon: Clock },
  { key: 'direction', label: '오시는 길', icon: MapPin },
  { key: 'contact', label: '문의하기', icon: MessageCircle },
  { key: 'share', label: '앱 공유하기', icon: Share2 },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const push = usePushNotifications();

  const onMenu = (key: (typeof MENU)[number]['key']) => {
    if (key === 'directory') {
      router.push('/directory');
      return;
    }
    if (key === 'share') {
      Share.share({
        message:
          '트라이밸리 장로교회 앱 — 매일 말씀과 교회 소식을 받아보세요.\nhttps://happytvpc.web.app',
      }).catch(() => {});
      return;
    }
    const pages: Record<string, string> = {
      about: 'about',
      staff: 'staff',
      newcomer: 'newcomer',
      service: 'worship',
      direction: 'directions',
      contact: 'contact',
    };
    router.push(`/info/${pages[key]}`);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 20) + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>더보기</Text>

      {/* 프로필 카드 */}
      <Pressable style={[styles.profileCard, shadows.card]} onPress={() => router.push('/mypage')}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name.slice(0, 1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{user.name}</Text>
          <Text style={styles.profileLink}>마이페이지 보기</Text>
        </View>
        <ChevronRight size={20} color={colors.faint} strokeWidth={1.9} />
      </Pressable>

      {/* 2열 그리드 — 기도요청 / 온라인 헌금 */}
      <View style={styles.gridRow}>
        <Pressable style={[styles.gridCard, shadows.card]} onPress={() => router.push('/prayer')}>
          <View style={[styles.gridChip, { backgroundColor: colors.tagGreenBg }]}>
            <HeartHandshake size={22} color={colors.tagGreenText} strokeWidth={1.9} />
          </View>
          <Text style={styles.gridLabel}>기도요청</Text>
          <Text style={styles.gridSub}>함께 기도해요</Text>
        </Pressable>
        <Pressable style={[styles.gridCard, shadows.card]} onPress={() => router.push('/offering')}>
          <View style={[styles.gridChip, { backgroundColor: colors.tagBlueBg }]}>
            <HandCoins size={22} color={colors.primary} strokeWidth={1.9} />
          </View>
          <Text style={styles.gridLabel}>온라인 헌금</Text>
          <Text style={styles.gridSub}>어디서나 간편하게</Text>
        </Pressable>
      </View>

      {/* 데일리브레드 알림 */}
      {push.supported && (
        <View style={[styles.pushCard, shadows.card]}>
          <View style={[styles.gridChip, { backgroundColor: colors.tagOrangeBg, marginBottom: 0 }]}>
            <BellRing size={20} color={colors.tagOrangeText} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.gridLabel}>말씀 알림</Text>
            <Text style={styles.gridSub}>매일 아침 오늘의 말씀을 알려드려요</Text>
            {push.error ? <Text style={styles.pushError}>{push.error}</Text> : null}
          </View>
          {push.busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Switch
              value={push.enabled}
              onValueChange={push.toggle}
              trackColor={{ false: colors.faint2, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          )}
        </View>
      )}

      {/* 리스트 메뉴 */}
      <View style={[styles.menuCard, shadows.card]}>
        {MENU.map((m, i) => (
          <Pressable
            key={m.key}
            style={[styles.menuRow, i < MENU.length - 1 && styles.menuDivider]}
            onPress={() => onMenu(m.key)}
          >
            <m.icon size={19} color={colors.muted} strokeWidth={1.9} />
            <Text style={styles.menuLabel}>{m.label}</Text>
            <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.footer}>트라이밸리 장로교회{'\n'}Tri-Valley Presbyterian Church</Text>

      <Pressable style={styles.adminLink} onPress={() => router.push('/admin')} hitSlop={8}>
        <Text style={styles.adminLinkText}>교역자 · 관리자</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { paddingHorizontal: 16, paddingBottom: 28 },
  screenTitle: {
    fontFamily: font.extraBold,
    fontSize: 21,
    letterSpacing: -0.4,
    color: colors.title,
    marginBottom: 16,
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: font.extraBold, fontSize: 20, color: colors.primary },
  profileName: { fontFamily: font.extraBold, fontSize: 16.5, color: colors.title },
  profileLink: { marginTop: 3, fontFamily: font.medium, fontSize: 12.5, color: colors.primary },

  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  gridCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  gridChip: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  gridLabel: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  gridSub: { fontFamily: font.regular, fontSize: 12, color: colors.muted },

  pushCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  pushError: { marginTop: 4, fontFamily: font.regular, fontSize: 11.5, color: colors.heartActive },

  menuCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
  },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  menuLabel: { flex: 1, fontFamily: font.medium, fontSize: 14.5, color: colors.body },

  footer: {
    marginTop: 22,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.faint,
  },
  adminLink: { alignSelf: 'center', marginTop: 10, padding: 6 },
  adminLinkText: { fontFamily: font.medium, fontSize: 11.5, color: colors.faint2 },
});
