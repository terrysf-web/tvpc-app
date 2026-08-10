import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { SegmentTabs } from '../src/components/SegmentTabs';
import { useMember } from '../src/data/member';
import { colors, font, radius, shadows } from '../src/theme';

/** Firebase Auth 오류 코드 → 교인이 이해할 수 있는 한글 안내 */
function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return '이미 가입된 이메일입니다. 로그인 탭에서 로그인해 주세요.';
    case 'auth/invalid-email':
      return '이메일 형식을 확인해 주세요.';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상으로 만들어 주세요.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/user-not-found':
      return '가입된 계정을 찾을 수 없습니다. 가입 탭에서 먼저 가입해 주세요.';
    case 'auth/too-many-requests':
      return '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    default:
      return e instanceof Error ? e.message : '처리 중 문제가 발생했습니다.';
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
      />
    </View>
  );
}

/** 기존 교인 / 새로 가입 선택 — 두 칸 세그먼트 버튼 */
function MemberTypeToggle({
  value,
  onChange,
}: {
  value: 'existing' | 'new';
  onChange: (v: 'existing' | 'new') => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>교인 구분</Text>
      <View style={styles.typeRow}>
        {(
          [
            { key: 'existing' as const, label: '기존 교인' },
            { key: 'new' as const, label: '새로 가입' },
          ]
        ).map((o) => (
          <Pressable
            key={o.key}
            style={[styles.typeBtn, value === o.key && styles.typeBtnActive]}
            onPress={() => onChange(o.key)}
          >
            <Text style={[styles.typeBtnText, value === o.key && styles.typeBtnTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * 교인 회원가입/로그인 — 승인된 교인만 볼 수 있는 화면(교우 앨범 등)의 관문.
 * 가입 → members/{uid} 문서가 pending으로 생성 → 관리자 승인 → approved.
 * (관리자 승인은 /admin 화면의 "가입 승인" 탭에서 처리한다.)
 */
export default function MemberLoginScreen() {
  const router = useRouter();
  const { state, member, authEmail, signUp, signIn, signOut, createProfile, resetPassword } =
    useMember();
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // 로그인 폼
  const [lEmail, setLEmail] = useState('');
  const [lPassword, setLPassword] = useState('');

  // 가입 폼 (계정 정보 없이 members 문서만 등록하는 noProfile 상태에서도 재사용)
  const [name, setName] = useState('');
  const [memberType, setMemberType] = useState<'existing' | 'new'>('existing');
  const [bio, setBio] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPassword, setSPassword] = useState('');

  const doLogin = async () => {
    setErr(null);
    if (!lEmail.trim() || !lPassword) {
      setErr('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await signIn(lEmail, lPassword);
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const doSignUp = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr('이름을 입력해 주세요.');
      return;
    }
    if (memberType === 'new' && !bio.trim()) {
      setErr('새로 가입하시는 분은 간단한 자기소개를 남겨 주세요.');
      return;
    }
    if (!sEmail.trim() || sPassword.length < 6) {
      setErr('이메일과 6자 이상의 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await signUp({ name, email: sEmail, password: sPassword, memberType, bio });
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const doCreateProfile = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr('이름을 입력해 주세요.');
      return;
    }
    if (memberType === 'new' && !bio.trim()) {
      setErr('새로 가입하시는 분은 간단한 자기소개를 남겨 주세요.');
      return;
    }
    setBusy(true);
    try {
      await createProfile({ name, memberType, bio });
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const doResetPassword = async () => {
    setErr(null);
    setResetMsg(null);
    if (!lEmail.trim()) {
      setErr('비밀번호를 재설정할 이메일을 먼저 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(lEmail);
      setResetMsg(`${lEmail} 로 비밀번호 재설정 메일을 보냈습니다.`);
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <View style={styles.screen}>
        <OverlayHeader title="교인 로그인" />
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      </View>
    );
  }

  // 승인 대기 중
  if (state === 'pending') {
    return (
      <View style={styles.screen}>
        <OverlayHeader title="교인 로그인" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.title}>가입 승인 대기 중입니다</Text>
            <Text style={styles.sub}>
              {member?.name ? `${member.name}님, ` : ''}가입 신청이 접수됐습니다. 관리자 승인 후
              교우 앨범 등 교인 전용 화면을 이용하실 수 있습니다.
            </Text>
            <Pressable style={styles.secondaryBtn} onPress={signOut}>
              <Text style={styles.secondaryBtnText}>로그아웃</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // 승인 완료
  if (state === 'approved') {
    return (
      <View style={styles.screen}>
        <OverlayHeader title="교인 로그인" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.title}>✓ {member?.name ?? '교인'}님, 환영합니다</Text>
            <Text style={styles.sub}>가입이 승인되어 교우 앨범을 보실 수 있습니다.</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/album'))}
            >
              <Text style={styles.primaryBtnText}>교우 앨범으로 돌아가기</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={signOut}>
              <Text style={styles.secondaryBtnText}>로그아웃</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // 계정은 있지만 교인 정보 미등록 — 정보만 입력받는다
  if (state === 'noProfile') {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <OverlayHeader title="교인 정보 등록" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.title}>교인 정보를 등록해 주세요</Text>
            <Text style={styles.sub}>
              {authEmail} 계정으로 로그인했지만 등록된 교인 정보가 없습니다. 아래 정보를
              입력하면 승인 후 이용하실 수 있습니다.
            </Text>
            <Field label="이름" value={name} onChange={setName} placeholder="홍길동" />
            <MemberTypeToggle value={memberType} onChange={setMemberType} />
            {memberType === 'new' && (
              <Field
                label="자기소개"
                value={bio}
                onChange={setBio}
                placeholder="간단히 소개해 주세요 (가족관계, 어떻게 오시게 됐는지 등)"
                multiline
              />
            )}
            {err ? <Text style={styles.error}>{err}</Text> : null}
            <Pressable
              style={[styles.primaryBtn, busy && styles.btnBusy]}
              onPress={doCreateProfile}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{busy ? '등록 중…' : '정보 등록'}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={signOut}>
              <Text style={styles.secondaryBtnText}>로그아웃</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // 로그인 전 — 로그인 / 가입 탭
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OverlayHeader title="교인 로그인" />
      <SegmentTabs
        tabs={[
          { key: 'login' as const, label: '로그인' },
          { key: 'signup' as const, label: '가입' },
        ]}
        active={authTab}
        onChange={(t) => {
          setAuthTab(t);
          setErr(null);
          setResetMsg(null);
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, shadows.card]}>
          {authTab === 'login' ? (
            <>
              <Text style={styles.title}>교인 로그인</Text>
              <Text style={styles.sub}>
                교우 앨범 등 교인 전용 화면은 승인된 교인만 볼 수 있습니다. 가입하신 이메일로
                로그인해 주세요.
              </Text>
              <Field
                label="이메일"
                value={lEmail}
                onChange={setLEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
              />
              <Field label="비밀번호" value={lPassword} onChange={setLPassword} secure />
              {err ? <Text style={styles.error}>{err}</Text> : null}
              {resetMsg ? <Text style={styles.hintOk}>{resetMsg}</Text> : null}
              <Pressable
                style={[styles.primaryBtn, busy && styles.btnBusy]}
                onPress={doLogin}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? '로그인 중…' : '로그인'}</Text>
              </Pressable>
              <Pressable onPress={doResetPassword} disabled={busy}>
                <Text style={styles.linkText}>비밀번호를 잊으셨나요?</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>교인 가입 신청</Text>
              <Text style={styles.sub}>
                가입 신청 후 관리자 승인을 받으면 교우 앨범 등 교인 전용 화면을 이용하실 수
                있습니다.
              </Text>
              <Field label="이름" value={name} onChange={setName} placeholder="홍길동" />
              <Field
                label="이메일"
                value={sEmail}
                onChange={setSEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
              />
              <Field label="비밀번호 (6자 이상)" value={sPassword} onChange={setSPassword} secure />
              <MemberTypeToggle value={memberType} onChange={setMemberType} />
              {memberType === 'new' && (
                <Field
                  label="자기소개"
                  value={bio}
                  onChange={setBio}
                  placeholder="간단히 소개해 주세요 (가족관계, 어떻게 오시게 됐는지 등)"
                  multiline
                />
              )}
              {err ? <Text style={styles.error}>{err}</Text> : null}
              <Pressable
                style={[styles.primaryBtn, busy && styles.btnBusy]}
                onPress={doSignUp}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? '신청 중…' : '가입 신청'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 20,
    marginTop: 16,
  },
  title: { fontFamily: font.extraBold, fontSize: 17, color: colors.title },
  sub: {
    marginTop: 8,
    marginBottom: 16,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  field: { marginBottom: 14 },
  fieldLabel: {
    marginBottom: 6,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.muted,
  },
  input: {
    backgroundColor: colors.screenBg,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.body,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.screenBg,
  },
  typeBtnActive: { backgroundColor: colors.tagBlueBg, borderColor: colors.primary },
  typeBtnText: { fontFamily: font.medium, fontSize: 13.5, color: colors.muted },
  typeBtnTextActive: { fontFamily: font.bold, color: colors.primary },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 14.5, color: '#FFFFFF' },
  btnBusy: { opacity: 0.6 },
  secondaryBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  secondaryBtnText: { fontFamily: font.bold, fontSize: 13.5, color: colors.muted },
  linkText: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.primary,
  },
  error: {
    marginTop: 2,
    marginBottom: 10,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.badge,
  },
  hintOk: {
    marginTop: 2,
    marginBottom: 10,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.tagGreenText,
  },
});
