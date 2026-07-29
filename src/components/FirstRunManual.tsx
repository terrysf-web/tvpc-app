import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { isStandalone } from '../installPrompt';

/**
 * 홈 화면에 추가한 뒤 처음 여는 그 한 번만 「앱 사용 안내서」를 보여준다.
 *
 * 아직 설치 전(브라우저로 보는 중)에는 '홈 화면에 추가' 안내가 저절로 뜨므로,
 * 여기서 안내서까지 열면 두 가지가 겹친다. 그래서 설치한 앱에서만 연다.
 * 그 뒤로는 홈 오른쪽 위 물음표나 더보기 메뉴에서 언제든 볼 수 있다.
 */
const KEY = 'tvpc.manualShown';

function alreadyShown(): boolean {
  try {
    return localStorage?.getItem(KEY) === '1';
  } catch {
    return true; // 저장을 못 하면 되풀이해 열지 않는다
  }
}

function markShown() {
  try {
    localStorage?.setItem(KEY, '1');
  } catch {
    /* 무시 */
  }
}

export function FirstRunManual() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!isStandalone() || alreadyShown() || pathname === '/help') return;
    // 앱 화면이 먼저 그려지고 나서 열어야 덜 갑작스럽다
    const id = setTimeout(() => {
      markShown();
      router.push('/help');
    }, 900);
    return () => clearTimeout(id);
    // 처음 한 번만 — 화면을 옮길 때마다 다시 열리면 안 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
