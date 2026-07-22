import { useRouter } from 'expo-router';
import { ChevronDown, Images, Search } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
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
import { doc, getDoc } from 'firebase/firestore';
import { OverlayHeader } from '../src/components/OverlayHeader';
import { churchInfo } from '../src/churchInfo';
import { ensureAnonymousAuth, firebaseEnabled, getDb } from '../src/firebase';
import { colors, font, shadows } from '../src/theme';

interface AlbumPage {
  image: string;
  w: number;
  h: number;
  /** 명부 줄일 때의 소속 셀 */
  cell?: string;
  /** 명부 줄의 이름들 (검색용) */
  names?: string;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

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
  const [rowCount, setRowCount] = useState(0);
  const [rows, setRows] = useState<(AlbumPage | null)[]>([]);
  const [failed, setFailed] = useState(false);
  const [cells, setCells] = useState<string[]>([]);
  const [cellFilter, setCellFilter] = useState<string | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [query, setQuery] = useState('');

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
        const rn = Number(meta.get('rowCount') ?? 0);
        if (!meta.exists || (!n && !rn)) {
          setFailed(true);
          return;
        }
        setPageCount(n);
        setPages(Array(n).fill(null));
        setRowCount(rn);
        setRows(Array(rn).fill(null));
        setCells(((meta.get('cells') as string[] | undefined) ?? []).map(String));
        // 소개 페이지 → 명부 줄 순서대로 이어서 로드 (첫 장부터 바로 보인다)
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
        for (let i = 0; i < rn && !cancelled; i++) {
          const snap = await getDoc(doc(db, 'albums', 'current', 'rows', String(i).padStart(4, '0')));
          if (cancelled) return;
          const image = String(snap.get('image') ?? '');
          if (image) {
            setRows((prev) => {
              const next = [...prev];
              next[i] = {
                image,
                w: Number(snap.get('w') ?? 3),
                h: Number(snap.get('h') ?? 1),
                cell: String(snap.get('cell') ?? ''),
                names: String(snap.get('names') ?? ''),
              };
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
          keyboardShouldPersistTaps="handled"
        >
          {/* 셀 선택 + 이름 검색 */}
          {rowCount > 0 && (
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

          {!cellFilter && !query && pages.map((p, i) => (
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

          {/* 명부 — 셀 제목 아래 멤버 줄들 (필터·검색 반영) */}
          {(() => {
            const filtering = !!cellFilter || !!query.trim();
            const q = norm(query);
            const visible = rows
              .map((r, i) => ({ r, i }))
              .filter(({ r }) => {
                if (!r) return !filtering; // 필터 중에는 로딩 자리표시 생략
                if (cellFilter && r.cell !== cellFilter) return false;
                if (q && !norm(`${r.names ?? ''} ${r.cell ?? ''}`).includes(q)) return false;
                return true;
              });
            const stillLoading = rows.some((r) => r === null);
            return (
              <>
                {filtering && stillLoading && (
                  <Text style={styles.loadingNote}>
                    명부를 불러오는 중입니다… 결과가 더 나타날 수 있어요.
                  </Text>
                )}
                {filtering && !stillLoading && visible.length === 0 && (
                  <Text style={styles.loadingNote}>검색 결과가 없습니다.</Text>
                )}
                {visible.map(({ r, i }, vi) => {
                  const prev = vi > 0 ? visible[vi - 1].r : null;
                  const showHeader = r && (!prev || prev.cell !== r.cell);
                  return (
                    <React.Fragment key={`r${i}`}>
                      {showHeader && (
                        <View style={styles.cellHeader}>
                          <Text style={styles.cellHeaderText}>{(r?.cell ?? '').toUpperCase()}</Text>
                        </View>
                      )}
                      {r ? (
                        <View style={[styles.rowWrap, shadows.card]}>
                          <Image
                            source={{ uri: r.image }}
                            style={{ width: pageWidth, height: pageWidth * (r.h / r.w), borderRadius: 10 }}
                            resizeMode="contain"
                          />
                        </View>
                      ) : (
                        i < rowCount && (
                          <View style={[styles.placeholder, { width: pageWidth, height: pageWidth * 0.32 }]}>
                            <ActivityIndicator color={colors.faint} />
                          </View>
                        )
                      )}
                    </React.Fragment>
                  );
                })}
              </>
            );
          })()}
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
    paddingVertical: 10,
    fontFamily: font.regular,
    fontSize: 13.5,
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
