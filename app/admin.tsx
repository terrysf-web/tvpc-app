import { LogOut } from 'lucide-react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { SegmentTabs } from '../src/components/SegmentTabs';
import {
  parsePassage,
  saveEvent,
  saveNews,
  saveVerse,
  useAdminAuth,
} from '../src/data/admin';
import { colors, font, shadows } from '../src/theme';

type AdminTab = 'verse' | 'news' | 'event';

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'verse', label: '오늘의 말씀' },
  { key: 'news', label: '소식' },
  { key: 'event', label: '일정' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  lines = 4,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  lines?: number;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: lines * 22 + 24, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        multiline={multiline}
      />
    </View>
  );
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { email, isAdmin, checking, signIn, signOut } = useAdminAuth();
  const [tab, setTab] = useState<AdminTab>('verse');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 로그인 폼
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [loginErr, setLoginErr] = useState<string | null>(null);

  // 말씀 폼
  const [vDate, setVDate] = useState(today());
  const [vRef, setVRef] = useState('');
  const [vHero, setVHero] = useState('');
  const [vPassageTitle, setVPassageTitle] = useState('');
  const [vPassage, setVPassage] = useState('');
  const [vMeditation, setVMeditation] = useState('');
  const [vApplication, setVApplication] = useState('');
  const [vPrayer, setVPrayer] = useState('');

  // 소식 폼
  const [nTitle, setNTitle] = useState('');
  const [nCategory, setNCategory] = useState<'notice' | 'event'>('notice');

  // 일정 폼
  const [eDateLabel, setEDateLabel] = useState('');
  const [eTitle, setETitle] = useState('');
  const [eDetail, setEDetail] = useState('');

  const doLogin = async () => {
    setLoginErr(null);
    setBusy(true);
    try {
      await signIn(loginEmail, loginPw);
      setLoginPw('');
    } catch {
      setLoginErr('로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (fn: () => Promise<void>, done: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await fn();
      setMsg(`✓ ${done}`);
    } catch (e) {
      setMsg(`저장 실패: ${e instanceof Error ? e.message : '권한을 확인해 주세요.'}`);
    } finally {
      setBusy(false);
    }
  };

  const saveVerseForm = () =>
    submit(async () => {
      if (!vDate || !vRef || !vHero) throw new Error('날짜·구절·홈 카드 문구는 필수입니다.');
      await saveVerse({
        date: vDate.trim(),
        reference: vRef.trim(),
        heroText: vHero.trim(),
        passageTitle: vPassageTitle.trim() || vRef.trim(),
        passage: parsePassage(vPassage),
        meditation: vMeditation.trim(),
        application: vApplication.split('\n').map((l) => l.trim()).filter(Boolean),
        prayer: vPrayer.trim(),
        imageUrl: null,
      });
    }, `${vDate} 말씀이 등록됐습니다. 앱에 바로 반영됩니다.`);

  const saveNewsForm = () =>
    submit(async () => {
      if (!nTitle.trim()) throw new Error('제목을 입력해 주세요.');
      await saveNews({ category: nCategory, title: nTitle.trim(), date: today(), imageUrl: null });
      setNTitle('');
    }, '소식이 등록됐습니다.');

  const saveEventForm = () =>
    submit(async () => {
      if (!eDateLabel.trim() || !eTitle.trim()) throw new Error('날짜와 제목을 입력해 주세요.');
      await saveEvent({
        dateLabel: eDateLabel.trim(),
        title: eTitle.trim(),
        detail: eDetail.trim(),
        imageUrl: null,
      });
      setEDateLabel('');
      setETitle('');
      setEDetail('');
    }, '일정이 등록됐습니다. 홈 화면에 표시됩니다.');

  if (checking) {
    return (
      <View style={styles.screen}>
        <OverlayHeader title="관리자" />
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      </View>
    );
  }

  // 로그인 전 / 권한 없음
  if (!email || !isAdmin) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <OverlayHeader title="관리자" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, shadows.card]}>
            {email && !isAdmin ? (
              <>
                <Text style={styles.loginTitle}>권한이 없는 계정입니다</Text>
                <Text style={styles.loginSub}>
                  {email} 계정에 관리자 권한이 없습니다. 관리자에게 문의해 주세요.
                </Text>
                <Pressable style={styles.primaryBtn} onPress={signOut}>
                  <Text style={styles.primaryBtnText}>다른 계정으로 로그인</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.loginTitle}>교역자 로그인</Text>
                <Text style={styles.loginSub}>
                  오늘의 말씀·소식·일정을 등록할 수 있는 관리자 전용 화면입니다.
                </Text>
                <Field label="이메일" value={loginEmail} onChange={setLoginEmail} placeholder="pastor@example.com" />
                <Text style={styles.fieldLabel}>비밀번호</Text>
                <TextInput
                  style={styles.input}
                  value={loginPw}
                  onChangeText={setLoginPw}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor={colors.faint}
                />
                {loginErr ? <Text style={styles.error}>{loginErr}</Text> : null}
                <Pressable
                  style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                  onPress={doLogin}
                  disabled={busy}
                >
                  <Text style={styles.primaryBtnText}>{busy ? '로그인 중…' : '로그인'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // 관리자 화면
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OverlayHeader
        title="관리자"
        right={
          <Pressable onPress={signOut} hitSlop={8}>
            <LogOut size={20} color={colors.muted} strokeWidth={1.9} />
          </Pressable>
        }
      />
      <SegmentTabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setMsg(null); }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {msg ? (
          <Text style={[styles.msg, msg.startsWith('✓') ? styles.msgOk : styles.error]}>{msg}</Text>
        ) : null}

        {tab === 'verse' && (
          <View style={[styles.card, shadows.card]}>
            <Field label="날짜 (YYYY-MM-DD)" value={vDate} onChange={setVDate} placeholder={today()} />
            <Field label="성경 구절" value={vRef} onChange={setVRef} placeholder="예: 시편 23:1" />
            <Field
              label="홈 카드 문구 (큰 글씨, 2–3줄)"
              value={vHero}
              onChange={setVHero}
              placeholder={'여호와는 나의 목자시니\n내게 부족함이 없으리로다'}
              multiline
              lines={3}
            />
            <Field label="본문 제목" value={vPassageTitle} onChange={setVPassageTitle} placeholder="예: 시편 23:1–6" />
            <Field
              label="본문 (한 줄에 한 절, 절 번호로 시작)"
              value={vPassage}
              onChange={setVPassage}
              placeholder={'1 여호와는 나의 목자시니 내가 부족함이 없으리로다\n2 그가 나를 푸른 초장에 누이시며…'}
              multiline
              lines={6}
            />
            <Field label="묵상" value={vMeditation} onChange={setVMeditation} multiline lines={6} />
            <Field
              label="적용 (한 줄에 하나씩)"
              value={vApplication}
              onChange={setVApplication}
              multiline
              lines={3}
            />
            <Field label="기도" value={vPrayer} onChange={setVPrayer} multiline lines={4} />
            <Pressable
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={saveVerseForm}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{busy ? '저장 중…' : '말씀 등록'}</Text>
            </Pressable>
          </View>
        )}

        {tab === 'news' && (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.fieldLabel}>분류</Text>
            <View style={styles.chipRow}>
              {(
                [
                  { key: 'notice', label: '공지' },
                  { key: 'event', label: '행사' },
                ] as const
              ).map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.chip, nCategory === c.key && styles.chipActive]}
                  onPress={() => setNCategory(c.key)}
                >
                  <Text style={[styles.chipText, nCategory === c.key && styles.chipTextActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field label="제목" value={nTitle} onChange={setNTitle} placeholder="예: 여름 수련회 등록 안내" />
            <Pressable
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={saveNewsForm}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{busy ? '저장 중…' : '소식 등록'}</Text>
            </Pressable>
          </View>
        )}

        {tab === 'event' && (
          <View style={[styles.card, shadows.card]}>
            <Field label="날짜 표시" value={eDateLabel} onChange={setEDateLabel} placeholder="예: 07.20 주일" />
            <Field label="제목" value={eTitle} onChange={setETitle} placeholder="예: 전교인 야유회" />
            <Field label="시간 · 장소" value={eDetail} onChange={setEDetail} placeholder="예: 오후 1:00 · 잔디마당" />
            <Pressable
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={saveEventForm}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{busy ? '저장 중…' : '일정 등록'}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 18 },

  loginTitle: { fontFamily: font.extraBold, fontSize: 18, color: colors.title },
  loginSub: {
    marginTop: 6,
    marginBottom: 18,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },

  fieldLabel: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.muted,
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.body,
  },

  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.tagGrayBg,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  chipTextActive: { color: '#FFFFFF', fontFamily: font.bold },

  primaryBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 15, color: '#FFFFFF' },

  msg: { marginBottom: 12, fontFamily: font.medium, fontSize: 13.5 },
  msgOk: { color: colors.tagGreenText },
  error: { color: colors.heartActive, marginTop: 8, fontFamily: font.medium, fontSize: 13 },
});
