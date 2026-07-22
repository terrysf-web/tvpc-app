import { LogOut } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  addOfferingRecord,
  approveMember,
  parsePassage,
  rejectMember,
  saveEvent,
  saveNews,
  saveVerse,
  useAdminAuth,
  usePendingMembers,
} from '../src/data/admin';
import {
  BulletinPage,
  convertPdfToBulletinPages,
  saveBulletin,
} from '../src/data/bulletin';
import { colors, font, shadows } from '../src/theme';

type AdminTab = 'verse' | 'bulletin' | 'news' | 'event' | 'members' | 'offering';

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'verse', label: '말씀' },
  { key: 'bulletin', label: '주보' },
  { key: 'news', label: '소식' },
  { key: 'event', label: '일정' },
  { key: 'members', label: '교인' },
  { key: 'offering', label: '헌금' },
];

/** 다가오는 주일(오늘이 주일이면 오늘) — 주보 날짜 기본값 */
function upcomingSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

  // 주보 업로드
  const [bDate, setBDate] = useState(upcomingSunday());
  const [bPages, setBPages] = useState<BulletinPage[]>([]);
  const [bStatus, setBStatus] = useState<string | null>(null);

  // 교인 승인 / 헌금 입력
  const pending = usePendingMembers(isAdmin);
  const [oEmail, setOEmail] = useState('');
  const [oItem, setOItem] = useState('');
  const [oDate, setODate] = useState(today());
  const [oAmount, setOAmount] = useState('');

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

  const pickBulletinPdf = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setMsg('주보 PDF 업로드는 컴퓨터 브라우저에서 해주세요.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      setMsg(null);
      setBPages([]);
      setBStatus('PDF 변환 중…');
      try {
        const pages = await convertPdfToBulletinPages(file, (d, t) =>
          setBStatus(`PDF 변환 중… ${d}/${t}장`),
        );
        setBPages(pages);
        setBStatus(`${pages.length}페이지 준비 완료 — 순서를 확인하고 등록을 누르세요.`);
        // 파일명에서 날짜 추측 (예: 20260719.pdf)
        const m = file.name.match(/(20\d{2})[-._]?(\d{2})[-._]?(\d{2})/);
        if (m) setBDate(`${m[1]}-${m[2]}-${m[3]}`);
      } catch (e) {
        setBStatus(null);
        setMsg(`변환 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const saveBulletinForm = () =>
    submit(async () => {
      if (!bPages.length) throw new Error('먼저 PDF 파일을 선택해 주세요.');
      await saveBulletin(bDate.trim(), bPages);
      setBStatus(null);
      setBPages([]);
    }, `${bDate} 주보가 등록됐습니다. 앱 "주보 보기"에 바로 반영됩니다.`);

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

        {tab === 'bulletin' && (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.blockTitle}>주보 PDF 업로드</Text>
            <Field
              label="주보 날짜 (YYYY-MM-DD)"
              value={bDate}
              onChange={setBDate}
              placeholder={upcomingSunday()}
            />
            <Pressable
              style={[styles.secondaryBtn, busy && { opacity: 0.6 }]}
              onPress={pickBulletinPdf}
              disabled={busy}
            >
              <Text style={styles.secondaryBtnText}>
                {busy && bStatus ? bStatus : 'PDF 파일 선택'}
              </Text>
            </Pressable>
            {bStatus && !busy ? <Text style={styles.hintText}>{bStatus}</Text> : null}
            {bPages.length > 0 && (
              <View style={styles.bulletinPreviewRow}>
                {bPages.map((p, i) => (
                  <View key={i} style={styles.bulletinThumbWrap}>
                    <Image
                      source={{ uri: p.image }}
                      style={{ width: 92, height: Math.round(92 * (p.h / p.w)), borderRadius: 6 }}
                    />
                    <Text style={styles.bulletinThumbNum}>{i + 1}</Text>
                  </View>
                ))}
              </View>
            )}
            {bPages.length > 0 && (
              <Pressable
                style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
                onPress={saveBulletinForm}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? '저장 중…' : `주보 등록 (${bPages.length}페이지)`}
                </Text>
              </Pressable>
            )}
            <Text style={styles.hintText}>
              접는 주보(가로 2장)는 자동으로 반쪽 4면이 되고, 읽는 순서(1→2→3→4면)로
              정렬됩니다. 등록하면 누구나 앱 "주보 보기"(app.tvpc.church/bulletin)에서
              볼 수 있습니다 — QR 코드 인쇄용 주소도 이 주소입니다. 업로드는 컴퓨터
              브라우저에서 해주세요.
            </Text>
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

        {tab === 'members' && (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.blockTitle}>가입 승인 대기 ({pending.length})</Text>
            {pending.length === 0 && (
              <Text style={styles.emptyText}>대기 중인 가입 신청이 없습니다.</Text>
            )}
            {pending.map((m) => (
              <View key={m.id} style={styles.pendingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendingName}>{m.name}</Text>
                  <Text style={styles.pendingMeta}>
                    {[m.email, m.phone].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Pressable
                  style={styles.approveBtn}
                  onPress={() => submit(() => approveMember(m.id), `${m.name}님을 승인했습니다.`)}
                >
                  <Text style={styles.approveBtnText}>승인</Text>
                </Pressable>
                <Pressable
                  style={styles.rejectBtn}
                  onPress={() => submit(() => rejectMember(m.id), '신청을 거절했습니다.')}
                >
                  <Text style={styles.rejectBtnText}>거절</Text>
                </Pressable>
              </View>
            ))}
            <Text style={styles.hintText}>
              승인된 교인은 주소록·기도요청·내 헌금 내역을 이용할 수 있습니다.
            </Text>
          </View>
        )}

        {tab === 'offering' && (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.blockTitle}>헌금 내역 등록</Text>
            <Field label="교인 이메일" value={oEmail} onChange={setOEmail} placeholder="member@example.com" />
            <Field label="항목" value={oItem} onChange={setOItem} placeholder="예: 십일조" />
            <Field label="날짜 (YYYY-MM-DD)" value={oDate} onChange={setODate} placeholder={today()} />
            <Field label="금액" value={oAmount} onChange={setOAmount} placeholder="예: $200" />
            <Pressable
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={() =>
                submit(async () => {
                  if (!oEmail.trim() || !oItem.trim() || !oAmount.trim())
                    throw new Error('이메일·항목·금액을 입력해 주세요.');
                  await addOfferingRecord({
                    email: oEmail,
                    item: oItem,
                    date: oDate,
                    amount: oAmount,
                  });
                  setOItem('');
                  setOAmount('');
                }, '헌금 내역이 등록됐습니다. 본인만 볼 수 있습니다.')
              }
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{busy ? '저장 중…' : '내역 등록'}</Text>
            </Pressable>
            <Text style={styles.hintText}>
              해당 이메일로 가입·승인된 교인의 "내 헌금 내역"에만 표시됩니다.
            </Text>
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
  secondaryBtn: {
    marginTop: 4,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  secondaryBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.primary },
  bulletinPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  bulletinThumbWrap: {
    borderWidth: 1,
    borderColor: colors.divider2,
    borderRadius: 7,
    overflow: 'hidden',
  },
  bulletinThumbNum: {
    position: 'absolute',
    left: 4,
    top: 4,
    fontFamily: font.bold,
    fontSize: 11,
    color: '#FFFFFF',
    backgroundColor: 'rgba(20,30,45,0.6)',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },

  blockTitle: { fontFamily: font.extraBold, fontSize: 15, color: colors.title, marginBottom: 12 },
  emptyText: { fontFamily: font.regular, fontSize: 13, color: colors.faint, marginBottom: 8 },
  hintText: { marginTop: 12, fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, color: colors.faint },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider2,
  },
  pendingName: { fontFamily: font.bold, fontSize: 14, color: colors.title },
  pendingMeta: { marginTop: 2, fontFamily: font.regular, fontSize: 11.5, color: colors.muted },
  approveBtn: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 8 },
  approveBtnText: { fontFamily: font.bold, fontSize: 12.5, color: '#FFFFFF' },
  rejectBtn: { backgroundColor: colors.tagGrayBg, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 8 },
  rejectBtnText: { fontFamily: font.bold, fontSize: 12.5, color: colors.muted },

  msg: { marginBottom: 12, fontFamily: font.medium, fontSize: 13.5 },
  msgOk: { color: colors.tagGreenText },
  error: { color: colors.heartActive, marginTop: 8, fontFamily: font.medium, fontSize: 13 },
});
