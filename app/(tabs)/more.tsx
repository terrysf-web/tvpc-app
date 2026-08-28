import { useRouter } from 'expo-router';
import BellRing from 'lucide-react-native/dist/esm/icons/bell-ring.mjs';
import Building2 from 'lucide-react-native/dist/esm/icons/building-2.mjs';
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right.mjs';
import Download from 'lucide-react-native/dist/esm/icons/download.mjs';
import Heart from 'lucide-react-native/dist/esm/icons/heart.mjs';
import HeartHandshake from 'lucide-react-native/dist/esm/icons/heart-handshake.mjs';
import HandHelping from 'lucide-react-native/dist/esm/icons/hand-helping.mjs';
import Images from 'lucide-react-native/dist/esm/icons/images.mjs';
import Info from 'lucide-react-native/dist/esm/icons/info.mjs';
import Mail from 'lucide-react-native/dist/esm/icons/mail.mjs';
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle.mjs';
import Music from 'lucide-react-native/dist/esm/icons/music.mjs';
import RefreshCw from 'lucide-react-native/dist/esm/icons/refresh-cw.mjs';
import SquarePlus from 'lucide-react-native/dist/esm/icons/square-plus.mjs';
import UserRound from 'lucide-react-native/dist/esm/icons/user-round.mjs';
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { churchInfo } from '../../src/churchInfo';
import { useAdminAuth } from '../../src/data/admin';
import { canAddToHome, deviceKind, isStandalone, openInstallGuide } from '../../src/installPrompt';
import { openExternal } from '../../src/links';
import { NOTIFICATION_TOPICS, usePushNotifications } from '../../src/push';
import { colors, font, shadows } from '../../src/theme';

const MENU = [
  { key: 'about', label: '교회 소개', icon: Building2 },
  { key: 'newcomer', label: '새가족 안내', icon: UserRound },
  { key: 'gratitude', label: '감사일기', icon: Heart },
  { key: 'serveGuide', label: '섬김이 안내', icon: HandHelping },
  { key: 'album', label: '교우 앨범', icon: Images },
  { key: 'contact', label: '도움받기', icon: MessageCircle },
  { key: 'memoBackup', label: '메모 백업/복원', icon: Download },
  { key: 'install', label: '홈 화면에 추가하기', icon: SquarePlus },
  { key: 'appInfo', label: '앱 정보', icon: Info },
  { key: 'refresh', label: '앱 새로고침 (최신 버전 불러오기)', icon: RefreshCw },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const push = usePushNotifications();
  // 긴급 공지·기도요청함 바로가기 — 역할에 맞는 기기에만 보인다
  const { isAdmin, role } = useAdminAuth();
  // 이미 홈 화면 앱으로 열었거나 설치할 방법이 없는 브라우저면 이 줄은 뺀다.
  // 컴퓨터에서는 '바탕화면에 설치하기'로 말을 바꾼다.
  const menu = MENU.filter((m) => m.key !== 'install' || (!isStandalone() && canAddToHome())).map(
    (m) =>
      m.key === 'install' && deviceKind() === 'desktop'
        ? { ...m, label: '바탕화면에 설치하기' }
        : m,
  );

  // 메일 앱이 주소·제목이 채워진 새 메일로 바로 열린다
  const openEmail = (to: string, subject: string) => {
    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}`;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.location.href = url;
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const onMenu = (key: (typeof MENU)[number]['key']) => {
    if (key === 'refresh') {
      // 홈 화면 앱(PWA)에는 새로고침 버튼이 없어 여기서 최신 버전을 다시 불러온다
      if (typeof window !== 'undefined') window.location.reload();
      return;
    }
    if (key === 'install') {
      openInstallGuide();
      return;
    }
    if (key === 'memoBackup') {
      router.push('/memo-backup');
      return;
    }
    if (key === 'appInfo') {
      router.push('/app-info');
      return;
    }
    if (key === 'album') {
      router.push('/album');
      return;
    }
    if (key === 'gratitude') {
      router.push('/gratitude');
      return;
    }
    if (key === 'serveGuide') {
      router.push('/serve-guide');
      return;
    }
    const pages: Record<string, string> = {
      about: 'about',
      newcomer: 'newcomer',
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

      {/* 관리자 전용 — 긴급 공지 바로가기. 목회자는 이것만(가입 승인은
          목회자 화면엔 아예 없는 탭이라 자리만 차지해서 뺀다), 일반
          관리자는 가장 자주 쓰는 가입 승인과 나란히 절반씩 보여준다. */}
      {isAdmin && role === 'pastor' && (
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
      {isAdmin && role !== 'pastor' && (
        <View style={styles.gridRow}>
          <Pressable
            style={[styles.gridCard, shadows.card, { backgroundColor: '#FFF5F4' }]}
            onPress={() => router.push('/alert-send')}
          >
            <View style={[styles.gridChip, { backgroundColor: colors.heartActive }]}>
              <BellRing size={20} color="#FFFFFF" strokeWidth={1.9} />
            </View>
            <Text style={[styles.gridLabel, { color: '#8F3B33' }]}>긴급 공지</Text>
            <Text style={[styles.gridSub, { color: '#B07068' }]}>모든 교인에게 알림</Text>
          </Pressable>
          <Pressable
            style={[styles.gridCard, shadows.card, { backgroundColor: '#F2FAF4' }]}
            onPress={() => router.push('/admin')}
          >
            <View style={[styles.gridChip, { backgroundColor: colors.tagGreenText }]}>
              <UserRound size={20} color="#FFFFFF" strokeWidth={1.9} />
            </View>
            <Text style={[styles.gridLabel, { color: '#2C5E3A' }]}>가입 승인</Text>
            <Text style={[styles.gridSub, { color: '#5F8A6C' }]}>새 교인 승인하기</Text>
          </Pressable>
        </View>
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

      {/* 찬양앱 바로가기 */}
      <Pressable
        style={[styles.praiseCard, shadows.card]}
        onPress={() => openExternal(churchInfo.praiseApp)}
      >
        <View style={[styles.gridChip, { backgroundColor: colors.tagPurpleBg, marginBottom: 0 }]}>
          <Music size={20} color={colors.tagPurpleText} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.gridLabel}>찬양앱</Text>
          <Text style={styles.gridSub}>가사·악보를 확인해요</Text>
        </View>
        <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
      </Pressable>

      {/* 알림 — 긴급 공지는 켜두면 무조건 오고, 그 외 알림 종류는 따로 선택 */}
      {push.supported && (
        <View style={[styles.pushCard, shadows.card]}>
          <View style={styles.pushMainRow}>
            <View style={[styles.gridChip, { backgroundColor: colors.tagOrangeBg, marginBottom: 0 }]}>
              <BellRing size={20} color={colors.tagOrangeText} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.gridLabel}>알림 받기</Text>
              <Text style={styles.gridSub}>이 기기로 알림을 받을 수 있게 켜 주세요</Text>
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

          {push.enabled && NOTIFICATION_TOPICS.length > 0 && (
            <Pressable
              style={styles.pushDetailRow}
              onPress={() => router.push('/notification-settings')}
            >
              <Text style={styles.pushDetailText}>오늘의 말씀 · 감사일기 알림 시각 설정</Text>
              <ChevronRight size={16} color={colors.faint2} strokeWidth={1.9} />
            </Pressable>
          )}
        </View>
      )}

      {/* 리스트 메뉴 */}
      <View style={[styles.menuCard, shadows.card]}>
        {menu.map((m, i) => (
          <Pressable
            key={m.key}
            style={[styles.menuRow, i < menu.length - 1 && styles.menuDivider]}
            onPress={() => onMenu(m.key)}
          >
            <m.icon size={19} color={colors.muted} strokeWidth={1.9} />
            <Text style={styles.menuLabel}>{m.label}</Text>
            <ChevronRight size={18} color={colors.faint2} strokeWidth={1.9} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.footer}>
        트라이밸리 장로교회{'\n'}Tri-Valley Presbyterian Church{'\n'}© 2026 All rights reserved.
      </Text>

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

  praiseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },

  pushCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  pushMainRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  pushError: { marginTop: 4, fontFamily: font.regular, fontSize: 11.5, color: colors.heartActive },
  pushDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  pushDetailText: { fontFamily: font.medium, fontSize: 13, color: colors.muted },

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
