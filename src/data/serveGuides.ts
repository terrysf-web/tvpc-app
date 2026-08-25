/**
 * 섬김이 안내 — 더보기 > 섬김이 안내 화면에 쓰인다. 봉사 지원은 구글 폼으로
 * 받고, 역할별 실제 사용법(음향·프리젠테이션·방송 등)은 관리자 화면에서
 * 목회자·담당자가 직접 채워 넣는 안내문을 보여준다.
 *
 * 안내문은 예배 시간(content/services)과 같은 방식으로 content/serveGuides
 * 문서 하나에 { guides: { [역할 key]: 안내문 } } 형태로 저장한다 — 역할이
 * 15개뿐이라 컬렉션을 따로 만들 만큼 크지 않고, firestore.rules의
 * content/{id} 규칙(누구나 읽기, 관리자만 쓰기)을 그대로 쓸 수 있다.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ensureAnonymousAuth, getDb } from '../firebase';

export interface ServeRole {
  key: string;
  label: string;
}

// 봉사 지원 구글 폼의 분야 목록·순서를 그대로 따른다.
export const SERVE_ROLES: ServeRole[] = [
  { key: 'choir', label: '성가대' },
  { key: 'praiseVocal', label: '찬양팀 보컬' },
  { key: 'praiseInstrument', label: '찬양팀 악기' },
  { key: 'sound', label: '예배 음향 (Behringer X32)' },
  { key: 'presentation', label: '예배 프리젠테이션 자막 (ProPresenter)' },
  { key: 'broadcast', label: '예배 방송 (YouTube Live)' },
  { key: 'teacherKids', label: '주일학교 교사 (영유아부, 초등부)' },
  { key: 'teacherYouth', label: '주일학교 교사 (중고등부)' },
  { key: 'photo', label: '사진 촬영' },
  { key: 'bulletinMake', label: '주보 제작' },
  { key: 'mediaDesign', label: '미디어 디자인 (홈페이지, 주보, 포스터 이미지 제작)' },
  { key: 'lunchbox', label: '사랑의 도시락 (반찬 만들기)' },
  { key: 'facility', label: '건물 관리' },
  { key: 'newcomer', label: '새가족부' },
  { key: 'intercession', label: '중보 기도' },
];

/** 봉사 지원 구글 폼 */
export const SERVE_FORM_URL = 'https://forms.gle/eKnerRMxQwFDDoam7';

const CACHE_KEY = 'tvpc.serveGuidesCache';

type GuideMap = Record<string, string>;

function readCache(): GuideMap | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as GuideMap) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(map: GuideMap) {
  try {
    localStorage?.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* 무시 */
  }
}

export function useServeGuides(): { guides: GuideMap; ready: boolean } {
  const [state, setState] = useState<{ map: GuideMap; ready: boolean }>(() => {
    const cached = readCache();
    return cached ? { map: cached, ready: true } : { map: {}, ready: false };
  });

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const db = getDb();
        if (!db) {
          if (on) setState((s) => ({ ...s, ready: true }));
          return;
        }
        await ensureAnonymousAuth();
        const snap = await getDoc(doc(db, 'content', 'serveGuides'));
        const map = (snap.exists() ? (snap.get('guides') as GuideMap | undefined) : undefined) ?? {};
        writeCache(map);
        if (on) setState({ map, ready: true });
      } catch {
        if (on) setState((s) => ({ ...s, ready: true }));
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  return { guides: state.map, ready: state.ready };
}

/** 관리자 화면 — 한 역할의 안내문 저장(다른 역할 안내문은 그대로 둔다) */
export async function saveServeGuide(key: string, content: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('데이터베이스 연결이 없습니다.');
  await setDoc(doc(db, 'content', 'serveGuides'), { guides: { [key]: content.trim() } }, { merge: true });
}
