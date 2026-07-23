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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query as fsQuery,
  startAfter,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
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
 * 자리 표시용 이름 정리 — OCR 색인에는 검색을 위해 잡음까지 담겨 있지만,
 * 화면에 보여줄 때는 사람 이름처럼 생긴 토큰(한글, 첫 글자만 대문자인
 * 영문)만 남긴다. ")66540", "HH", "=" 같은 잡음 제거.
 */
function cleanNames(s: string): string {
  return s
    .split(/\s+/)
    .filter((t) => /^[가-힣]+$/.test(t) || /^[A-Z][a-z]+$/.test(t))
    .join(' ')
    .slice(0, 60);
}

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
      if (i !== j && (toks[i] + toks[j]).includes(nq)) return true;
    }
  }
  // 세 조각 조합('영 허 성' 같은 낱글자 분해)은 짧은 토큰(≤2자)끼리만 —
  // 긴 토큰 조합은 위의 두 조각 검사로 이미 걸리고, 전체 삼중 루프는 느리다
  const short = toks.filter((t) => t.length <= 2);
  const m = short.length;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      if (i === j) continue;
      for (let k = 0; k < m; k++) {
        if (k === i || k === j) continue;
        if ((short[i] + short[j] + short[k]).includes(nq)) return true;
      }
    }
  }
  return false;
}

/**
 * 근사 일치 — OCR이 이름 마지막 글자를 잘못 읽은 경우('백대희'↔'백대호')를
 * 위한 대체 검색. 검색어 앞부분이 그대로 이어지고 마지막 글자 하나만
 * 다를 때(그 글자가 한글일 때)만 인정한다.
 * 정확 일치 결과가 하나도 없을 때만 사용한다 — 항상 켜 두면
 * '이진수'가 '이진 고'(고이진)에 걸리는 오탐이 생긴다.
 */
function matchNamesFuzzy(names: string, cell: string, q: string): boolean {
  const nq = norm(q);
  if (nq.length < 3) return false;
  const comb = norm(`${names} ${cell}`);
  const head = nq.slice(0, -1);
  let i = comb.indexOf(head);
  while (i >= 0) {
    const c = comb[i + nq.length - 1];
    if (c && c !== nq[nq.length - 1] && /[가-힣]/.test(c)) return true;
    i = comb.indexOf(head, i + 1);
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
          // iOS는 placeholder에 '이름' 같은 연락처 단어가 있으면 연락처
          // 자동완성(AutoFill Contact)을 강제로 붙이고, 그 오버레이가
          // 키 입력마다 갱신되며 한글 조합 커서를 튀게 한다.
          // type=search + 중립적인 문구로 검색창임을 명확히 해 차단한다.
          type: 'search',
          name: 'q',
          id: 'album-search',
          placeholder: '검색',
          autoComplete: 'off',
          autoCorrect: 'off',
          autoCapitalize: 'off',
          spellCheck: false,
          enterKeyHint: 'search',
          'aria-label': '검색',
          onInput: (e: { target: { value: string } }) => onChangeText(e.target.value),
          style: {
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            WebkitAppearance: 'none',
            appearance: 'none',
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
  onZoom,
}: {
  p: AlbumPage | null;
  i: number;
  pageCount: number;
  pageWidth: number;
  onZoom: (img: AlbumPage) => void;
}) {
  return (
    <View style={[styles.pageWrap, shadows.card]}>
      {p ? (
        <Pressable onPress={() => onZoom(p)}>
          <Image
            source={{ uri: p.image }}
            style={{ width: pageWidth, height: pageWidth * (p.h / p.w), borderRadius: 10 }}
            resizeMode="contain"
          />
        </Pressable>
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
  names,
  showHeader,
  pageWidth,
  onZoom,
}: {
  img: AlbumPage | undefined;
  cell: string;
  names: string;
  showHeader: boolean;
  pageWidth: number;
  onZoom: (img: AlbumPage) => void;
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
          <Pressable onPress={() => onZoom(img)}>
            <Image
              source={{ uri: img.image }}
              style={{ width: pageWidth, height: pageWidth * (img.h / img.w), borderRadius: 10 }}
              resizeMode="contain"
            />
          </Pressable>
        </View>
      ) : (
        // 사진이 내려오기 전에도 이름을 먼저 보여준다 — 검색이 느리다는
        // 느낌의 대부분은 사진 다운로드 대기 시간이다
        <View style={[styles.placeholder, styles.placeholderRow, { width: pageWidth }]}>
          <ActivityIndicator color={colors.faint} />
          <Text style={styles.placeholderNames} numberOfLines={2}>
            {cleanNames(names) || '사진 불러오는 중…'}
          </Text>
        </View>
      )}
    </>
  );
});

/**
 * 전체화면 사진 뷰어 — 핀치로 확대·이동, 더블탭으로 확대/원위치.
 * 포인터 이벤트로 직접 구현 (뷰포트가 maximum-scale=1이라 브라우저
 * 기본 확대가 없어서, 앨범 사진은 여기서 크게 본다).
 * transform은 DOM에 직접 써서 제스처 중 리렌더가 없다.
 */
function ZoomViewer({ img, onClose }: { img: AlbumPage; onClose: () => void }) {
  const imgRef = useRef<HTMLElement | null>(null);
  const st = useRef({
    s: 1,
    tx: 0,
    ty: 0,
    pts: new Map<number, { x: number; y: number }>(),
    start: null as null | { s: number; tx: number; ty: number; d: number; cx: number; cy: number },
    lastTap: 0,
  });
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const apply = () => {
    const el = imgRef.current;
    if (el) {
      el.style.transform = `translate(${st.current.tx}px, ${st.current.ty}px) scale(${st.current.s})`;
    }
  };
  const reset = () => {
    st.current.s = 1;
    st.current.tx = 0;
    st.current.ty = 0;
    apply();
  };

  type Pt = { pointerId: number; clientX: number; clientY: number };
  const onDown = (e: Pt) => {
    const c = st.current;
    c.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (c.pts.size === 2) {
      const [p1, p2] = [...c.pts.values()];
      c.start = {
        s: c.s,
        tx: c.tx,
        ty: c.ty,
        d: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        cx: (p1.x + p2.x) / 2,
        cy: (p1.y + p2.y) / 2,
      };
    } else if (c.pts.size === 1) {
      c.start = { s: c.s, tx: c.tx, ty: c.ty, d: 0, cx: e.clientX, cy: e.clientY };
      const now = Date.now();
      if (now - c.lastTap < 300) {
        // 더블탭 — 확대 ↔ 원래 크기
        if (c.s > 1) reset();
        else {
          c.s = 2.5;
          apply();
        }
        c.lastTap = 0;
        return;
      }
      c.lastTap = now;
    }
  };
  const onMove = (e: Pt) => {
    const c = st.current;
    if (!c.pts.has(e.pointerId) || !c.start) return;
    c.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (c.pts.size === 2) {
      const [p1, p2] = [...c.pts.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      c.s = clamp((c.start.s * d) / Math.max(c.start.d, 1), 1, 6);
      c.tx = c.start.tx + (mx - c.start.cx);
      c.ty = c.start.ty + (my - c.start.cy);
      apply();
    } else if (c.pts.size === 1 && c.s > 1) {
      c.tx = c.start.tx + (e.clientX - c.start.cx);
      c.ty = c.start.ty + (e.clientY - c.start.cy);
      apply();
    }
  };
  const onUp = (e: Pt) => {
    const c = st.current;
    c.pts.delete(e.pointerId);
    c.start = null;
    if (c.s <= 1.02) reset();
  };

  return React.createElement(
    'div',
    {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: 'rgba(6,10,18,0.97)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        touchAction: 'none',
        overscrollBehavior: 'contain',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      },
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onUp,
      onWheel: (e: { deltaY: number }) => {
        st.current.s = clamp(st.current.s * Math.exp(-e.deltaY / 300), 1, 6);
        if (st.current.s <= 1.02) reset();
        else apply();
      },
    } as object,
    React.createElement('img', {
      src: img.image,
      ref: (el: HTMLElement | null) => {
        imgRef.current = el;
      },
      style: {
        maxWidth: '100vw',
        maxHeight: '100vh',
        transformOrigin: 'center center',
        willChange: 'transform',
        pointerEvents: 'none',
      },
    } as object),
    React.createElement(
      'div',
      {
        onClick: onClose,
        onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        style: {
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          right: 16,
          zIndex: 1001,
          background: 'rgba(255,255,255,0.14)',
          color: '#fff',
          borderRadius: 999,
          padding: '9px 16px',
          fontSize: 15,
          fontFamily: '-apple-system, system-ui, sans-serif',
          cursor: 'pointer',
        },
      } as object,
      '✕ 닫기',
    ),
    React.createElement(
      'div',
      {
        style: {
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 12.5,
          fontFamily: '-apple-system, system-ui, sans-serif',
          pointerEvents: 'none',
        },
      } as object,
      '두 손가락으로 확대 · 더블탭 확대/원위치',
    ),
  );
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
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [cellFilter, setCellFilter] = useState<string | null>(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [zoomImg, setZoomImg] = useState<AlbumPage | null>(null);
  const onZoom = React.useCallback((img: AlbumPage) => setZoomImg(img), []);
  const closeZoom = React.useCallback(() => setZoomImg(null), []);
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbRef = useRef<Firestore | null>(null);
  const fetching = useRef<Set<number>>(new Set());
  const filteringRef = useRef(false);

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
        setSourceUrl((meta.get('sourceUrl') as string | undefined) ?? null);
        // 첫 페이지를 최우선으로 받아 바로 보여준다
        const loadPage = async (i: number) => {
          const snap = await getDoc(
            doc(db, 'albums', 'current', 'pages', String(i).padStart(3, '0')),
          );
          if (cancelled) return;
          const image = String(snap.get('image') ?? '');
          if (image) {
            setPages((prev) => {
              const next = [...prev];
              next[i] = { image, w: Number(snap.get('w') ?? 3), h: Number(snap.get('h') ?? 4) };
              return next;
            });
          }
        };
        await loadPage(0);

        // 문서를 한 개씩 165번 왕복해서 받으면 지연이 쌓여 몇 배 느려진다.
        // 페이지는 한 번의 묶음 조회로, 명부는 25줄씩 묶어 왕복을 ~8회로 줄인다.
        const pausedWhileFiltering = async () => {
          while (filteringRef.current && !cancelled) {
            await new Promise((r) => setTimeout(r, 300));
          }
        };
        const pagesSnap = await getDocs(
          fsQuery(collection(db, 'albums', 'current', 'pages'), orderBy('__name__')),
        );
        if (cancelled) return;
        setPages((prev) => {
          const next = [...prev];
          for (const d of pagesSnap.docs) {
            const i = Number(d.id);
            const image = String(d.get('image') ?? '');
            if (Number.isInteger(i) && i >= 0 && i < next.length && image) {
              next[i] = { image, w: Number(d.get('w') ?? 3), h: Number(d.get('h') ?? 4) };
            }
          }
          return next;
        });

        const rowsCol = collection(db, 'albums', 'current', 'rows');
        let lastDoc: QueryDocumentSnapshot | null = null;
        while (!cancelled) {
          await pausedWhileFiltering();
          if (cancelled) return;
          const q: Query = lastDoc
            ? fsQuery(rowsCol, orderBy('__name__'), startAfter(lastDoc), limit(25))
            : fsQuery(rowsCol, orderBy('__name__'), limit(25));
          const snap = await getDocs(q);
          if (cancelled || snap.empty) break;
          const b: Record<number, AlbumPage> = {};
          for (const d of snap.docs) {
            const i = Number(d.id);
            if (!Number.isInteger(i) || i < 0) continue;
            fetching.current.add(i);
            const image = String(d.get('image') ?? '');
            if (image) {
              b[i] = { image, w: Number(d.get('w') ?? 3), h: Number(d.get('h') ?? 1) };
            }
          }
          setCache((prev) => ({ ...prev, ...b }));
          lastDoc = snap.docs[snap.docs.length - 1];
          if (snap.docs.length < 25) break;
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

  // 검색은 두 글자부터 동작 (한 글자는 무시하고 소개 페이지 유지)
  const filtering = !!cellFilter || norm(query).length >= 2;
  filteringRef.current = filtering;
  const visible = useMemo(() => {
    const base = index
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !cellFilter || r.cell === cellFilter);
    if (norm(query).length < 2) return base;
    const exact = base.filter(({ r }) => matchNames(r.names, r.cell, query));
    if (exact.length > 0) return exact;
    // 정확 일치가 없을 때만 마지막 글자 오독 허용 (백대호 → 백대희)
    return base.filter(({ r }) => matchNamesFuzzy(r.names, r.cell, query));
  }, [index, cellFilter, query]);

  // 검색·셀 선택 결과의 이미지를 우선 로드
  useEffect(() => {
    if (!filtering) return;
    for (const { i } of visible.slice(0, 60)) {
      if (!cache[i]) void fetchRow(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtering, visible]);

  const pageWidth = Math.min(width, 520) - 24;
  // 변환에 실제로 쓰인 최신 PDF 주소(자동 탐색 결과)를 우선 사용
  const openPdf = () =>
    router.push({
      pathname: '/browser',
      params: { url: sourceUrl ?? churchInfo.albumPdf, t: '교회 앨범' },
    });

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
          {/* 확대 안내 */}
          <View style={styles.zoomHint}>
            <Text style={styles.zoomHintText}>사진을 탭하면 크게 볼 수 있습니다</Text>
          </View>
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
              <PageItem key={`p${i}`} p={p} i={i} pageCount={pageCount} pageWidth={pageWidth} onZoom={onZoom} />
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
                names={r.names}
                showHeader={!prev || prev.cell !== r.cell}
                pageWidth={pageWidth}
                onZoom={onZoom}
              />
            );
          })}
          <Pressable style={styles.webLink} onPress={openPdf}>
            <Text style={styles.webLinkText}>원본 PDF 열기 ›</Text>
          </Pressable>
        </ScrollView>
        </>
      )}
      {zoomImg && Platform.OS === 'web' && <ZoomViewer img={zoomImg} onClose={closeZoom} />}
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
  placeholderRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.card,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  placeholderNames: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.body,
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

  zoomHint: {
    backgroundColor: colors.tagBlueBg,
    paddingVertical: 7,
    alignItems: 'center',
  },
  zoomHintText: { fontFamily: font.medium, fontSize: 12.5, color: colors.primary },
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
