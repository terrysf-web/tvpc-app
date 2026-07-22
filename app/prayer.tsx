import { Heart, Plus, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
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
import { Tag, TagTone } from '../src/components/Tag';
import { timeAgo, usePrayers } from '../src/data/hooks';
import { prayerCategoryLabel } from '../src/data/sample';
import { useUser } from '../src/data/user';
import { colors, font, shadows } from '../src/theme';
import type { PrayerCategory } from '../src/types';

type PrayerTab = 'req' | 'ans';

const TABS: { key: PrayerTab; label: string }[] = [
  { key: 'req', label: '기도요청' },
  { key: 'ans', label: '기도응답' },
];

const CATEGORY_TONE: Record<string, TagTone> = {
  family: 'green',
  health: 'blue',
  work: 'orange',
  etc: 'gray',
  answered: 'green',
};

const WRITE_CATEGORIES: PrayerCategory[] = ['family', 'health', 'work', 'etc', 'answered'];

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useUser();
  const { prayers, liked, toggleLike, addPrayer } = usePrayers();
  const [tab, setTab] = useState<PrayerTab>('req');
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [category, setCategory] = useState<PrayerCategory>('family');
  const [submitting, setSubmitting] = useState(false);

  // 이전에 입력한 이름 미리 채우기 (초기 샘플 기본값은 제외)
  useEffect(() => {
    if (user.name && user.name !== 'Terry') setAuthorName(user.name);
  }, [user.name]);

  const list = prayers.filter((p) => (tab === 'ans' ? p.answered : !p.answered));

  const submit = async () => {
    const body = text.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const name = authorName.trim().slice(0, 40) || '성도';
      await addPrayer({ category, text: body, authorName: name });
      if (authorName.trim()) updateUser({ name: authorName.trim() });
      setText('');
      setWriting(false);
      setTab(category === 'answered' ? 'ans' : 'req');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <OverlayHeader
        title="기도요청"
        right={
          <Pressable
            onPress={() => {
              setText('');
              setWriting(true);
            }}
            hitSlop={8}
          >
            <Plus size={24} color={colors.primary} strokeWidth={2} />
          </Pressable>
        }
      />
      <SegmentTabs tabs={TABS} active={tab} onChange={setTab} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {list.map((p) => {
          const isLiked = !!liked[p.id];
          return (
            <View key={p.id} style={[styles.card, shadows.card]}>
              <View style={styles.cardTop}>
                <Tag
                  label={prayerCategoryLabel[p.category] ?? '기타'}
                  tone={CATEGORY_TONE[p.category] ?? 'gray'}
                />
                <Text style={styles.time}>{timeAgo(p.createdAt)}</Text>
              </View>
              <Text style={styles.body}>{p.text}</Text>
              <View style={styles.cardBottom}>
                <Text style={styles.author}>{p.authorName}</Text>
                <Pressable style={styles.likeBtn} onPress={() => toggleLike(p.id)} hitSlop={6}>
                  <Heart
                    size={16}
                    color={isLiked ? colors.heartActive : colors.heartInactive}
                    fill={isLiked ? colors.heartActive : 'transparent'}
                    strokeWidth={1.9}
                  />
                  <Text style={[styles.likeText, isLiked && { color: colors.heartActive }]}>
                    함께 기도 {p.prayCount}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        {list.length === 0 && (
          <Text style={styles.empty}>
            {tab === 'req' ? '아직 기도요청이 없습니다.' : '아직 나눈 기도응답이 없습니다.'}
          </Text>
        )}
      </ScrollView>

      {/* 작성 모달 */}
      <Modal visible={writing} animationType="slide" transparent onRequestClose={() => setWriting(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>기도 나누기</Text>
              <Pressable onPress={() => setWriting(false)} hitSlop={8}>
                <X size={22} color={colors.muted} strokeWidth={1.9} />
              </Pressable>
            </View>
            <View style={styles.chipRow}>
              {WRITE_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, category === c && styles.chipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
                    {prayerCategoryLabel[c]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.nameInput}
              placeholder="이름 (비워두면 '성도'로 표시)"
              placeholderTextColor={colors.faint}
              defaultValue={authorName}
              onChangeText={setAuthorName}
              maxLength={40}
            />
            <TextInput
              style={styles.input}
              multiline
              placeholder="함께 기도하고 싶은 내용을 나눠주세요"
              placeholderTextColor={colors.faint}
              onChangeText={setText}
            />
            <Pressable
              style={[styles.submitBtn, (!text.trim() || submitting) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={!text.trim() || submitting}
            >
              <Text style={styles.submitText}>{submitting ? '올리는 중…' : '기도요청 올리기'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  content: { padding: 16, gap: 12 },

  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontFamily: font.regular, fontSize: 12, color: colors.faint },
  body: {
    marginTop: 10,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.body,
  },
  cardBottom: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  author: { fontFamily: font.medium, fontSize: 12.5, color: colors.muted2 },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.screenBg,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  likeText: { fontFamily: font.bold, fontSize: 12.5, color: colors.muted },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.faint,
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,18,32,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontFamily: font.extraBold, fontSize: 17, color: colors.title },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.tagGrayBg,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  chipTextActive: { color: '#FFFFFF', fontFamily: font.bold },
  nameInput: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.regular,
    fontSize: 16,
    color: colors.body,
  },
  input: {
    marginTop: 10,
    minHeight: 110,
    borderRadius: 14,
    backgroundColor: colors.screenBg,
    padding: 14,
    fontFamily: font.regular,
    // iOS 사파리는 16px 미만 입력창에서 화면을 확대하므로 16 유지
    fontSize: 16,
    lineHeight: 23,
    color: colors.body,
    textAlignVertical: 'top',
  },
  submitBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  submitText: { fontFamily: font.bold, fontSize: 15, color: '#FFFFFF' },
});
