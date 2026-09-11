import Pause from 'lucide-react-native/dist/esm/icons/pause.mjs';
import Play from 'lucide-react-native/dist/esm/icons/play.mjs';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { playSermonAudio } from '../links';
import { colors, font, radius } from '../theme';

/** 초 → "12:34" (길이를 아직 모르면 --:--) */
function mmss(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 유튜브 주소면 영상 ID, 아니면 null */
function youtubeId(url: string): string | null {
  return url.match(/(?:youtu\.be\/|[?&]v=|youtube\.com\/(?:embed|live)\/)([\w-]{11})/)?.[1] ?? null;
}

/**
 * 그날 설교를 화면을 벗어나지 않고 듣는 재생기.
 *
 * 예전에는 눌렀을 때 브라우저 새 탭으로 열려서, 듣는 동안 그날 본문·묵상을
 * 볼 수 없었다 — 말씀을 읽으며 설교를 듣는 게 자연스러운 순서라 같은
 * 화면에서 재생되게 했다.
 *
 * 유튜브 주소로 등록된 설교는 예전처럼 앱 안 영상 재생기로 넘긴다(오디오
 * 재생기로는 유튜브를 틀 수 없다). 폰 앱(네이티브)에서도 브라우저로 넘긴다 —
 * 이 재생기는 웹 오디오라 웹에서만 동작한다.
 */
export function SermonAudioPlayer({
  url,
  title,
  autoPlay = false,
}: {
  url: string;
  title: string;
  /** 홈 카드에서 "설교 듣기"로 들어온 경우 — 화면이 뜨자마자 재생한다 */
  autoPlay?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(NaN);
  const [trackW, setTrackW] = useState(0);

  const yt = youtubeId(url);
  const inline = !yt && Platform.OS === 'web';

  useEffect(() => {
    if (!inline) return;
    const a = new Audio(url);
    audioRef.current = a;
    const onTime = () => setAt(a.currentTime);
    const onMeta = () => setTotal(a.duration);
    const onEnd = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    // 홈에서 "설교 듣기"를 누르고 들어온 경우. 브라우저가 자동 재생을 막으면
    // (아이폰 사파리 등) 조용히 멈춰 있고, 아래 재생 단추를 누르면 된다.
    if (autoPlay) {
      a.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
    return () => {
      a.pause();
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
      audioRef.current = null;
    };
  }, [url, inline, autoPlay]);

  // 유튜브·네이티브 — 예전처럼 눌러서 밖에서 연다
  if (!inline) {
    return (
      <Pressable style={styles.openBtn} onPress={() => playSermonAudio(url, title)}>
        <Text style={styles.openBtnText}>▶ 이 날 설교 듣기</Text>
      </Pressable>
    );
  }

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  };

  // 막대를 누른 자리로 이동 — 긴 설교에서 듣던 데를 다시 찾기 쉽게
  const seekTo = (x: number) => {
    const a = audioRef.current;
    if (!a || !trackW || !Number.isFinite(total)) return;
    const ratio = Math.min(Math.max(x / trackW, 0), 1);
    a.currentTime = ratio * total;
    setAt(a.currentTime);
  };

  const pct = Number.isFinite(total) && total > 0 ? Math.min(at / total, 1) * 100 : 0;

  return (
    <View style={styles.box}>
      <Pressable style={styles.playBtn} onPress={toggle} hitSlop={6}>
        {playing ? (
          <Pause size={18} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
        ) : (
          <Play size={18} color="#FFFFFF" fill="#FFFFFF" strokeWidth={0} />
        )}
      </Pressable>
      <View style={styles.right}>
        <Text style={styles.label}>이 날 설교 듣기</Text>
        <Pressable
          style={styles.track}
          onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
          onPress={(e) => seekTo(e.nativeEvent.locationX)}
        >
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </Pressable>
        <Text style={styles.time}>
          {mmss(at)} / {mmss(total)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: colors.tagBlueBg,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  right: { flex: 1, minWidth: 0 },
  label: { fontFamily: font.bold, fontSize: 13, color: colors.primary },
  track: {
    marginTop: 7,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(30,90,168,0.18)',
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  time: { marginTop: 5, fontFamily: font.medium, fontSize: 11.5, color: colors.muted },
  openBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    alignItems: 'center',
    paddingVertical: 13,
  },
  openBtnText: { fontFamily: font.bold, fontSize: 14.5, color: '#FFFFFF' },
});
