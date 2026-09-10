/**
 * 사역자 페이지 설교 녹음 — 웹 브라우저의 MediaRecorder로 마이크 소리를 담는다.
 *
 * 웹 전용이다. 폰 앱(네이티브)에 녹음을 넣으려면 별도 녹음 모듈을 붙이고 앱을
 * 다시 빌드해 스토어에 올려야 하는데, 사역자 페이지의 사진 올리기도 이미 웹
 * 전용이라 같은 방식을 따랐다 — 목사님이 폰 브라우저로 사역자 페이지에
 * 들어가면 그대로 녹음할 수 있다(크롬·사파리 모두 마이크 녹음을 지원한다).
 *
 * 담는 형식은 브라우저가 할 수 있는 것 중에서 고른다. 크롬은 webm(opus),
 * 사파리는 mp4(aac)만 되므로 둘 다 시도한다.
 *
 * 말소리 한 줄(모노) 64kbps로 담는다 — 30분 설교가 대략 14MB다. 처음엔
 * 통화 수준인 32kbps로 잡았는데, 무료 저장 용량이 5GB라 아낄 이유가 없고
 * 사파리가 쓰는 aac는 낮은 값에서 목소리가 뭉개진다. 마이크는 목소리
 * 크기가 들쭉날쭉해도 고르게 담기도록 자동 음량 조절을 켜 둔다(폰을
 * 강대상에 놓고 움직이며 말씀하실 때를 생각한 설정).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const CANDIDATES = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/mpeg', ext: 'mp3' },
];

function pickFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const c of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {
      /* 이 브라우저는 확인 자체를 못 함 — 다음 후보로 */
    }
  }
  // 형식을 못 고르면 브라우저 기본값에 맡긴다
  return { mime: '', ext: 'webm' };
}

export type SermonRecorder = ReturnType<typeof useSermonRecorder>;

export function useSermonRecorder() {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [ext, setExt] = useState('webm');
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // 화면 잠김 막기가 되는 기기인지 — 안 되면 "자동 잠금을 꺼 달라"고 알려야 한다
  const [keepsAwake, setKeepsAwake] = useState(true);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  // 녹음 중 화면이 꺼지지 않게 잡아 두는 잠금(Wake Lock)
  const wakeRef = useRef<{ release?: () => Promise<void> } | null>(null);
  // 사용자가 직접 멈춘 것인지 — 아니면 화면 잠김 등으로 중간에 끊긴 것이다
  const manualStopRef = useRef(false);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        typeof MediaRecorder !== 'undefined' &&
        !!navigator?.mediaDevices?.getUserMedia,
    );
  }, []);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // 화면을 떠날 때 마이크·재생·미리듣기 주소를 반드시 정리한다
  useEffect(
    () => () => {
      stopTimer();
      recRef.current?.stream?.getTracks().forEach((t) => t.stop());
      wakeRef.current?.release?.().catch(() => {});
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  /**
   * 녹음하는 동안 화면이 꺼지지 않게 붙잡는다. 화면이 잠기면 브라우저가
   * 마이크를 끊어 녹음이 중간에 멈춘다(실제로 겪었다). 크롬·안드로이드와
   * 사파리 16.4 이상에서 동작하고, 안 되는 기기에서는 keepsAwake를 false로
   * 두어 "자동 잠금을 꺼 주세요"라고 안내한다.
   */
  const acquireWakeLock = useCallback(async () => {
    const nav = navigator as unknown as {
      wakeLock?: { request: (t: 'screen') => Promise<{ release?: () => Promise<void> }> };
    };
    if (!nav.wakeLock) {
      setKeepsAwake(false);
      return;
    }
    try {
      wakeRef.current = await nav.wakeLock.request('screen');
      setKeepsAwake(true);
    } catch {
      setKeepsAwake(false);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeRef.current?.release?.().catch(() => {});
    wakeRef.current = null;
  }, []);

  // 잠금은 다른 앱으로 갔다 오면 풀린다 — 아직 녹음 중이면 다시 잡는다
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && recording && !wakeRef.current) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [recording, acquireWakeLock]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // 설교는 한 사람 목소리라 잡음·울림을 줄이면 훨씬 알아듣기 쉽다.
        // 자동 음량 조절(autoGainControl)은 마이크와 입 사이 거리가 변해도
        // 소리 크기를 고르게 맞춰 준다.
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const fmt = pickFormat();
      if (!fmt) throw new Error('이 브라우저는 녹음을 지원하지 않습니다.');
      const rec = new MediaRecorder(
        stream,
        fmt.mime ? { mimeType: fmt.mime, audioBitsPerSecond: 64000 } : undefined,
      );
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        setError('녹음이 중간에 끊겼습니다. 지금까지 녹음된 부분은 남아 있습니다.');
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        releaseWakeLock();
        const out = new Blob(chunksRef.current, { type: fmt.mime || 'audio/webm' });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(out);
        setBlob(out);
        setRecording(false);
        stopTimer();
        // 직접 멈춘 게 아니면 화면 잠김·전화 등으로 끊긴 것이다 —
        // 지금까지 녹음된 부분은 그대로 남으니 확인하고 올릴 수 있게 알린다.
        if (!manualStopRef.current) {
          setError('녹음이 중간에 멈췄습니다. 지금까지 녹음된 부분을 들어 보고 올리시거나 다시 녹음해 주세요.');
        }
      };
      setExt(fmt.ext);
      setBlob(null);
      setSeconds(0);
      manualStopRef.current = false;
      await acquireWakeLock();
      rec.start(1000);
      recRef.current = rec;
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      setError(
        /denied|NotAllowed/i.test(msg)
          ? '마이크 사용이 거부됐습니다. 브라우저 주소창의 자물쇠에서 마이크를 허용해 주세요.'
          : msg || '녹음을 시작하지 못했습니다.',
      );
      setRecording(false);
      stopTimer();
      releaseWakeLock();
    }
  }, [acquireWakeLock, releaseWakeLock]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    try {
      recRef.current?.stop();
    } catch {
      /* 이미 멈춘 경우 무시 */
    }
  }, []);

  /** 올리기 전에 한 번 들어 보기 */
  const togglePlay = useCallback(() => {
    if (!urlRef.current) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const a = audioRef.current ?? new Audio();
    audioRef.current = a;
    a.src = urlRef.current;
    a.onended = () => setPlaying(false);
    a.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [playing]);

  const reset = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setBlob(null);
    setSeconds(0);
    setError(null);
  }, []);

  return {
    supported,
    recording,
    seconds,
    blob,
    ext,
    error,
    playing,
    keepsAwake,
    start,
    stop,
    togglePlay,
    reset,
  };
}

/** 초 → "12:34" */
export function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
