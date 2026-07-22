import { useRouter } from 'expo-router';
import { ChevronDown, Images, Search } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { churchInfo } from '../src/churchInfo';
import { ensureAnonymousAuth, firebaseEnabled, getDb } from '../src/firebase';
import { colors, font, shadows } from '../src/theme';

interface AlbumPage {
  image: string;
  w: number;
  h: number;
}

/** 명부 색인 항목 — 이름 검색은 이미지를 받기 전에도 이 색인으로 동작한다 */
interface RowIndex {
  cell: string;
  names: string;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** OCR 오독을 감안해 3글자 이상 검색어는 한 글자 차이까지 일치로 본다 */
function fuzzyIncludes(hay: string, needle: string): boolean {
  if (hay.includes(needle)) return true;
  if (needle.length < 3) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let miss = 0;
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j] && ++miss > 1) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** OCR이 성·이름 순서를 뒤집는 경우가 있어 토큰 조합으로도 매칭 */
function matchNames(names: string, cell: string, q: string): boolean {
  const nq = norm(q);
  if (!nq) return true;
  if (fuzzyIncludes(norm(`${names} ${cell}`), nq)) return true;
  const toks = names.split(/\s+/).map(norm).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    for (let j = 0; j < toks.length; j++) {
      if (i !== j && fuzzyIncludes(toks[i] + toks[j], nq)) return true;
    }
  }
  return false;
}

/**
 * 교회 앨범 뷰어 — 소개 페이지와 셀별 명부.
 * 색인(이름·셀)은 즉시 로드되어 검색·셀 선택이 바로 되고,
 * 줄 이미지는 화면에 필요한 것부터 가져온다.
 */
export default function AlbumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pages, setPages] = useState<(AlbumPage | null)[]>([]);
  const [index, setIndex] = useState<RowIndex[]>([]);
  const [cache, setCache] = useState<Record<number, AlbumPage>>({});
  const [failed, setFailed] = useState(false);
  const [cells, setCells] = useState<string[]>([]);
  const [cellFilter, setCellFilter] = useState<string | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dbRef = useRef<Firestore | null>(null);
  const fetching = useRef<Set<number>>(new Set());

  const fetchRow = async (i: number) => {
    const db = dbRef.current;
    if (!db || fetching.current.has(i)) return;
    fetching.current.add(i);
    try {
      const snap = await getDoc(doc(db, 'albums', 'current', 'rows', String(i).padStart(4, '0')));
      const image = String(snap.get('image') ?? '');
      if (image) {
        setCache((prev) => ({
          ...prev,
          [i]: { image, w: Number(snap.get('w') ?? 3), h: Number(snap.get('h') ?? 1) },
        }));
      }
    } catch {
      fetching.current.delete(i);
    }
  };

  useEffect(() => {
    const db = getDb();
    if (!db) {
      setFailed(true);
      return;
    }
    dbRef.current = db;
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousAuth();
        const meta = await getDoc(doc(db, 'albums', 'current'));
        if (cancelled) return;
        const n = Number(meta.get('pageCount') ?? 0);
        const idxRaw = (meta.get('index') as { c?: string; n?: string }[] | undefined) ?? [];
        const idx = idxRaw.map((r) => ({ cell: String(r.c ?? '기타'), names: String(r.n ?? '') }));
        if (!meta.exists || (!n && !idx.length)) {
          setFailed(true);
          return;
        }
        setPageCount(n);
        setPages(Array(n).fill(null));
        setIndex(idx);
        setCells(((meta.get('cells') as string[] | undefined) ?? []).map(String));
        // 소개 페이지 → 명부 이미지 순서대로 배경 로드 (첫 장부터 바로 보인다)
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
        for (let i = 0; i < idx.length && !cancelled; i++) {
          await fetchRow(i);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtering = !!cellFilter || !!query.trim();
  const visible = useMemo(
    () =>
      index
        .map((r, i) => ({ r, i }))
        .filter(
          ({ r }) =>
            (!cellFilter || r.cell === cellFilter) &&
            (!query.trim() || matchNames(r.names, r.cell, query)),
        ),
    [index, cellFilter, query],
  );

  // 검색·셀 선택 결과의 이미지를 우선 로드
  useEffect(() => {
    if (!filtering) return;
    for (const { i } of visible.slice(0, 60)) {
      if (!cache[i]) void fetchRow(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtering, visible]);

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
          keyboardShouldPersistTaps="handled"
        >
          {/* 셀 선택 + 이름 검색 */}
          {index.length > 0 && (
            <View style={styles.filterBar}>
              <Pressable style={styles.dropBtn} onPress={() => setDropOpen((o) => !o)}>
                <Text style={styles.dropBtnText}>{cellFilter ?? '전체 셀'}</Text>
                <ChevronDown size={16} color={colors.primary} strokeWidth={2} />
              </Pressable>
              <View style={styles.searchBox}>
                <Search size={16} color={colors.faint} strokeWidth={2} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="이름 검색"
                  placeholderTextColor={colors.faint}
                />
              </View>
            </View>
          )}
          {dropOpen && (
            <View style={[styles.dropList, shadows.card]}>
              {['전체 셀', ...cells].map((c) => (
                <Pressable
                  key={c}
                  style={styles.dropItem}
                  onPress={() => {
                    setCellFilter(c === '전체 셀' ? null : c);
                    setDropOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropItemText,
                      (cellFilter ?? '전체 셀') === c && styles.dropItemActive,
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {!filtering &&
            pages.map((p, i) => (
              <View key={`p${i}`} style={[styles.pageWrap, shadows.card]}>
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

          {/* 명부 — 셀 제목 아래 멤버 줄들 */}
          {filtering && visible.length === 0 && (
            <Text style={styles.loadingNote}>검색 결과가 없습니다.</Text>
          )}
          {visible.map(({ r, i }, vi) => {
            const prev = vi > 0 ? visible[vi - 1].r : null;
            const showHeader = !prev || prev.cell !== r.cell;
            const img = cache[i];
            return (
              <React.Fragment key={`r${i}`}>
                {showHeader && (
                  <View style={styles.cellHeader}>
                    <Text style={styles.cellHeaderText}>{r.cell.toUpperCase()}</Text>
                  </View>
                )}
                {img ? (
                  <View style={[styles.rowWrap, shadows.card]}>
                    <Image
                      source={{ uri: img.image }}
                      style={{ width: pageWidth, height: pageWidth * (img.h / img.w), borderRadius: 10 }}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={[styles.placeholder, { width: pageWidth, height: pageWidth * 0.32 }]}>
                    <ActivityIndicator color={colors.faint} />
                  </View>
                )}
              </React.Fragment>
            );
          })}
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

  filterBar: { alignSelf: 'stretch', flexDirection: 'row', gap: 9 },
  dropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.tagBlueBg,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  dropBtnText: { fontFamily: font.bold, fontSize: 13.5, color: colors.primary },
  dropList: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: 13,
    paddingVertical: 4,
  },
  dropItem: { paddingHorizontal: 16, paddingVertical: 10 },
  dropItemText: { fontFamily: font.medium, fontSize: 13.5, color: colors.body },
  dropItemActive: { color: colors.primary, fontFamily: font.extraBold },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontFamily: font.regular,
    // iOS 자동 확대 방지 — 입력창 글자는 16 이상
    fontSize: 16,
    color: colors.body,
  },
  loadingNote: {
    marginTop: 6,
    fontFamily: font.regular,
    fontSize: 12.5,
    color: colors.faint,
  },

  cellHeader: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  cellHeaderText: { fontFamily: font.extraBold, fontSize: 15, color: '#FFFFFF', letterSpacing: 0.5 },
  rowWrap: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },

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
