import { useRouter } from 'expo-router';
import { ChevronDown, Images, Search } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
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

/**
 * 이름 검색 — 두 글자부터, 검색어 전체가 정확히 일치해야 매칭.
 * (1글자 오차 허용은 '이현수'가 '이진수'에 걸리는 식의 오탐이 많아 제거)
 * OCR이 이름을 '영 허 성'처럼 쪼개거나 순서를 뒤집는 경우가 있어
 * 토큰 2~3개를 이어붙인 조합으로도 정확 일치를 확인한다.
 */
function matchNames(names: string, cell: string, q: string): boolean {
  const nq = norm(q);
  if (nq.length < 2) return true; // 한 글자는 검색하지 않음
  if (norm(`${names} ${cell}`).includes(nq)) return true;
  const toks = names.split(/\s+/).map(norm).filter(Boolean);
  const n = toks.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if ((toks[i] + toks[j]).includes(nq)) return true;
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        if ((toks[i] + toks[j] + toks[k]).includes(nq)) return true;
      }
    }
  }
  return false;
}

/**
 * 이름 검색창 — 한글 조합(IME) 중 커서가 왼쪽으로 튀었다 돌아오는 문제를
 * 없애기 위해 웹에서는 react-native-web TextInput 대신 순수 <input>을 쓴다.
 * 프레임워크가 입력 이벤트에 개입하지 않고, 글꼴도 시스템 글꼴로 고정해
 * 조합 중 글자 폭이 바뀌지 않게 한다. memo로 재렌더에서도 격리.
 */
const SearchBox = React.memo(function SearchBox({
  onChangeText,
}: {
  onChangeText: (t: string) => void;
}) {
  const webInput =
    Platform.OS === 'web'
      ? React.createElement('input', {
          type: 'text',
          placeholder: '이름 검색',
          autoComplete: 'off',
          autoCorrect: 'off',
          autoCapitalize: 'off',
          spellCheck: false,
          'aria-label': '이름 검색',
          onInput: (e: { target: { value: string } }) => onChangeText(e.target.value),
          style: {
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            padding: '10px 0',
            fontSize: 16,
            color: colors.body,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", sans-serif',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          },
        } as object)
      : null;
  return (
    <View style={styles.searchBox}>
      <Search size={16} color={colors.faint} strokeWidth={2} />
      {webInput ?? (
        <TextInput
          style={styles.searchInput}
          defaultValue=""
          onChangeText={onChangeText}
          placeholder="이름 검색"
          placeholderTextColor={colors.faint}
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
        />
      )}
    </View>
  );
});

/**
 * 소개 페이지·명부 줄 — memo로 고정해, 검색어가 바뀌어도 내용이 같은 줄은
 * 다시 그리지 않는다. 키 입력마다 이미지 145장을 전부 재렌더하면
 * 메인 스레드가 막혀 한글 조합 커서가 튄다.
 */
const PageItem = React.memo(function PageItem({
  p,
  i,
  pageCount,
  pageWidth,
}: {
  p: AlbumPage | null;
  i: number;
  pageCount: number;
  pageWidth: number;
}) {
  return (
    <View style={[styles.pageWrap, shadows.card]}>
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
  );
});

const RowItem = React.memo(function RowItem({
  img,
  cell,
  showHeader,
  pageWidth,
}: {
  img: AlbumPage | undefined;
  cell: string;
  showHeader: boolean;
  pageWidth: number;
}) {
  return (
    <>
      {showHeader && (
        <View style={styles.cellHeader}>
          <Text style={styles.cellHeaderText}>{cell.toUpperCase()}</Text>
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
    </>
  );
});

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
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbRef = useRef<Firestore | null>(null);
  const fetching = useRef<Set<number>>(new Set());

  // 한글 조합(IME) 중에 React가 값을 입력창에 되써넣으면 글자가 흔들리므로
  // 입력창은 비제어로 두고, 필터는 입력이 잠시 멈춘 뒤(300ms) 적용한다.
  // useCallback으로 참조를 고정해 SearchBox(memo)가 재렌더되지 않게 한다.
  const onQueryChange = React.useCallback((t: string) => {
    if (queryTimer.current) clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(() => setQuery(t), 300);
  }, []);

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
        // 명부 이미지 배경 로드는 10장씩 묶어 반영 — 한 장마다 화면 전체를
        // 다시 그리면 입력 중 커서가 흔들리고 스크롤이 버벅인다
        let batch: Record<number, AlbumPage> = {};
        const flush = () => {
          if (Object.keys(batch).length === 0) return;
          const b = batch;
          batch = {};
          setCache((prev) => ({ ...prev, ...b }));
        };
        for (let i = 0; i < idx.length && !cancelled; i++) {
          if (fetching.current.has(i)) continue;
          fetching.current.add(i);
          try {
            const snap = await getDoc(
              doc(db, 'albums', 'current', 'rows', String(i).padStart(4, '0')),
            );
            const image = String(snap.get('image') ?? '');
            if (image) {
              batch[i] = { image, w: Number(snap.get('w') ?? 3), h: Number(snap.get('h') ?? 1) };
            }
          } catch {
            fetching.current.delete(i);
          }
          if (Object.keys(batch).length >= 10) flush();
        }
        if (!cancelled) flush();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 검색은 두 글자부터 동작 (한 글자는 무시하고 소개 페이지 유지)
  const filtering = !!cellFilter || norm(query).length >= 2;
  const visible = useMemo(
    () =>
      index
        .map((r, i) => ({ r, i }))
        .filter(
          ({ r }) =>
            (!cellFilter || r.cell === cellFilter) && matchNames(r.names, r.cell, query),
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
        <>
          {/* 셀 선택 + 이름 검색 — 스크롤 목록 밖 고정 영역.
              목록 안에 두면 검색 결과로 내용이 바뀔 때 입력창 포커스가
              순간 끊겨 한글 조합이 낱글자로 풀어진다 */}
          {index.length > 0 && (
            <View style={styles.filterWrap}>
              <View style={styles.filterBar}>
                <Pressable style={styles.dropBtn} onPress={() => setDropOpen((o) => !o)}>
                  <Text style={styles.dropBtnText}>{cellFilter ?? '전체 셀'}</Text>
                  <ChevronDown size={16} color={colors.primary} strokeWidth={2} />
                </Pressable>
                <SearchBox onChangeText={onQueryChange} />
              </View>
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
            </View>
          )}
        <ScrollView
          contentContainerStyle={[styles.pages, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!filtering &&
            pages.map((p, i) => (
              <PageItem key={`p${i}`} p={p} i={i} pageCount={pageCount} pageWidth={pageWidth} />
            ))}

          {/* 명부 — 셀 제목 아래 멤버 줄들 */}
          {filtering && visible.length === 0 && (
            <Text style={styles.loadingNote}>검색 결과가 없습니다.</Text>
          )}
          {visible.map(({ r, i }, vi) => {
            const prev = vi > 0 ? visible[vi - 1].r : null;
            return (
              <RowItem
                key={`r${i}`}
                img={cache[i]}
                cell={r.cell}
                showHeader={!prev || prev.cell !== r.cell}
                pageWidth={pageWidth}
              />
            );
          })}
          <Pressable style={styles.webLink} onPress={openPdf}>
            <Text style={styles.webLinkText}>원본 PDF 열기 ›</Text>
          </Pressable>
        </ScrollView>
        </>
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

  filterWrap: { paddingHorizontal: 12, paddingTop: 12, gap: 10 },
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
