/**
 * 화면을 옮기지 않고 그 자리에서 소리를 트는 작은 재생기.
 *
 * 홈 말씀 카드의 "설교 듣기"에 쓴다. 예전에는 눌렀을 때 말씀 화면으로
 * 넘어가서 "말씀 보기"와 가는 곳이 같아 보였다 — 두 단추가 각자 할 일을
 * 하도록, 설교는 홈 카드에서 바로 들리게 한다.
 *
 * 웹에서만 동작한다(HTMLAudioElement). 폰 앱이나 유튜브 주소는 부르는 쪽에서
 * 예전처럼 밖으로 열어 준다.
 */
import { useEffect, useRef, useState } from 'react';

/** 초 → "12:34" (길이를 아직 모르면 --:--) */
export function mmss(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface InlineAudio {
  /** 한 번이라도 튼 뒤인지 — 진행 막대를 보여줄지 판단할 때 */
  active: boolean;
  playing: boolean;
  at: number;
  total: number;
  toggle: () => void;
}

export function useInlineAudio(url: string | null | undefined): InlineAudio {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(NaN);

  // 주소가 바뀌거나 화면을 떠나면 소리를 멈춘다 — 보이지 않는 곳에서
  // 설교가 계속 흐르는 일이 없도록.
  useEffect(() => {
    return () => {
      ref.current?.pause();
      ref.current = null;
    };
  }, [url]);

  const toggle = () => {
    if (!url || typeof Audio === 'undefined') return;
    let a = ref.current;
    if (!a) {
      a = new Audio(url);
      a.addEventListener('timeupdate', () => setAt(a!.currentTime));
      a.addEventListener('loadedmetadata', () => setTotal(a!.duration));
      a.addEventListener('ended', () => setPlaying(false));
      ref.current = a;
      setActive(true);
    }
    if (a.paused) {
      a.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  return { active, playing, at, total, toggle };
}
