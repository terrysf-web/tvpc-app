/**
 * 주보 PDF → 전화기 화면용 페이지 이미지.
 *
 * 관리자(컴퓨터 브라우저)가 주보 PDF를 올리면 브라우저 안에서 각 장을
 * 렌더링해 세로 반쪽으로 자르고(접는 주보), JPEG 데이터 URL로 만들어
 * Firestore `bulletins/{날짜}/pages/{n}` 에 저장한다.
 * 무료(Spark) 요금제라 Storage 대신 Firestore 문서(1MB 한도)에 담는다.
 *
 * 접는 주보의 인쇄면 순서: 첫 장 [4면|1면], 둘째 장 [2면|3면]
 * → 읽는 순서 = 첫 장 오른쪽, 둘째 장 왼쪽, 둘째 장 오른쪽, 첫 장 왼쪽.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ensureAnonymousAuth, getDb } from '../firebase';

export interface BulletinPage {
  image: string; // JPEG data URL
  w: number;
  h: number;
}

export interface Bulletin {
  date: string; // YYYY-MM-DD
  pages: BulletinPage[];
  /** 설교 노트 괄호 채우기 문장 — "(____)"가 빈칸 자리 */
  noteLines?: string[];
  /** 나눔 질문 — 설교 노트의 [나눔 질문] 항목 */
  shareQuestions?: string[];
}

/** Firestore 문서 1MB 한도 아래로 유지 (base64 문자열 기준) */
const MAX_IMAGE_CHARS = 900_000;
/** 반쪽(전화기 한 페이지) 기준 렌더링 폭 */
const TARGET_HALF_WIDTH = 1240;

/** PDF 파일을 페이지 이미지 배열로 변환 — 웹 전용 */
export async function convertPdfToBulletinPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<BulletinPage[]> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('PDF 변환은 컴퓨터 브라우저에서만 가능합니다.');
  }
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;

  // 1) 각 PDF 장을 캔버스로 렌더링하고, 가로형이면 세로 반쪽 2장으로 자른다.
  const halves: { canvas: HTMLCanvasElement; sheet: number; side: 'left' | 'right' | 'full' }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const landscape = base.width > base.height * 1.15;
    const scale = (landscape ? TARGET_HALF_WIDTH * 2 : TARGET_HALF_WIDTH) / base.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    if (landscape) {
      const half = Math.floor(canvas.width / 2);
      for (const side of ['left', 'right'] as const) {
        const c = document.createElement('canvas');
        c.width = half;
        c.height = canvas.height;
        const cctx = c.getContext('2d');
        if (!cctx) throw new Error('캔버스를 만들 수 없습니다.');
        cctx.drawImage(canvas, side === 'left' ? 0 : canvas.width - half, 0, half, canvas.height, 0, 0, half, canvas.height);
        halves.push({ canvas: c, sheet: p, side });
      }
    } else {
      halves.push({ canvas, sheet: p, side: 'full' });
    }
    onProgress?.(p, pdf.numPages);
  }

  // 2) 접는 주보(가로 2장 = 반쪽 4면: [4|1][2|3])이면 읽는 순서로 재배열.
  let ordered = halves;
  if (pdf.numPages === 2 && halves.length === 4) {
    ordered = [halves[1], halves[2], halves[3], halves[0]];
  }

  // 3) JPEG 인코딩 — 1MB 문서 한도를 넘으면 품질을 낮춰 재시도.
  return ordered.map(({ canvas }) => {
    let image = '';
    for (const q of [0.85, 0.72, 0.6, 0.45]) {
      image = canvas.toDataURL('image/jpeg', q);
      if (image.length <= MAX_IMAGE_CHARS) break;
    }
    if (image.length > MAX_IMAGE_CHARS) {
      throw new Error('페이지 이미지가 너무 큽니다. PDF 해상도를 낮춰 다시 시도해 주세요.');
    }
    return { image, w: canvas.width, h: canvas.height };
  });
}

/** 변환된 페이지들을 Firestore에 저장 (같은 날짜는 덮어쓰기) */
export async function saveBulletin(date: string, pages: BulletinPage[]): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜는 YYYY-MM-DD 형식으로 입력해 주세요.');

  // 기존 페이지 제거(페이지 수가 줄어도 잔여물이 없도록)
  const old = await getDocs(collection(db, 'bulletins', date, 'pages'));
  await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));

  for (let i = 0; i < pages.length; i++) {
    await setDoc(doc(db, 'bulletins', date, 'pages', String(i).padStart(3, '0')), {
      order: i,
      image: pages[i].image,
      w: pages[i].w,
      h: pages[i].h,
    });
  }
  await setDoc(doc(db, 'bulletins', date), {
    date,
    pageCount: pages.length,
    updatedAt: serverTimestamp(),
  });
}

/** 저장된 주보 날짜 목록(최신순) — 지난 주보 열람용 */
export function useBulletinDates(enabled: boolean): { dates: string[]; loading: boolean } {
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getDb();
    if (!db || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await ensureAnonymousAuth();
        const snap = await getDocs(
          // 주보 목록 문서는 한 건에 1KB도 되지 않아(그림은 하위 pages에) 몇 해치를
          // 한꺼번에 읽어도 가볍다. 화면에서는 최근 것만 칩으로 보이고,
          // 나머지는 '지난 주보' 목록에서 월별로 고른다.
          query(collection(db, 'bulletins'), orderBy('date', 'desc'), limit(300)),
        );
        if (!cancelled) setDates(snap.docs.map((d) => d.id));
      } catch {
        // 오프라인 등 — 빈 목록이면 화면에서 홈페이지 링크로 안내
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { dates, loading };
}

/** 선택한 날짜의 주보 페이지 — 날짜가 바뀔 때마다 그 주만 불러온다 */
export function useBulletin(date: string | null): {
  bulletin: Bulletin | null;
  loading: boolean;
} {
  const [bulletin, setBulletin] = useState<Bulletin | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const db = getDb();
    if (!db || !date) {
      setBulletin(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await ensureAnonymousAuth();
        const [pagesSnap, docSnap] = await Promise.all([
          getDocs(query(collection(db, 'bulletins', date, 'pages'), orderBy('order'))),
          getDoc(doc(db, 'bulletins', date)),
        ]);
        if (cancelled) return;
        const pages = pagesSnap.docs.map((d) => ({
          image: String(d.get('image') ?? ''),
          w: Number(d.get('w') ?? 3),
          h: Number(d.get('h') ?? 4),
        }));
        const noteLines = ((docSnap.get('noteLines') as string[] | undefined) ?? []).map(String);
        setBulletin(pages.length ? { date, pages, noteLines } : null);
      } catch {
        if (!cancelled) setBulletin(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  return { bulletin, loading };
}

/**
 * 최신 주보의 설교 노트 괄호 채우기 문장만 가볍게 조회 — 말씀 탭 메모칸에서
 * 쓰기 위한 용도라, 무거운 페이지 이미지(pages 하위 컬렉션)는 읽지 않는다.
 */
export function useBulletinNoteLines(date: string | null): {
  noteLines: string[];
  loading: boolean;
} {
  const [noteLines, setNoteLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const db = getDb();
    if (!db || !date) {
      setNoteLines([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await ensureAnonymousAuth();
        const docSnap = await getDoc(doc(db, 'bulletins', date));
        if (cancelled) return;
        setNoteLines(((docSnap.get('noteLines') as string[] | undefined) ?? []).map(String));
      } catch {
        if (!cancelled) setNoteLines([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  return { noteLines, loading };
}

/**
 * 최신 주보의 나눔 질문만 가볍게 조회 — 말씀 탭 메모칸에서 쓰기 위한
 * 용도라, 무거운 페이지 이미지(pages 하위 컬렉션)는 읽지 않는다.
 */
export function useBulletinShareQuestions(date: string | null): {
  shareQuestions: string[];
  loading: boolean;
} {
  const [shareQuestions, setShareQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const db = getDb();
    if (!db || !date) {
      setShareQuestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await ensureAnonymousAuth();
        const docSnap = await getDoc(doc(db, 'bulletins', date));
        if (cancelled) return;
        setShareQuestions(((docSnap.get('shareQuestions') as string[] | undefined) ?? []).map(String));
      } catch {
        if (!cancelled) setShareQuestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  return { shareQuestions, loading };
}
