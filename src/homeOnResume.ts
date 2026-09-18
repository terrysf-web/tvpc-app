/**
 * 한참 만에 앱으로 돌아오면 홈으로.
 *
 * 앱은 다른 앱으로 넘어갔다 와도 보던 화면 그대로 남아 있다. 방금 보던
 * 중이면 그게 편하지만, 한참 뒤에 다시 열었을 때도 어제 보던 깊숙한
 * 화면에 그대로 있으면 뒤로 여러 번 눌러야 홈으로 나온다.
 *
 * 그래서 자리를 비운 시간이 길면(기본 30분) 돌아올 때 홈으로 보낸다.
 * 짧게 다녀오면(전화 확인, 주소 복사 등) 보던 자리를 그대로 지킨다.
 *
 * 건드리면 안 되는 화면은 그대로 둔다 — 사역자 화면(설교 녹음이 돌고 있을
 * 수 있다)과 영상 보는 화면, 그리고 이미 홈인 경우. 설교를 듣고 있는
 * 중에도 그대로 둔다 — 화면을 옮기면 소리가 끊긴다.
 */
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { isAudioPlaying } from './inlineAudio';

/** 이만큼 넘게 자리를 비웠다 돌아오면 홈으로 */
const AWAY_MS = 30 * 60 * 1000;

/** 돌아와도 홈으로 보내지 않는 화면 */
function keepsPlace(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/watch') ||
    pathname.startsWith('/browser')
  );
}

export function useHomeOnLongResume() {
  const router = useRouter();
  const pathname = usePathname();
  // 화면이 바뀔 때마다 새 값이 필요하지만, 이벤트는 한 번만 걸고 싶다
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const hiddenAt = useRef(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = 0;
      if (away > AWAY_MS && !keepsPlace(pathRef.current) && !isAudioPlaying())
        router.replace('/');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [router]);
}
