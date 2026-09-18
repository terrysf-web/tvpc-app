/**
 * 새 배포가 나오면 앱이 스스로 최신으로 맞춘다.
 *
 * 홈 화면에 설치한 앱은 한 번 켜 두면 화면이 계속 살아 있어서, 새 판을
 * 올려도 그 사람 폰에서는 며칠씩 예전 판이 돌아간다(실제로 옛 화면을
 * 보고 계신 분이 있었다). 브라우저가 알아서 새로 받아 오지 않는다 —
 * 페이지를 새로 여는 순간에만 받아 오기 때문이다.
 *
 * 그래서 배포할 때마다 달라지는 표시(/version.json)를 두고, 앱이 그것을
 * 가끔 확인한다. 처음 볼 때 값을 기억해 두고, 나중에 값이 달라져 있으면
 * 새 판이 올라온 것이다.
 *
 * 언제 새로고침하나 —
 *  · 다른 앱 쓰다 돌아왔을 때: 그 자리에서 바로 새로고침한다(보던 것이
 *    없으니 끊길 것이 없다).
 *  · 앱을 계속 보고 계실 때: 읽던 화면이 갑자기 사라지면 안 되므로,
 *    다음에 잠깐 자리를 비웠다 돌아올 때 맞춘다.
 *
 * 글을 쓰던 중이거나 설교를 듣고 있으면 새로고침하지 않는다 — 쓰던 글이
 * 날아가거나 듣던 설교가 끊기면 안 된다.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { isAudioPlaying } from './inlineAudio';

const VERSION_URL = '/version.json';
/** 확인 간격 — 앱을 켜 두고 있어도 이만큼마다 한 번씩 본다 */
const CHECK_EVERY_MS = 30 * 60 * 1000;

async function fetchBuild(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: string };
    return body?.build ?? null;
  } catch {
    return null;
  }
}

/** 글을 쓰는 중인가 — 쓰던 글이 날아가지 않게 */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable === true;
}

export function useAutoRefreshOnNewBuild() {
  const first = useRef<string | null>(null);
  const checkedAt = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let on = true;

    const check = async (canReload: boolean) => {
      if (!on) return;
      if (Date.now() - checkedAt.current < 60_000) return;
      checkedAt.current = Date.now();
      const build = await fetchBuild();
      if (!on || !build) return;
      if (first.current == null) {
        first.current = build;
        return;
      }
      if (build !== first.current && canReload && !isTyping() && !isAudioPlaying())
        window.location.reload();
    };

    void check(false);
    const timer = setInterval(() => void check(false), CHECK_EVERY_MS);

    // 다른 앱 쓰다 돌아왔을 때 — 이때 맞추면 보던 것이 끊기지 않는다
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      on = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
