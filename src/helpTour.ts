import { useEffect, useState } from 'react';

/**
 * 안내서 둘러보기 — 「앱 사용 안내서」의 '바로 가기'로 다른 화면에 갔을 때,
 * 안내서로 돌아오는 단추를 띄우기 위한 표시.
 *
 * 덮개 화면(주보·교회 미디어 등)은 머리말의 ‹ 로 돌아올 수 있지만,
 * 탭 화면(홈·말씀·설교·소식)에는 돌아올 길이 없어 길을 잃는다.
 * 새로고침해도 남지 않도록 이 브라우저 탭에만(sessionStorage) 저장한다.
 */
const KEY = 'tvpc.helpTour';
/** 어느 꼭지에서 떠났는지 — 돌아올 때 그 자리로 되돌리기 위해 */
const ANCHOR = 'tvpc.helpAnchor';

const subs = new Set<() => void>();

function read(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(on: boolean) {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (on) window.sessionStorage.setItem(KEY, '1');
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

let active = read();

function emit() {
  subs.forEach((f) => f());
}

/** 안내서에서 다른 화면으로 떠난다 */
export function startHelpTour() {
  if (active) return;
  active = true;
  write(true);
  emit();
}

/** 안내서로 돌아왔거나 그만 볼 때 */
export function endHelpTour() {
  if (!active) return;
  active = false;
  write(false);
  emit();
}

/** 지금 안내서에서 나와 있는 중인지 */
export function useHelpTour(): boolean {
  const [on, setOn] = useState(active);
  useEffect(() => {
    // 첫 그림 뒤에 저장된 값을 한 번 맞춘다 (서버 렌더 대비)
    setOn(active);
    const f = () => setOn(active);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return on;
}

/** 떠나는 꼭지를 적어둔다 */
export function setHelpAnchor(key: string) {
  try {
    window.sessionStorage?.setItem(ANCHOR, key);
  } catch {
    /* 무시 */
  }
}

/** 돌아왔을 때 한 번만 꺼내 쓴다 (다음에 그냥 열면 맨 위부터) */
export function takeHelpAnchor(): string | null {
  try {
    const v = window.sessionStorage?.getItem(ANCHOR) ?? null;
    if (v) window.sessionStorage.removeItem(ANCHOR);
    return v;
  } catch {
    return null;
  }
}
