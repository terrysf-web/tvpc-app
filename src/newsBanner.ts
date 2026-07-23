/**
 * 소식 카드 배너 — 교회 소식(주보 게시판) 카드의 썸네일.
 * 홈페이지 이미지 주소는 앱에서 안 열리는 경우가 있어, 관리자가
 * 앱 관리자 화면에서 그림을 올리면 Firestore(newsBanner/current)에
 * 데이터로 저장하고 모든 소식 카드가 그걸 쓴다.
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ensureAnonymousAuth, getDb } from './firebase';

const cache: { v?: string | null } = {};

/** 등록된 소식 배너(데이터 URL) — 없으면 null */
export function useNewsBanner(): string | null {
  const [v, setV] = useState<string | null>(cache.v ?? null);
  useEffect(() => {
    let on = true;
    (async () => {
      if (cache.v !== undefined) {
        if (on) setV(cache.v);
        return;
      }
      try {
        const db = getDb();
        if (!db) {
          cache.v = null;
          return;
        }
        await ensureAnonymousAuth();
        const snap = await getDoc(doc(db, 'newsBanner', 'current'));
        cache.v = snap.exists() ? String(snap.get('image') ?? '') || null : null;
        if (on) setV(cache.v);
      } catch {
        cache.v = null;
      }
    })();
    return () => {
      on = false;
    };
  }, []);
  return v;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
    el.src = src;
  });
}

/** 관리자 화면에서 사용 — 배너 그림을 줄여 저장한다 (웹 전용) */
export async function saveNewsBanner(file: File): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  const objUrl = URL.createObjectURL(file);
  const img = await loadImage(objUrl);
  const W = 900;
  const H = Math.max(1, Math.round((img.height / img.width) * W));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지 변환을 지원하지 않는 브라우저입니다.');
  ctx.drawImage(img, 0, 0, W, H);
  let dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  if (dataUrl.length > 500_000) dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL('image/jpeg', 0.5);
  await setDoc(doc(db, 'newsBanner', 'current'), {
    image: dataUrl,
    updatedAt: new Date().toISOString(),
  });
  cache.v = dataUrl;
  URL.revokeObjectURL(objUrl);
}

export async function clearNewsBanner(): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  await deleteDoc(doc(db, 'newsBanner', 'current')).catch(() => {});
  cache.v = null;
}
