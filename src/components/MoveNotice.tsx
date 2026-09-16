/**
 * 바뀐 곳을 알려 주는 안내 창.
 *
 * 앱을 켜면 한 번 떠서 "지난 새벽설교가 설교 탭으로 옮겨졌다"는 것을
 * 알려 준다. 늘 쓰던 자리에서 사라지면 없어진 줄 아시기 때문이다.
 *
 * "다시 안 보기"를 누르기 전까지는 앱을 켤 때마다 한 번씩 뜬다 — 못 보고
 * 닫은 분을 위해서다. 홈 화면에 설치한 앱은 껐다 켜도 화면이 그대로
 * 살아 있어(다시 그려지지 않아) 안내가 안 뜨는 일이 있었다. 그래서 앱으로
 * 돌아왔을 때도 한 번 더 살핀다(너무 자주 뜨지 않게 30분 간격을 둔다).
 *
 * 다음에 또 알릴 일이 생기면 NOTICE_KEY의 끝 번호만 올리면 된다(예전에
 * "다시 안 보기"를 누른 분에게도 새 안내는 한 번 뜬다).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, shadows } from '../theme';

const NOTICE_KEY = 'tvpc.notice.dawnMoved.1';

const TITLE = '새벽설교가 설교 탭으로 옮겨졌어요';
const BODY =
  '"더보기 → 지난 새벽설교"에 있던 목록을 설교 탭으로 옮겼습니다.\n' +
  '이제 설교 탭에서 주일설교 · 새벽설교 · 팟캐스트를 한곳에서 보실 수 있습니다.';

/** 앱으로 돌아왔을 때 다시 띄우기까지 두는 간격 */
const REOPEN_AFTER_MS = 30 * 60 * 1000;

export function MoveNotice() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    let on = true;
    const show = () => {
      if (!on) return;
      if (Date.now() - shownAt.current < REOPEN_AFTER_MS) return;
      AsyncStorage.getItem(NOTICE_KEY)
        .then((seen) => {
          if (!on || seen) return;
          shownAt.current = Date.now();
          setOpen(true);
        })
        .catch(() => {});
    };
    show();

    // 설치한 앱은 껐다 켜도 화면이 다시 그려지지 않는다 — 돌아왔을 때도 살핀다
    if (typeof document !== 'undefined') {
      const onVisible = () => {
        if (document.visibilityState === 'visible') show();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        on = false;
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    return () => {
      on = false;
    };
  }, []);

  const close = () => setOpen(false);

  const never = () => {
    setOpen(false);
    AsyncStorage.setItem(NOTICE_KEY, '1').catch(() => {});
  };

  // 보여 드리기만 하고 안내는 남겨 둔다 — "다시 안 보기"를 누르기 전에는
  // 다음에 앱을 켤 때 한 번 더 뜬다
  const goSee = () => {
    setOpen(false);
    router.push('/sermon');
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        {/* 카드를 눌렀을 때는 닫히지 않게 — 뒤 배경을 눌러야 닫힌다 */}
        <Pressable style={[styles.card, shadows.card]} onPress={() => {}}>
          <Text style={styles.badge}>안내</Text>
          <Text style={styles.title}>{TITLE}</Text>
          <Text style={styles.body}>{BODY}</Text>

          <Pressable style={styles.primaryBtn} onPress={goSee}>
            <Text style={styles.primaryBtnText}>설교 탭으로 가기</Text>
          </Pressable>
          <View style={styles.row}>
            <Pressable style={styles.ghostBtn} onPress={never} hitSlop={6}>
              <Text style={styles.ghostBtnText}>다시 안 보기</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={close} hitSlop={6}>
              <Text style={styles.ghostBtnText}>닫기</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,24,40,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 20,
  },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: font.bold,
    fontSize: 11.5,
    color: colors.primary,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  title: {
    marginTop: 12,
    fontFamily: font.extraBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.title,
    // 한글이 글자 중간에서 잘리지 않게(웹 전용 속성)
    // @ts-expect-error react-native-web 전용 속성
    wordBreak: 'keep-all',
  },
  body: {
    marginTop: 10,
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.muted,
    wordBreak: 'keep-all',
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 14.5, color: '#FFFFFF' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  ghostBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  ghostBtnText: { fontFamily: font.medium, fontSize: 13, color: colors.muted3 },
});
