import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpen, Clock, ClipboardPen, Globe, Mail, MapPin, MonitorPlay, Phone, Users } from 'lucide-react-native';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../../src/components/OverlayHeader';
import { churchInfo, mapsUrl } from '../../src/churchInfo';
import { useServices } from '../../src/data/services';
import { openExternal } from '../../src/links';
import { colors, font, shadows } from '../../src/theme';

type PageKey = 'about' | 'staff' | 'newcomer' | 'worship' | 'directions' | 'contact';

const TITLES: Record<PageKey, string> = {
  about: '교회 소개',
  staff: '섬기는 이들',
  newcomer: '새가족 안내',
  worship: '예배 시간 안내',
  directions: '오시는 길',
  contact: '도움받기',
};

function ActionRow({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.actionRow, shadows.card]} onPress={onPress}>
      <View style={styles.actionChip}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionLabel}>{label}</Text>
        {sub ? <Text style={styles.actionSub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

export default function InfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { page } = useLocalSearchParams<{ page: string }>();
  const { services } = useServices();
  const key = (
    ['about', 'staff', 'newcomer', 'worship', 'directions', 'contact'] as PageKey[]
  ).includes(page as PageKey)
    ? (page as PageKey)
    : 'about';

  const call = () => Linking.openURL(`tel:${churchInfo.phone.replaceAll('-', '')}`).catch(() => {});
  const openSite = () => openExternal(churchInfo.website);
  const openYoutube = () => openExternal(churchInfo.youtube);
  const openMap = () => Linking.openURL(mapsUrl).catch(() => {});
  // 메일 앱이 교회 주소가 적힌 새 메일로 바로 열린다
  const openEmail = () => {
    const url = 'mailto:admin@tvpc.church';
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.location.href = url;
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };
  const openInApp = (pageUrl: string, title: string) =>
    router.push({ pathname: '/browser', params: { url: pageUrl, t: title } });

  return (
    <View style={styles.screen}>
      <OverlayHeader title={TITLES[key]} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {key === 'about' && (
          <>
            <View style={[styles.card, shadows.card]}>
              <Text style={styles.churchName}>{churchInfo.nameKo}</Text>
              <Text style={styles.churchNameEn}>{churchInfo.nameEn}</Text>
              <Text style={styles.paragraph}>{churchInfo.intro}</Text>
            </View>
            <ActionRow
              icon={<BookOpen size={20} color={colors.primary} strokeWidth={1.9} />}
              label="교회 소개 전체 보기"
              sub="비전 · 연혁 · 섬기는 이들"
              onPress={() => openInApp(churchInfo.pages.about, '교회 소개')}
            />
            <ActionRow
              icon={<Globe size={20} color={colors.primary} strokeWidth={1.9} />}
              label="교회 홈페이지"
              sub="tvpc.church"
              onPress={openSite}
            />
            <ActionRow
              icon={<MonitorPlay size={20} color={colors.heartActive} strokeWidth={1.9} />}
              label="유튜브 채널"
              sub="@tri-valley"
              onPress={openYoutube}
            />
          </>
        )}

        {key === 'staff' && (
          <>
            <View style={[styles.card, shadows.card]}>
              {churchInfo.staff.map((s) => (
                <View key={s.name} style={styles.staffRow}>
                  <View style={styles.staffAvatar}>
                    <Text style={styles.staffAvatarText}>{s.name.slice(0, 1)}</Text>
                  </View>
                  <View>
                    <Text style={styles.staffName}>{s.name}</Text>
                    <Text style={styles.staffRole}>{s.role}</Text>
                  </View>
                </View>
              ))}
            </View>
            <ActionRow
              icon={<Users size={20} color={colors.primary} strokeWidth={1.9} />}
              label="섬기는 이들 전체 보기"
              sub="사진과 소개 — 교회 홈페이지"
              onPress={() => openInApp(churchInfo.pages.staff, '교역자 소개')}
            />
            <Text style={styles.note}>
              교역자 정보는 교회 사무실({churchInfo.phone})을 통해 확인·업데이트됩니다.
            </Text>
          </>
        )}

        {key === 'newcomer' && (
          <>
            <View style={[styles.card, shadows.card]}>
              <Text style={styles.welcomeTitle}>환영합니다! 🙌</Text>
              <Text style={styles.paragraph}>
                {churchInfo.nameKo}에 처음 오셨나요? 함께 예배하게 되어 기쁩니다.
              </Text>
              {churchInfo.newcomer.map((t, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={[styles.paragraph, { flex: 1, marginTop: 0 }]}>{t}</Text>
                </View>
              ))}
            </View>
            <Pressable
              style={styles.ctaBtnGhost}
              onPress={() => openInApp(churchInfo.pages.newcomers, '새가족 안내')}
            >
              <BookOpen size={18} color={colors.primary} strokeWidth={1.9} />
              <Text style={styles.ctaGhostText}>새가족 안내 보기</Text>
            </Pressable>
            <Pressable style={styles.ctaBtn} onPress={() => openExternal(churchInfo.pages.newcomerForm)}>
              <ClipboardPen size={18} color="#FFFFFF" strokeWidth={1.9} />
              <Text style={styles.ctaText}>새가족 등록하기</Text>
            </Pressable>
            <ActionRow
              icon={<Phone size={20} color={colors.tagGreenText} strokeWidth={1.9} />}
              label="새가족 문의 전화"
              sub={churchInfo.phone}
              onPress={call}
            />
          </>
        )}

        {key === 'worship' && (
          <>
            <View style={[styles.card, shadows.card]}>
              {services.map((s, i) => (
                <View
                  key={s.name}
                  style={[
                    styles.serviceRow,
                    i < services.length - 1 && styles.serviceDivider,
                  ]}
                >
                  <View style={styles.serviceChip}>
                    <Clock size={17} color={colors.primary} strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceName}>{s.name}</Text>
                    <Text style={styles.servicePlace}>{s.place}</Text>
                  </View>
                  <Text style={styles.serviceTime}>{s.time}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.note}>
              절기·행사에 따라 시간이 변경될 수 있습니다. 주보와 교회 소식을 확인해 주세요.
            </Text>
          </>
        )}

        {key === 'directions' && (
          <>
            <View style={[styles.card, shadows.card]}>
              <Text style={styles.addrLabel}>교회 주소</Text>
              <Text style={styles.addr}>{churchInfo.address}</Text>
            </View>
            <ActionRow
              icon={<MapPin size={20} color={colors.heartActive} strokeWidth={1.9} />}
              label="지도 앱에서 열기"
              sub="Google Maps"
              onPress={openMap}
            />
            <ActionRow
              icon={<Phone size={20} color={colors.tagGreenText} strokeWidth={1.9} />}
              label="전화 문의"
              sub={churchInfo.phone}
              onPress={call}
            />
          </>
        )}

        {key === 'contact' && (
          <>
            <ActionRow
              icon={<Phone size={20} color={colors.tagGreenText} strokeWidth={1.9} />}
              label="교회 사무실"
              sub={churchInfo.phone}
              onPress={call}
            />
            <ActionRow
              icon={<Mail size={20} color={colors.tagBlueText} strokeWidth={1.9} />}
              label="이메일 문의"
              sub="admin@tvpc.church"
              onPress={openEmail}
            />
            <ActionRow
              icon={<Globe size={20} color={colors.primary} strokeWidth={1.9} />}
              label="교회 홈페이지"
              sub="tvpc.church"
              onPress={openSite}
            />
            <ActionRow
              icon={<MonitorPlay size={20} color={colors.heartActive} strokeWidth={1.9} />}
              label="유튜브 채널"
              sub="@tri-valley"
              onPress={openYoutube}
            />
            <Text style={styles.note}>
              기도요청·심방·상담 문의는 사무실 전화 또는 주일 예배 후 교역자에게 말씀해 주세요.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, gap: 12 },

  card: { backgroundColor: colors.card, borderRadius: 16, padding: 18 },
  churchName: { fontFamily: font.extraBold, fontSize: 19, color: colors.title },
  churchNameEn: { marginTop: 2, fontFamily: font.medium, fontSize: 13, color: colors.muted2 },
  paragraph: {
    marginTop: 12,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 23,
    color: colors.body,
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.card,
    borderRadius: 15,
    padding: 14,
  },
  actionChip: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.screenBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  actionSub: { marginTop: 2, fontFamily: font.regular, fontSize: 12.5, color: colors.muted },

  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 6 },
  staffAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: { fontFamily: font.extraBold, fontSize: 18, color: colors.primary },
  staffName: { fontFamily: font.bold, fontSize: 15.5, color: colors.title },
  staffRole: { marginTop: 2, fontFamily: font.medium, fontSize: 12.5, color: colors.muted },

  welcomeTitle: { fontFamily: font.extraBold, fontSize: 17, color: colors.title },
  bulletRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'flex-start' },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 8,
  },

  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  serviceDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  serviceChip: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceName: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  servicePlace: { marginTop: 2, fontFamily: font.regular, fontSize: 12, color: colors.muted },
  serviceTime: { fontFamily: font.bold, fontSize: 13.5, color: colors.primary },

  addrLabel: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted },
  addr: {
    marginTop: 6,
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 22,
    color: colors.title,
  },

  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
  },
  ctaText: { fontFamily: font.bold, fontSize: 15, color: '#FFFFFF' },
  ctaBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  ctaGhostText: { fontFamily: font.bold, fontSize: 15, color: colors.primary },
  note: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.faint,
    paddingHorizontal: 4,
  },
});
