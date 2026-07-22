import { useRouter } from 'expo-router';
import { Images } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { churchInfo } from '../src/churchInfo';
import { ensureAnonymousAuth, firebaseEnabled, getDb } from '../src/firebase';
import { colors, font, shadows } from '../src/theme';

interface AlbumPage {
  image: string;
  w: number;
  h: number;
}

/**
 * 교회 앨범 뷰어 — 미리 변환해 둔 페이지 이미지를 첫 장부터 즉시 보여주고,
 * 나머지 장은 순서대로 이어서 불러온다 (큰 PDF를 직접 여는 것보다 훨씬 빠름).
 */
export default function AlbumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pages, setPages] = useState<(AlbumPage | null)[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const db = getDb();
    if (!db) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousAuth();
        const meta = await getDoc(doc(db, 'albums', 'current'));
        if (cancelled) return;
        const n = Number(meta.get('pageCount') ?? 0);
        if (!meta.exists || !n) {
          setFailed(true);
          return;
        }
        setPageCount(n);
        setPages(Array(n).fill(null));
        // 페이지를 순서대로 이어서 로드 — 첫 장부터 바로 보인다
        for (let i = 0; i < n && !cancelled; i++) {
          const snap = await getDoc(doc(db, 'albums', 'current', 'pages', String(i).padStart(3, '0')));
          if (cancelled) return;
          const image = String(snap.get('image') ?? '');
          if (image) {
            setPages((prev) => {
              const next = [...prev];
              next[i] = { image, w: Number(snap.get('w') ?? 3), h: Number(snap.get('h') ?? 4) };
              return next;
            });
          }
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pageWidth = Math.min(width, 520) - 24;
  const openPdf = () =>
    router.push({ pathname: '/browser', params: { url: churchInfo.albumPdf, t: '교회 앨범' } });

  return (
    <View style={styles.screen}>
      <OverlayHeader title="교회 앨범" />
      {failed || !firebaseEnabled ? (
        <ScrollView contentContainerStyle={styles.pages}>
          <View style={[styles.card, shadows.card]}>
            <View style={styles.iconChip}>
              <Images size={22} color={colors.primary} strokeWidth={1.9} />
            </View>
            <Text style={styles.cardTitle}>앨범을 준비 중입니다</Text>
            <Text style={styles.cardSub}>잠시 후 다시 열어 보시거나, 원본 PDF로 보실 수 있습니다.</Text>
            <Pressable style={styles.primaryBtn} onPress={openPdf}>
              <Text style={styles.primaryBtnText}>원본 PDF 열기</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : pageCount === null ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.pages, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {pages.map((p, i) => (
            <View key={i} style={[styles.pageWrap, shadows.card]}>
              {p ? (
                <Image
                  source={{ uri: p.image }}
                  style={{ width: pageWidth, height: pageWidth * (p.h / p.w), borderRadius: 10 }}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.placeholder, { width: pageWidth, height: pageWidth * 1.29 }]}>
                  <ActivityIndicator color={colors.faint} />
                </View>
              )}
              <Text style={styles.pageNum}>
                {i + 1} / {pageCount}
              </Text>
            </View>
          ))}
          <Pressable style={styles.webLink} onPress={openPdf}>
            <Text style={styles.webLinkText}>원본 PDF 열기 ›</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  pages: { padding: 12, gap: 14, alignItems: 'center' },
  pageWrap: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.screenBg,
    borderRadius: 10,
  },
  pageNum: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    fontFamily: font.medium,
    fontSize: 11,
    color: '#FFFFFF',
    backgroundColor: 'rgba(20,30,45,0.55)',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  webLink: { padding: 10 },
  webLinkText: { fontFamily: font.medium, fontSize: 13, color: colors.primary },

  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 24,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.tagBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontFamily: font.extraBold, fontSize: 16, color: colors.title },
  cardSub: {
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 14.5, color: '#FFFFFF' },
});
