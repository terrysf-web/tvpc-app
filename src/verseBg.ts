/**
 * 시간대별 말씀카드 배경.
 *
 * 기본은 앱에 내장된 그림(/verse-bg-{slot}.jpg)을 쓰고, 관리자가
 * 앱 관리자 화면에서 그림 한 장을 올리면 그 자리에서 시간대별 5종
 * (새벽 해돋이·아침 원본·오후 햇살·저녁 노을·밤 달과 별)으로 변환해
 * Firestore(verseBg/{slot})에 저장한다 — 이후 모든 앱이 그걸 보여준다.
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ensureAnonymousAuth, getDb } from './firebase';

export type BgSlot = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night';

export const BG_SLOTS: BgSlot[] = ['dawn', 'morning', 'afternoon', 'evening', 'night'];

/** 인사말과 같은 시간대 구분 — 새벽(0~6)·아침(6~12)·오후(12~18)·저녁(18~20)·밤(20~24) */
export function currentSlot(): BgSlot {
  const h = new Date().getHours();
  if (h < 6) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  if (h < 20) return 'evening';
  return 'night';
}

/** 어두운 배경(흰 글씨) 여부 — 변환 규칙상 새벽·저녁·밤이 어둡다 */
const DARK_SLOTS: BgSlot[] = ['dawn', 'evening', 'night'];

// 세션 동안 슬롯별 결과 캐시 (null = 관리자 업로드 없음 → 내장 그림)
const cache: Partial<Record<BgSlot, string | null>> = {};

// 마지막으로 받아온 배경을 기기(localStorage)에 저장해, 앱을 다시 열 때
// 서버 응답을 기다리는 동안 내장 기본 그림이 번쩍이지 않게 한다.
// 용량 제한 때문에 현재 시간대 한 장만 저장한다.
const DEVICE_BG_KEY = 'tvpc.verseBgLast';
const DEVICE_SUNDAY_KEY = 'tvpc.sundayBgLast';

/**
 * undefined = 아직 모름(저장된 정보 없음) → 확정 전까지 아무 그림도 단정하지 말 것
 * null      = '관리자 업로드 없음'이 확인돼 저장됨 → 내장 기본 그림이 정답
 * string    = 마지막으로 받은 업로드 그림
 */
function readDeviceBg(slot: BgSlot): string | null | undefined {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const raw = window.localStorage.getItem(DEVICE_BG_KEY);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as { slot?: string; img?: string; none?: boolean };
    if (p.slot !== slot) return undefined;
    if (p.none) return null;
    return p.img || undefined;
  } catch {
    return undefined;
  }
}

function writeDeviceBg(slot: BgSlot, img: string | null) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (img) window.localStorage.setItem(DEVICE_BG_KEY, JSON.stringify({ slot, img }));
    else window.localStorage.setItem(DEVICE_BG_KEY, JSON.stringify({ slot, none: true }));
  } catch {
    /* 저장 공간 부족 등은 무시 — 다음에 다시 서버에서 받는다 */
  }
}

/**
 * ready가 false인 동안은 어떤 배경이 정답인지 아직 모르는 상태다.
 * 화면에서는 그동안 중립 로딩 배경을 보여줘, 기본 그림이 번쩍했다가
 * 업로드 그림으로 바뀌는 혼란을 없앤다.
 */
export function useVerseBg(): { uri: string; dark: boolean; ready: boolean } {
  const slot = currentSlot();
  const fallback = `/verse-bg-${slot}.jpg`;
  const cached = cache[slot];
  const [state, setState] = useState<{ uri: string; ready: boolean }>(() => {
    if (cached !== undefined) return { uri: cached ?? fallback, ready: true };
    const dev = readDeviceBg(slot);
    if (dev !== undefined) return { uri: dev ?? fallback, ready: true };
    return { uri: fallback, ready: false };
  });

  useEffect(() => {
    let on = true;
    (async () => {
      if (cache[slot] !== undefined) {
        if (on) setState({ uri: cache[slot] ?? fallback, ready: true });
        return;
      }
      try {
        const db = getDb();
        if (!db) {
          cache[slot] = null;
          if (on) setState({ uri: fallback, ready: true });
          return;
        }
        await ensureAnonymousAuth();
        const snap = await getDoc(doc(db, 'verseBg', slot));
        const img = snap.exists() ? String(snap.get('image') ?? '') : '';
        cache[slot] = img || null;
        writeDeviceBg(slot, img || null);
        if (on) setState({ uri: img || fallback, ready: true });
      } catch {
        // 서버 실패 — 기기 저장분이 있으면 유지, 없으면 기본 그림으로 확정
        cache[slot] = null;
        if (on) setState((s) => ({ ...s, ready: true }));
      }
    })();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  return { uri: state.uri, dark: DARK_SLOTS.includes(slot), ready: state.ready };
}

/* ---------------- 관리자용: 그림 한 장 → 5종 변환·저장 ---------------- */

const W = 1600;
const H = 730;

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const s = Math.max(W / img.width, H / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function multiply(ctx: CanvasRenderingContext2D, color: string) {
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

function vGradient(ctx: CanvasRenderingContext2D, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function glow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  inner: string,
  mid: string,
) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, mid);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function gradeSlot(ctx: CanvasRenderingContext2D, img: HTMLImageElement, slot: BgSlot) {
  drawCover(ctx, img);
  if (slot === 'morning') {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, W, H);
  } else if (slot === 'afternoon') {
    ctx.fillStyle = 'rgba(255,217,138,0.10)';
    ctx.fillRect(0, 0, W, H);
    glow(ctx, W * 0.8, H * 0.15, W * 0.35, 'rgba(255,243,194,0.55)', 'rgba(255,243,194,0.2)');
  } else if (slot === 'dawn') {
    // 해돋이 — 새벽빛 하늘 + 수평선에서 떠오르는 해
    multiply(ctx, '#D8D2CC');
    vGradient(ctx, [
      [0, 'rgba(61,76,126,0.55)'],
      [0.45, 'rgba(138,110,140,0.35)'],
      [0.62, 'rgba(245,166,94,0.35)'],
      [1, 'rgba(46,58,92,0.35)'],
    ]);
    glow(ctx, W * 0.3, H * 0.6, W * 0.24, 'rgba(255,233,176,0.95)', 'rgba(255,201,126,0.4)');
    circle(ctx, W * 0.3, H * 0.58, 40, '#FFF3CE');
  } else if (slot === 'evening') {
    // 노을
    multiply(ctx, '#D3C2B6');
    vGradient(ctx, [
      [0, 'rgba(74,68,120,0.45)'],
      [0.4, 'rgba(176,97,136,0.4)'],
      [0.7, 'rgba(240,138,80,0.45)'],
      [1, 'rgba(138,74,60,0.4)'],
    ]);
    glow(ctx, W * 0.72, H * 0.58, W * 0.2, 'rgba(255,224,160,0.85)', 'rgba(255,201,126,0.3)');
    circle(ctx, W * 0.72, H * 0.56, 36, '#FFE9B8');
  } else {
    // 밤 — 어둡게 + 달과 별. 달은 카드 오른쪽 위의 날짜 글씨와 겹치지 않게
    // 가운데 위쪽에 둔다.
    multiply(ctx, '#5F6E92');
    ctx.fillStyle = 'rgba(18,36,76,0.45)';
    ctx.fillRect(0, 0, W, H);
    const mx = W * 0.58;
    const my = H * 0.2;
    glow(ctx, mx, my, W * 0.16, 'rgba(232,240,255,0.4)', 'rgba(232,240,255,0.15)');
    circle(ctx, mx, my, 40, '#F2ECD4');
    circle(ctx, mx - 14, my - 11, 8, 'rgba(222,215,188,0.6)');
    circle(ctx, mx + 13, my + 13, 5, 'rgba(222,215,188,0.5)');
    for (let i = 0; i < 14; i++) {
      const x = (i * 397) % W;
      const y = (i * 173) % (H * 0.45);
      // 오른쪽 위 날짜 자리와 왼쪽 위 배지 자리는 별도 피한다
      if (y < H * 0.18 && (x > W * 0.62 || x < W * 0.3)) continue;
      circle(ctx, x, y, 1.6 + (i % 3) * 0.6, `rgba(255,255,255,${0.5 + (i % 4) * 0.12})`);
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
    el.src = src;
  });
}

async function gradeFromImage(
  img: HTMLImageElement,
  onStatus?: (msg: string) => void,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');

  const LABEL: Record<BgSlot, string> = {
    dawn: '새벽(해돋이)',
    morning: '아침',
    afternoon: '오후',
    evening: '저녁(노을)',
    night: '밤(달·별)',
  };

  for (const slot of BG_SLOTS) {
    onStatus?.(`${LABEL[slot]} 만드는 중…`);
    ctx.clearRect(0, 0, W, H);
    gradeSlot(ctx, img, slot);
    // Firestore 문서 1MB 한도 — 크면 화질을 낮춰 다시 시도
    let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL('image/jpeg', 0.68);
    if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL('image/jpeg', 0.55);
    await setDoc(doc(db, 'verseBg', slot), {
      image: dataUrl,
      updatedAt: new Date().toISOString(),
    });
    cache[slot] = dataUrl;
    if (slot === currentSlot()) writeDeviceBg(slot, dataUrl);
  }
  onStatus?.('완료 — 앱에 바로 반영됩니다.');
}

/**
 * 관리자 화면에서 사용 — 밝은 낮 풍경 그림 한 장을 받아
 * 시간대별 5종으로 변환해 Firestore에 저장한다. (웹 전용)
 * 원본도 함께 저장해, 변환 규칙이 바뀌면 그림을 다시 올리지 않고
 * '다시 변환'만 누르면 되게 한다.
 */
export async function gradeAndSaveVerseBg(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');

  const objUrl = URL.createObjectURL(file);
  const img = await loadImage(objUrl);

  // 원본 보관 (카드 크기로 잘라 고화질 저장)
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawCover(ctx, img);
    let dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    await setDoc(doc(db, 'verseBg', 'original'), {
      image: dataUrl,
      updatedAt: new Date().toISOString(),
    });
  }

  await gradeFromImage(img, onStatus);
  URL.revokeObjectURL(objUrl);
}

/** 저장된 원본으로 다시 변환 — 변환 규칙이 바뀐 뒤 원클릭 갱신용 */
export async function regradeVerseBg(onStatus?: (msg: string) => void): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  const snap = await getDoc(doc(db, 'verseBg', 'original'));
  const src = snap.exists() ? String(snap.get('image') ?? '') : '';
  if (!src) throw new Error('저장된 원본이 없습니다. 배경 그림을 먼저 선택해 주세요.');
  const img = await loadImage(src);
  await gradeFromImage(img, onStatus);
}

/* ---------------- 주일 전용 배경 (선택) ---------------- */

// 슬롯별 캐시 — 시간대 변환본(verseBg/sunday-{slot})이 있으면 그것을,
// 없으면 예전처럼 한 장짜리(verseBg/sunday)를 쓴다.
const sundayCache: Partial<Record<BgSlot, { uri: string; dark: boolean } | null>> = {};

/** undefined = 아직 모름, null = '주일 배경 없음' 확인됨, 값 = 마지막 배경 */
function readDeviceSunday(slot: BgSlot): { uri: string; dark: boolean } | null | undefined {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined;
    const raw = window.localStorage.getItem(DEVICE_SUNDAY_KEY);
    if (!raw) return undefined;
    const p = JSON.parse(raw) as { slot?: string; uri?: string; dark?: boolean; none?: boolean };
    if (p.slot !== slot) return undefined;
    if (p.none) return null;
    return p.uri ? { uri: p.uri, dark: !!p.dark } : undefined;
  } catch {
    return undefined;
  }
}

function writeDeviceSunday(slot: BgSlot, v: { uri: string; dark: boolean } | null) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      DEVICE_SUNDAY_KEY,
      JSON.stringify(v ? { slot, ...v } : { slot, none: true }),
    );
  } catch {
    /* 저장 실패는 무시 */
  }
}

/**
 * 주일예배 카드 전용 배경 — 등록돼 있으면 bg에 반환, 없으면 null.
 * ready가 false면 아직 모르는 상태이므로 화면은 로딩 표시를 유지할 것.
 */
export function useSundayBg(): { bg: { uri: string; dark: boolean } | null; ready: boolean } {
  const slot = currentSlot();
  const [state, setState] = useState<{
    bg: { uri: string; dark: boolean } | null;
    ready: boolean;
  }>(() => {
    if (sundayCache[slot] !== undefined) return { bg: sundayCache[slot] ?? null, ready: true };
    const dev = readDeviceSunday(slot);
    if (dev !== undefined) return { bg: dev, ready: true };
    return { bg: null, ready: false };
  });
  useEffect(() => {
    let on = true;
    (async () => {
      if (sundayCache[slot] !== undefined) {
        if (on) setState({ bg: sundayCache[slot] ?? null, ready: true });
        return;
      }
      try {
        const db = getDb();
        if (!db) {
          sundayCache[slot] = null;
          if (on) setState({ bg: null, ready: true });
          return;
        }
        await ensureAnonymousAuth();
        // 시간대 변환본 우선, 없으면 예전 한 장짜리
        let snap = await getDoc(doc(db, 'verseBg', `sunday-${slot}`));
        if (!snap.exists()) snap = await getDoc(doc(db, 'verseBg', 'sunday'));
        const img = snap.exists() ? String(snap.get('image') ?? '') : '';
        const found = img ? { uri: img, dark: !!snap.get('dark') } : null;
        sundayCache[slot] = found;
        writeDeviceSunday(slot, found);
        if (on) setState({ bg: found, ready: true });
      } catch {
        // 서버 실패 — 기기 저장분이 있으면 유지, 없으면 '없음'으로 확정
        sundayCache[slot] = null;
        if (on) setState((s) => ({ ...s, ready: true }));
      }
    })();
    return () => {
      on = false;
    };
  }, [slot]);
  return state;
}

/**
 * 주일 전용 배경 저장 — 변환 없이 그대로 쓰되, 평균 밝기를 재서
 * 글씨 색(흰색/남색)을 자동으로 정한다. (웹 전용, 관리자)
 */
export async function saveSundayBg(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  const objUrl = URL.createObjectURL(file);
  const img = await loadImage(objUrl);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  drawCover(ctx, img);
  // 평균 밝기 — 64×32로 줄여 샘플링
  const s = document.createElement('canvas');
  s.width = 64;
  s.height = 32;
  const sctx = s.getContext('2d');
  let dark = false;
  if (sctx) {
    sctx.drawImage(canvas, 0, 0, 64, 32);
    const d = sctx.getImageData(0, 0, 64, 32).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    dark = sum / (d.length / 4) < 115; // 어두운 그림이면 흰 글씨
  }
  let dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL('image/jpeg', 0.55);
  // 원본 보관 — 시간대 변환을 다시 하거나, 변환본이 없을 때의 대비
  await setDoc(doc(db, 'verseBg', 'sunday'), {
    image: dataUrl,
    dark,
    updatedAt: new Date().toISOString(),
  });
  // 평일 말씀 배경과 같은 방식으로 시간대 5종을 함께 만든다
  await gradeSundayFromImage(img, onStatus);
  URL.revokeObjectURL(objUrl);
}

/** 주일 그림 한 장 → 시간대 5종 (verseBg/sunday-{slot}) */
async function gradeSundayFromImage(
  img: HTMLImageElement,
  onStatus?: (msg: string) => void,
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');

  const LABEL: Record<BgSlot, string> = {
    dawn: '새벽(해돋이)',
    morning: '아침',
    afternoon: '오후',
    evening: '저녁(노을)',
    night: '밤(달·별)',
  };

  for (const slot of BG_SLOTS) {
    onStatus?.(`주일 ${LABEL[slot]} 만드는 중…`);
    ctx.clearRect(0, 0, W, H);
    gradeSlot(ctx, img, slot);
    // 글씨 색은 만들어진 그림의 밝기로 정한다 (밤은 어둡고 아침은 밝다)
    let dark = true;
    const small = document.createElement('canvas');
    small.width = 64;
    small.height = 32;
    const sctx = small.getContext('2d');
    if (sctx) {
      sctx.drawImage(canvas, 0, 0, 64, 32);
      const d = sctx.getImageData(0, 0, 64, 32).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
      dark = sum / (d.length / 4) < 115;
    }
    let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL('image/jpeg', 0.68);
    if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL('image/jpeg', 0.55);
    await setDoc(doc(db, 'verseBg', `sunday-${slot}`), {
      image: dataUrl,
      dark,
      updatedAt: new Date().toISOString(),
    });
    sundayCache[slot] = { uri: dataUrl, dark };
    if (slot === currentSlot()) writeDeviceSunday(slot, { uri: dataUrl, dark });
  }
  onStatus?.('완료 — 주일 카드가 시간대에 따라 바뀝니다.');
}

/**
 * 이미 올려둔 주일 그림으로 시간대 5종을 다시 만든다.
 * 그림을 다시 올릴 필요 없이 버튼 한 번이면 된다.
 */
export async function regradeSundayBg(onStatus?: (msg: string) => void): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  const snap = await getDoc(doc(db, 'verseBg', 'sunday'));
  const src = snap.exists() ? String(snap.get('image') ?? '') : '';
  if (!src) throw new Error('등록된 주일 배경이 없습니다. 그림을 먼저 올려주세요.');
  const img = await loadImage(src);
  await gradeSundayFromImage(img, onStatus);
}

/** 주일 전용 배경 삭제 — 시간대 배경으로 복귀 */
export async function clearSundayBg(): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  await deleteDoc(doc(db, 'verseBg', 'sunday')).catch(() => {});
  for (const slot of BG_SLOTS) {
    await deleteDoc(doc(db, 'verseBg', `sunday-${slot}`)).catch(() => {});
    sundayCache[slot] = null;
  }
  writeDeviceSunday(currentSlot(), null);
}

/** 관리자 업로드를 지우고 내장 기본 그림으로 되돌린다 */
export async function resetVerseBg(): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  for (const slot of BG_SLOTS) {
    await deleteDoc(doc(db, 'verseBg', slot)).catch(() => {});
    cache[slot] = null;
  }
  writeDeviceBg(currentSlot(), null);
}
