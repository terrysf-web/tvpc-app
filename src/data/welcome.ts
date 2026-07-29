import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ensureAnonymousAuth, getDb } from '../firebase';

/**
 * 웰컴(교회 표어) 화면 자료 — 처음 실행과 표어가 바뀔 때 한 번 보여준다.
 *
 * 문서를 둘로 나눈다:
 *  - welcome/motto : 표어 번호·문구 (몇 글자짜리 — 평소에도 이것만 확인)
 *  - welcome/image : 배경 그림 (약 200KB — 보여줄 때만 내려받는다)
 * 그래서 매일 여는 속도에는 얹히는 비용이 없다.
 */
export interface WelcomeMotto {
  /** 이 값이 바뀌면 다시 한 번 보여준다 (예: '2026') */
  version: string;
  badge: string;
  title: string;
  subtitle: string;
  verse: string;
  reference: string;
}

const SEEN_KEY = 'tvpc.welcomeSeen';

function seenVersion(): string {
  try {
    return localStorage?.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function markWelcomeSeen(version: string) {
  try {
    localStorage?.setItem(SEEN_KEY, version);
  } catch {
    /* 무시 */
  }
}

async function fetchMottoDoc(): Promise<WelcomeMotto | null> {
  const db = getDb();
  if (!db) return null;
  await ensureAnonymousAuth();
  const snap = await getDoc(doc(db, 'welcome', 'motto'));
  if (!snap.exists()) return null;
  const m: WelcomeMotto = {
    version: String(snap.get('version') ?? ''),
    badge: String(snap.get('badge') ?? ''),
    title: String(snap.get('title') ?? ''),
    subtitle: String(snap.get('subtitle') ?? ''),
    verse: String(snap.get('verse') ?? ''),
    reference: String(snap.get('reference') ?? ''),
  };
  return m.version && m.title ? m : null;
}

export function useWelcome(): {
  show: boolean;
  motto: WelcomeMotto | null;
  image: string | null;
  dismiss: () => void;
} {
  const [motto, setMotto] = useState<WelcomeMotto | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let on = true;
    (async () => {
      try {
        if (localStorage.getItem('welcomeStub') === '1') { // STUB
          setMotto({ version: 'test', badge: '2026 교회 표어', title: '담장을 넘어', subtitle: 'Over the Wall', verse: '요셉은 무성한 가지 곧 샘 곁의 무성한 가지라\n그 가지가 담을 넘었도다', reference: '(창세기 49장 22절)' });
          setImage('/welcome-test.jpg');
          setShow(true);
          return;
        }
        const m = await fetchMottoDoc();
        if (!m || seenVersion() === m.version) return;
        const db = getDb();
        if (!db) return;
        // 아직 안 본 표어 — 그림까지 받아서 함께 보여준다
        const img = await getDoc(doc(db, 'welcome', 'image'));
        const url = img.exists() ? String(img.get('image') ?? '') : '';
        if (!on) return;
        setMotto(m);
        setImage(url || null);
        setShow(true);
      } catch {
        /* 통신 실패면 다음 실행에 다시 시도 */
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  return {
    show,
    motto,
    image,
    dismiss: () => {
      if (motto) markWelcomeSeen(motto.version);
      setShow(false);
    },
  };
}

export type CurrentMotto = Pick<WelcomeMotto, 'badge' | 'title' | 'subtitle' | 'verse' | 'reference'>;

/**
 * 스플래시에 늘 띄우는 표어 — 웰컴 화면과 달리 '본 적 있는지'와
 * 무관하게 열 때마다 가져온다. 평소에는 이것만이 표어를 보여주는 자리다.
 */
export function useCurrentMotto(): CurrentMotto | null {
  const [motto, setMotto] = useState<CurrentMotto | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let on = true;
    (async () => {
      try {
        if (localStorage.getItem('welcomeStub') === '1') { // STUB
          setMotto({
            badge: '2026 교회 표어',
            title: '담장을 넘어',
            subtitle: 'Over the Wall',
            verse: '요셉은 무성한 가지 곧 샘 곁의 무성한 가지라\n그 가지가 담을 넘었도다',
            reference: '(창세기 49장 22절)',
          });
          return;
        }
        const m = await fetchMottoDoc();
        if (on && m) {
          setMotto({
            badge: m.badge,
            title: m.title,
            subtitle: m.subtitle,
            verse: m.verse,
            reference: m.reference,
          });
        }
      } catch {
        /* 무시 — 배지 없이 로고만 보여준다 */
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  return motto;
}
