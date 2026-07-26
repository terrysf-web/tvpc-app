import { useRouter } from 'expo-router';
import {
  BellRing,
  Building2,
  ChevronRight,
  Clock,
  Download,
  HeartHandshake,
  Images,
  Mail,
  MapPin,
  MessageCircle,
  RefreshCw,
  Share2,
  Upload,
  UserRound,
  Users,
} from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { churchInfo } from '../../src/churchInfo';
import { useAdminAuth } from '../../src/data/admin';
import { exportMemoBackup, importMemoBackup } from '../../src/data/backup';
import { usePushNotifications } from '../../src/push';
import { colors, font, shadows } from '../../src/theme';

const MENU = [
  { key: 'about', label: '교회 소개', icon: Building2 },
  { key: 'staff', label: '섬기는 이들', icon: Users },
  { key: 'newcomer', label: '새가족 안내', icon: UserRound },
  { key: 'service', label: '예배 시간 안내', icon: Clock },
  { key: 'direction', label: '오시는 길', icon: MapPin },
  { key: 'album', label: '교우 앨범', icon: Images },
  { key: 'contact', label: '도움받기', icon: MessageCircle },
  { key: 'backup', label: '내 메모 백업 (파일로 저장)', icon: Download },
  { key: 'restore', label: '메모 가져오기 (백업 복원)', icon: Upload },
  { key: 'share', label: '앱 공유하기', icon: Share2 },
  { key: 'refresh', label: '앱 새로고침 (최신 버전 불러오기)', icon: RefreshCw },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const push = usePushNotifications();
  // 긴급 공지·기도요청함 바로가기 — 역할에 맞는 기기에만 보인다
  const { isAdmin, role } = useAdminAuth();

  // 메일 앱이 주소·제목이 채워진 새 메일로 바로 열린다
  const openEmail = (to: string, subject: string) => {
    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}`;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.location.href = url;
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const notify = (m: string) => {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(m);
  };

  const onMenu = (key: (typeof MENU)[number]['key']) => {
    if (key === 'backup') {
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
      return;
    }
    if (key === 'restore') {
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
      return;
    }
    if (key === 'refresh') {
      // 홈 화면 앱(PWA)에는 새로고침 버튼이 없어 여기서 최신 버전을 다시 불러온다
      if (typeof window !== 'undefined') window.location.reload();
      return;
    }
    if (key === 'share') {
      Share.share({
        message:
          '트라이밸리 장로교회 앱 — 매일 말씀과 교회 소식을 받아보세요.\nhttps://app.tvpc.church',
      }).catch(() => {});
      return;
    }
    if (key === 'album') {
      router.push('/album');
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

      {/* 관리자 전용 — 긴급 공지 바로가기 */}
      {isAdmin && (
        <Pressable
          style={[styles.alertCard, shadows.card]}
          onPress={() => router.push('/alert-send')}
        >
          <View style={styles.alertChip}>
            <BellRing size={20} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertLabel}>긴급 공지 보내기</Text>
            <Text style={styles.alertSub}>모든 교인 기기로 몇 초 안에 알림</Text>
          </View>
          <ChevronRight size={18} color="#E5A9A4" strokeWidth={2} />
        </Pressable>
      )}

      {/* 목회자 전용 — 기도요청함 */}
      {role === 'pastor' && (
        <Pressable
          style={[styles.inboxCard, shadows.card]}
          onPress={() => router.push('/pray-inbox')}
        >
          <View style={styles.inboxChip}>
            <HeartHandshake size={20} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inboxLabel}>기도요청함</Text>
            <Text style={styles.inboxSub}>교인들이 보낸 기도 제목 보기</Text>
          </View>
          <ChevronRight size={18} color="#9CC3A9" strokeWidth={2} />
        </Pressable>
      )}

      {/* 2열 그리드 — 기도 요청 / 문의하기 (둘 다 교회 이메일로 연결) */}
      <View style={styles.gridRow}>
        <Pressable
          style={[styles.gridCard, shadows.card]}
          onPress={() => router.push('/pray-request')}
        >
          <View style={[styles.gridChip, { backgroundColor: colors.tagGreenBg }]}>
            <Text style={styles.prayEmoji}>🙏</Text>
          </View>
          <Text style={styles.gridLabel}>함께기도해요</Text>
          <Text style={styles.gridSub}>
            목사님께 나누고 싶은 기도 제목이나 마음의 짐이 있다면 편하게
            적어주세요. 목사님이 함께 기도합니다
          </Text>
        </Pressable>
        <Pressable
          style={[styles.gridCard, shadows.card]}
          onPress={() => openEmail('admin@tvpc.church', '도움 요청')}
        >
          <View style={[styles.gridChip, { backgroundColor: colors.tagBlueBg }]}>
            <Mail size={22} color={colors.primary} strokeWidth={1.9} />
          </View>
          <Text style={styles.gridLabel}>도움받기</Text>
          <Text style={styles.gridSub}>도움이 필요하시면 언제든지 말씀해 주세요</Text>
        </Pressable>
      </View>

      {/* 데일리브레드 알림 */}
      {push.supported && (
        <View style={[styles.pushCard, shadows.card]}>
          <View style={[styles.gridChip, { backgroundColor: colors.tagOrangeBg, marginBottom: 0 }]}>
            <BellRing size={20} color={colors.tagOrangeText} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.gridLabel}>알림 받기</Text>
            <Text style={styles.gridSub}>매일 아침 말씀과 교회 긴급 공지를 알려드려요</Text>
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

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF5F4',
    borderColor: '#F5D9D5',
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  alertChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.heartActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertLabel: { fontFamily: font.bold, fontSize: 14.5, color: '#8F3B33' },
  alertSub: { marginTop: 1, fontFamily: font.regular, fontSize: 12, color: '#B07068' },

  inboxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F2FAF4',
    borderColor: '#D8EBDD',
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  inboxChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.tagGreenText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxLabel: { fontFamily: font.bold, fontSize: 14.5, color: '#2C5E3A' },
  inboxSub: { marginTop: 1, fontFamily: font.regular, fontSize: 12, color: '#5F8A6C' },

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
  prayEmoji: { fontSize: 21, lineHeight: 26 },
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
