import { useRouter } from 'expo-router';
import {
  BookUser,
  ChevronRight,
  HandCoins,
  HeartHandshake,
  Hourglass,
  LogOut,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { useMember } from '../src/data/member';
import { useUser } from '../src/data/user';
import { firebaseEnabled } from '../src/firebase';
import { colors, font, shadows } from '../src/theme';

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboard?: 'email-address' | 'phone-pad';
}) {
  return (
    <View style={{ marginBottom: 13 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        secureTextEntry={secure}
        keyboardType={keyboard}
        autoCapitalize="none"
      />
    </View>
  );
}

/**
 * 마이페이지 — 교인 로그인/회원가입 센터.
 * 가입 신청 → 관리자 승인 → 주소록·헌금 내역·기도요청 이용 가능.
 */
export default function MyPageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { updateUser } = useUser();
  const { state, member, signUp, signIn, signOut, updateProfile } = useMember();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [editing, setEditing] = useState(false);

  // 승인된 교인 이름을 홈 인사말에도 반영
  useEffect(() => {
    if (member?.name) updateUser({ name: member.name, email: member.email });
  }, [member?.name, member?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<void>, doneMsg?: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await fn();
      if (doneMsg) setMsg(`✓ ${doneMsg}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      let friendly = '요청에 실패했습니다. 입력을 확인해 주세요.';
      if (raw.includes('email-already-in-use')) friendly = '이미 가입된 이메일입니다. 로그인해 주세요.';
      else if (raw.includes('weak-password')) friendly = '비밀번호는 6자 이상이어야 합니다.';
      else if (raw.includes('invalid-email')) friendly = '이메일 형식을 확인해 주세요.';
      else if (raw.includes('invalid-credential') || raw.includes('wrong-password') || raw.includes('user-not-found'))
        friendly = '이메일 또는 비밀번호가 올바르지 않습니다.';
      else if (raw) friendly = raw;
      setMsg(friendly);
    } finally {
      setBusy(false);
    }
  };

  const doLogin = () => run(() => signIn(email, pw));
  const doSignup = () =>
    run(async () => {
      if (!name.trim()) throw new Error('이름을 입력해 주세요.');
      if (!email.trim() || !pw) throw new Error('이메일과 비밀번호를 입력해 주세요.');
      await signUp({ name, phone, address, email, password: pw });
    });
  const saveProfile = () =>
    run(async () => {
      await updateProfile({ name: name.trim(), phone: phone.trim(), address: address.trim() });
      setEditing(false);
    }, '저장됐습니다.');

  const MENU = [
    { key: 'directory', label: '교회 주소록', icon: BookUser, onPress: () => router.push('/directory') },
    { key: 'offering', label: '내 헌금 내역', icon: HandCoins, onPress: () => router.push('/offering') },
    { key: 'prayer', label: '기도요청', icon: HeartHandshake, onPress: () => router.push('/prayer') },
  ];

  let body: React.ReactNode;

  if (!firebaseEnabled) {
    body = <Text style={styles.note}>데모 모드에서는 교인 로그인을 사용할 수 없습니다.</Text>;
  } else if (state === 'loading') {
    body = <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />;
  } else if (state === 'none') {
    // 로그인 / 회원가입
    body = (
      <View style={[styles.card, shadows.card]}>
        <View style={styles.modeRow}>
          {(['login', 'signup'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => {
                setMode(m);
                setMsg(null);
              }}
            >
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                {m === 'login' ? '로그인' : '회원가입'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.introText}>
          {mode === 'login'
            ? '교인 계정으로 로그인하면 주소록·헌금 내역·기도요청을 이용할 수 있습니다.'
            : '가입 신청 후 관리자 승인이 완료되면 교인 전용 기능을 이용할 수 있습니다.'}
        </Text>
        {mode === 'signup' && (
          <>
            <Field label="이름" value={name} onChange={setName} placeholder="홍길동" />
            <Field label="전화번호" value={phone} onChange={setPhone} placeholder="925-000-0000" keyboard="phone-pad" />
            <Field label="주소 (선택)" value={address} onChange={setAddress} placeholder="Pleasanton, CA" />
          </>
        )}
        <Field label="이메일" value={email} onChange={setEmail} placeholder="me@example.com" keyboard="email-address" />
        <Field label="비밀번호 (6자 이상)" value={pw} onChange={setPw} secure placeholder="••••••••" />
        {msg ? <Text style={[styles.msg, msg.startsWith('✓') ? styles.msgOk : styles.msgErr]}>{msg}</Text> : null}
        <Pressable
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          onPress={mode === 'login' ? doLogin : doSignup}
          disabled={busy}
        >
          <Text style={styles.primaryBtnText}>
            {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입 신청'}
          </Text>
        </Pressable>
      </View>
    );
  } else if (state === 'pending') {
    body = (
      <View style={[styles.card, shadows.card, { alignItems: 'center' }]}>
        <View style={styles.pendingChip}>
          <Hourglass size={26} color={colors.tagOrangeText} strokeWidth={1.9} />
        </View>
        <Text style={styles.pendingTitle}>가입 신청이 접수됐어요</Text>
        <Text style={styles.pendingSub}>
          {member?.name}님, 관리자 승인이 완료되면{'\n'}주소록·헌금 내역·기도요청을 이용할 수 있습니다.
        </Text>
        <Pressable style={styles.ghostBtn} onPress={() => run(signOut)}>
          <Text style={styles.ghostBtnText}>로그아웃</Text>
        </Pressable>
      </View>
    );
  } else {
    // 승인된 교인
    body = (
      <>
        <View style={[styles.profileCard, shadows.card]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{member?.name.slice(0, 1)}</Text>
          </View>
          <Text style={styles.name}>{member?.name}</Text>
          <Text style={styles.email}>{member?.email}</Text>
          {member?.phone ? <Text style={styles.email}>{member.phone}</Text> : null}
          <Pressable
            style={styles.editLink}
            onPress={() => {
              setName(member?.name ?? '');
              setPhone(member?.phone ?? '');
              setAddress(member?.address ?? '');
              setEditing(!editing);
              setMsg(null);
            }}
          >
            <Text style={styles.editLinkText}>{editing ? '수정 닫기' : '내 정보 수정'}</Text>
          </Pressable>
        </View>

        {editing && (
          <View style={[styles.card, shadows.card]}>
            <Field label="이름" value={name} onChange={setName} />
            <Field label="전화번호" value={phone} onChange={setPhone} keyboard="phone-pad" />
            <Field label="주소" value={address} onChange={setAddress} />
            {msg ? <Text style={[styles.msg, msg.startsWith('✓') ? styles.msgOk : styles.msgErr]}>{msg}</Text> : null}
            <Pressable style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={saveProfile} disabled={busy}>
              <Text style={styles.primaryBtnText}>{busy ? '저장 중…' : '저장'}</Text>
            </Pressable>
          </View>
        )}

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

        <Pressable style={styles.logoutRow} onPress={() => run(signOut)}>
          <LogOut size={16} color={colors.faint} strokeWidth={1.9} />
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OverlayHeader title="마이페이지" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16 },
  note: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.faint,
  },

  card: { backgroundColor: colors.card, borderRadius: 18, padding: 18, marginBottom: 14 },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: colors.screenBg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  modeBtn: { flex: 1, borderRadius: 9, alignItems: 'center', paddingVertical: 9 },
  modeBtnActive: { backgroundColor: colors.card, ...shadows.card },
  modeText: { fontFamily: font.medium, fontSize: 13.5, color: colors.muted },
  modeTextActive: { fontFamily: font.bold, color: colors.primary },
  introText: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.muted,
    marginBottom: 16,
  },

  fieldLabel: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted, marginBottom: 6 },
  input: {
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 14.5,
    color: colors.body,
  },
  msg: { marginBottom: 10, fontFamily: font.medium, fontSize: 13 },
  msgOk: { color: colors.tagGreenText },
  msgErr: { color: colors.heartActive },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 15, color: '#FFFFFF' },
  ghostBtn: {
    marginTop: 16,
    borderRadius: 11,
    backgroundColor: colors.tagGrayBg,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  ghostBtnText: { fontFamily: font.bold, fontSize: 13.5, color: colors.muted },

  pendingChip: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.tagOrangeBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pendingTitle: { fontFamily: font.extraBold, fontSize: 17, color: colors.title },
  pendingSub: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },

  profileCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: 24,
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
  email: { marginTop: 3, fontFamily: font.regular, fontSize: 13, color: colors.muted },
  editLink: { marginTop: 10, padding: 4 },
  editLinkText: { fontFamily: font.bold, fontSize: 12.5, color: colors.primary },

  menuCard: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  menuDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider2 },
  menuLabel: { flex: 1, fontFamily: font.medium, fontSize: 14.5, color: colors.body },

  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    padding: 8,
  },
  logoutText: { fontFamily: font.medium, fontSize: 13, color: colors.faint },
});
