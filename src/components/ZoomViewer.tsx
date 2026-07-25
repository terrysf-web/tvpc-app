import React, { useRef } from 'react';

/**
 * 전체화면 사진 뷰어 — 핀치로 확대·이동, 더블탭으로 확대/원위치.
 * 포인터 이벤트로 직접 구현 (뷰포트가 maximum-scale=1이라 브라우저
 * 기본 확대가 없어서, 사진은 여기서 크게 본다).
 * transform은 DOM에 직접 써서 제스처 중 리렌더가 없다.
 *
 * 웹 전용 — 부르는 쪽에서 Platform.OS === 'web'을 확인하고 쓴다.
 * (교우 앨범·교회 사진 두 화면이 함께 쓴다)
 */
export function ZoomViewer({
  src,
  caption,
  onClose,
}: {
  src: string;
  /** 아래쪽에 함께 보여줄 설명 — 없으면 확대 조작 안내를 보여준다 */
  caption?: string;
  onClose: () => void;
}) {
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
      src,
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
          padding: '0 20px',
          color: 'rgba(255,255,255,0.62)',
          fontSize: 12.5,
          lineHeight: 1.5,
          fontFamily: '-apple-system, system-ui, sans-serif',
          pointerEvents: 'none',
        },
      } as object,
      caption || '두 손가락으로 확대 · 더블탭 확대/원위치',
    ),
  );
}
