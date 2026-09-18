/**
 * 화면을 옮기지 않고 그 자리에서 소리를 트는 작은 재생기.
 *
 * 홈 말씀 카드의 "설교 듣기"에 쓴다. 예전에는 눌렀을 때 말씀 화면으로
 * 넘어가서 "말씀 보기"와 가는 곳이 같아 보였다 — 두 단추가 각자 할 일을
 * 하도록, 설교는 홈 카드에서 바로 들리게 한다.
 *
 * 한 번에 켜지게 —
 * 예전에는 단추를 누르는 그 순간에야 재생기를 만들었다. 만들자마자 트니
 * 아직 아무것도 받아 놓은 게 없어서 소리가 늦게 나오고, 그동안 화면은
 * 가만히 있으니 한 번 더 누르게 된다. 그런데 두 번째 누름은 (브라우저가
 * 이미 "트는 중"으로 보므로) 멈춤이 되어, 세 번을 눌러야 들렸다.
 * 이제는 카드가 뜰 때 미리 만들어 받아 두고, 누르면 바로 표시가 바뀐다.
 *
 * 화면이 꺼져도 계속 —
 * 폰 잠금 화면에 제목과 재생 단추가 뜨도록 알려 준다(MediaSession).
 * 이렇게 해 두면 화면을 꺼도 설교가 끊기지 않고, 잠금 화면에서 멈추고
 * 다시 틀 수 있다. 또 소리가 나는 동안에는 앱이 스스로 새로고침하거나
 * 홈으로 돌아가지 않는다 — 그러면 듣던 설교가 끊기기 때문이다.
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

/**
 * 지금 이 앱에서 소리가 나고 있나.
 *
 * 새 판이 올라왔을 때 스스로 새로고침하는 곳(appVersion)과, 오래 자리를
 * 비웠다 돌아오면 홈으로 보내는 곳(homeOnResume)에서 확인한다. 듣고 있는
 * 중에 화면을 갈아엎으면 설교가 뚝 끊긴다.
 */
let playingCount = 0;
export function isAudioPlaying(): boolean {
  return playingCount > 0;
}

export interface InlineAudio {
  /** 한 번이라도 튼 뒤인지 — 진행 막대를 보여줄지 판단할 때 */
  active: boolean;
  playing: boolean;
  /** 눌렀는데 아직 소리가 안 나는 중(받는 중) */
  loading: boolean;
  at: number;
  total: number;
  toggle: () => void;
  /** 막대를 끌어 옮긴 자리로 이동(0~1) */
  seek: (ratio: number) => void;
}

/** 잠금 화면에 보일 제목 */
export interface InlineAudioMeta {
  title?: string;
  artist?: string;
  artwork?: string;
  /** 화면이 뜨자마자 재생 — 홈에서 "설교 듣기"로 들어온 경우 */
  autoPlay?: boolean;
}

type MediaSessionNav = Navigator & {
  mediaSession?: {
    metadata: unknown;
    playbackState?: string;
    setActionHandler: (action: string, handler: (() => void) | null) => void;
  };
};

/** 잠금 화면·이어폰 단추에 이 설교를 걸어 둔다 */
function bindMediaSession(a: HTMLAudioElement, meta: InlineAudioMeta) {
  const nav = typeof navigator === 'undefined' ? null : (navigator as MediaSessionNav);
  const ms = nav?.mediaSession;
  if (!ms) return;
  try {
    const MM = (window as unknown as { MediaMetadata?: new (init: object) => unknown })
      .MediaMetadata;
    if (MM) {
      ms.metadata = new MM({
        title: meta.title ?? '설교',
        artist: meta.artist ?? '트라이밸리장로교회',
        artwork: [{ src: meta.artwork ?? '/icon-512.png', sizes: '512x512', type: 'image/png' }],
      }) as never;
    }
    ms.setActionHandler('play', () => void a.play().catch(() => {}));
    ms.setActionHandler('pause', () => a.pause());
    ms.setActionHandler('seekbackward', () => {
      a.currentTime = Math.max(0, a.currentTime - 15);
    });
    ms.setActionHandler('seekforward', () => {
      a.currentTime = Math.min(a.duration || 0, a.currentTime + 15);
    });
  } catch {
    // 잠금 화면 표시는 못 해도 재생 자체는 그대로 된다
  }
}

export function useInlineAudio(
  url: string | null | undefined,
  meta: InlineAudioMeta = {},
): InlineAudio {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(NaN);
  // 제목이 매번 새 값으로 와도 재생기를 다시 만들지 않게
  const metaRef = useRef(meta);
  metaRef.current = meta;

  // 카드가 뜨는 순간 미리 만들어 둔다 — 단추를 누르면 곧바로 소리가 나게.
  // 주소가 바뀌거나 화면을 떠나면 멈춘다(보이지 않는 곳에서 설교가 계속
  // 흐르는 일이 없도록).
  useEffect(() => {
    if (!url || typeof Audio === 'undefined') return;
    const a = new Audio();
    // 길이만 미리 받아 둔다 — 파일 전체를 미리 받으면 듣지도 않는 분들까지
    // 20MB씩 내려받게 된다. 재생기가 이미 만들어져 있는 것만으로도 누르는
    // 즉시 켜진다.
    a.preload = 'metadata';
    a.setAttribute('playsinline', '');
    a.src = url;
    ref.current = a;
    setActive(false);
    setPlaying(false);
    setLoading(false);
    setAt(0);
    setTotal(NaN);

    // 상태는 재생기가 알려 주는 대로 따른다 — 눌렀을 때와 실제로 소리가
    // 나는 때가 다를 수 있으므로 우리가 짐작하지 않는다
    const onPlay = () => {
      setActive(true);
      setPlaying(true);
    };
    const onPlaying = () => {
      setPlaying(true);
      setLoading(false);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    // 받아 둔 게 생겼다 — "켜는 중" 표시는 내린다(재생 여부와는 별개)
    const onReady = () => setLoading(false);
    const onTime = () => setAt(a.currentTime);
    const onMeta = () => setTotal(a.duration);
    const onEnded = () => {
      // 끝까지 들은 뒤 다시 누르면 처음부터 나오게 되감아 둔다
      a.currentTime = 0;
      setAt(0);
      setPlaying(false);
      setLoading(false);
    };
    a.addEventListener('play', onPlay);
    a.addEventListener('playing', onPlaying);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('canplay', onReady);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnded);
    a.load();

    // 홈에서 "설교 듣기"를 누르고 들어온 경우. 브라우저가 자동 재생을 막으면
    // (아이폰 사파리 등) 조용히 멈춰 있고, 재생 단추를 누르면 된다.
    if (metaRef.current.autoPlay) {
      bindMediaSession(a, metaRef.current);
      a.play().catch(() => {});
    }

    return () => {
      a.pause();
      a.removeEventListener('play', onPlay);
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('canplay', onReady);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnded);
      a.src = '';
      if (ref.current === a) ref.current = null;
    };
  }, [url]);

  // 소리가 나는 동안에는 새로고침·홈 이동을 멈춰 둔다
  useEffect(() => {
    if (!playing) return;
    playingCount += 1;
    return () => {
      playingCount = Math.max(0, playingCount - 1);
    };
  }, [playing]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      // 다 듣고 끝난 상태에서 눌렀으면 처음부터
      if (a.ended) a.currentTime = 0;
      setActive(true);
      // 아직 받는 중일 수 있으니 "켜는 중"으로 먼저 보여 준다 — 화면이
      // 가만히 있으면 한 번 더 누르게 되고, 그 누름이 멈춤이 되었다
      setLoading(true);
      bindMediaSession(a, metaRef.current);
      a.play().catch(() => {
        // 아직 아무것도 못 받은 상태였으면 한 번 더 받아서 다시 시도한다
        try {
          a.load();
        } catch {
          /* 무시 */
        }
        a.play().catch(() => {
          setLoading(false);
          setPlaying(false);
        });
      });
    } else {
      a.pause();
      setLoading(false);
    }
  };

  // 막대를 끌 때 — 아직 길이를 모르면(불러오는 중) 움직이지 않는다
  const seek = (ratio: number) => {
    const a = ref.current;
    if (!a || !Number.isFinite(a.duration)) return;
    const t = Math.min(Math.max(ratio, 0), 1) * a.duration;
    a.currentTime = t;
    setAt(t);
  };

  return { active, playing, loading, at, total, toggle, seek };
}
