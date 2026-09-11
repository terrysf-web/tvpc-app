/**
 * 녹음 파일을 기기에 저장하기.
 *
 * 아이폰 사파리는 <a download>를 무시하고 파일을 그냥 열어 버린다(실제로
 * "저장"을 눌렀더니 재생만 됐다). 아이폰에서 파일을 저장하는 길은 공유
 * 시트뿐이다.
 *
 * 기기마다 "한 가지 방법만" 쓴다 — 처음엔 공유 시트를 띄워 보고 실패하면
 * 내려받기로 넘어가게 했는데, 그 바람에 파일이 두 개 저장되는 일이 있었다
 * (공유 시트로 한 번, 그 뒤 내려받기로 또 한 번).
 */

/** 아이폰·아이패드 — 저장 수단이 공유 시트뿐이다 */
function isApplePhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // 아이패드OS는 UA에 Mac으로 나오므로 터치 지원 여부까지 본다
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** 파일 형식에 맞는 확장자 — 사파리 녹음은 m4a, 크롬 녹음은 webm이다 */
export function extForType(type: string): string {
  if (/mp4|m4a|aac/i.test(type)) return 'm4a';
  if (/mpeg|mp3/i.test(type)) return 'mp3';
  if (/ogg/i.test(type)) return 'ogg';
  return 'webm';
}

/**
 * 기기에 저장. 저장이 시작됐으면 true, 사용자가 취소했으면 false.
 * 어느 쪽이든 파일은 한 번만 만들어진다.
 */
export async function saveBlobToDevice(blob: Blob, filename: string): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' });
  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean;
    share?: (d: { files?: File[]; title?: string }) => Promise<void>;
  };

  // 아이폰·아이패드 — 공유 시트만 쓴다. 내려받기로 넘어가면 파일이 열리기만
  // 하거나(재생) 두 번 저장되므로, 실패해도 다른 방법을 덧대지 않는다.
  if (isApplePhone()) {
    if (!nav.canShare?.({ files: [file] }) || !nav.share) {
      throw new Error('이 기기에서는 저장을 지원하지 않습니다. 사파리에서 열어 주세요.');
    }
    try {
      await nav.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return false;
      throw new Error('저장을 시작하지 못했습니다. 다시 눌러 주세요.');
    }
  }

  // 안드로이드·컴퓨터 — 내려받기만 쓴다
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
