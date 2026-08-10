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
import { adminGoogleSignIn } from '../src/firebase';
import { useMember } from '../src/data/member';
import { colors, font, radius, shadows } from '../src/theme';

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
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
        autoCorrect={false}
        multiline={multiline}
      />
    </View>
  );
}

/** "교인이신가요?" 예/아니오 — 예면 바로 신청, 아니오면 자기소개를 더 받는다 */
function MemberTypeToggle({
  value,
  onChange,
}: {
  value: 'existing' | 'new';
  onChange: (v: 'existing' | 'new') => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>교인이신가요?</Text>
      <View style={styles.typeRow}>
        {(
          [
            { key: 'existing' as const, label: '예' },
            { key: 'new' as const, label: '아니오' },
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
 * 교인 로그인 — 승인된 교인만 볼 수 있는 화면(교우 앨범 등)의 관문.
 * 이메일/비밀번호 없이 Google 계정으로만 간편하게 로그인한다.
 * 처음 로그인하면(members/{uid} 문서 없음) 이름·교인구분·자기소개만 받아
 * pending으로 등록 → 관리자 승인 후 approved.
 */
export default function MemberLoginScreen() {
  const router = useRouter();
  const { state, member, authEmail, createProfile, signOut } = useMember();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 가입 정보(첫 로그인 시에만 입력)
  const [name, setName] = useState('');
  const [memberType, setMemberType] = useState<'existing' | 'new'>('existing');
  const [bio, setBio] = useState('');

  const doGoogleLogin = async () => {
    setErr(null);
    setBusy(true);
    try {
      await adminGoogleSignIn();
    } catch {
      setErr('Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
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
      setErr(e instanceof Error ? e.message : '처리 중 문제가 발생했습니다.');
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

  // Google 로그인은 했지만 교인 정보 미등록 — 처음 로그인한 경우, 곧 가입 신청
  if (state === 'noProfile') {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <OverlayHeader title="교인 가입 신청" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.title}>가입 정보를 입력해 주세요</Text>
            <Text style={styles.sub}>{authEmail} 계정으로 로그인했습니다. 아래 정보만 입력하면 관리자 승인 후 이용하실 수 있습니다.</Text>
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
              <Text style={styles.primaryBtnText}>{busy ? '신청 중…' : '가입 신청'}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={signOut}>
              <Text style={styles.secondaryBtnText}>로그아웃</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // 로그인 전 — Google 계정으로만 간편 로그인
  return (
    <View style={styles.screen}>
      <OverlayHeader title="교인 로그인" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, shadows.card]}>
          <Text style={styles.title}>교인 로그인</Text>
          <Text style={styles.sub}>
            교우 앨범 등 교인 전용 화면은 승인된 교인만 볼 수 있습니다. Google 계정으로 간편하게
            로그인해 주세요.
          </Text>
          <Pressable
            style={[styles.googleBtn, busy && styles.btnBusy]}
            onPress={doGoogleLogin}
            disabled={busy}
          >
            <Text style={styles.googleG}>G</Text>
            <Text style={styles.googleBtnText}>
              {busy ? '로그인 중…' : 'Google 계정으로 로그인'}
            </Text>
          </Pressable>
          {err ? <Text style={styles.error}>{err}</Text> : null}
        </View>
      </ScrollView>
    </View>
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
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
  },
  googleG: { fontFamily: font.extraBold, fontSize: 17, color: '#4285F4' },
  googleBtnText: { fontFamily: font.bold, fontSize: 14.5, color: colors.title },
  btnBusy: { opacity: 0.6 },
  secondaryBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  secondaryBtnText: { fontFamily: font.bold, fontSize: 13.5, color: colors.muted },
  error: {
    marginTop: 10,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.badge,
  },
});
