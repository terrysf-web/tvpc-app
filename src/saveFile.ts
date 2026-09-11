/**
 * 녹음 파일을 기기에 저장하기.
 *
 * 아이폰 사파리는 <a download>를 무시하고 파일을 그냥 열어 버린다(실제로
 * "저장"을 눌렀더니 재생만 됐다). 아이폰에서 파일을 저장하는 길은 공유
 * 시트뿐이라, 그게 되는 기기에서는 공유 시트를 띄워 "파일에 저장"을 고르게
 * 하고, 안 되는 기기(안드로이드·컴퓨터)에서는 예전처럼 바로 내려받는다.
 */

/** 파일 형식에 맞는 확장자 — 사파리 녹음은 m4a, 크롬 녹음은 webm이다 */
export function extForType(type: string): string {
  if (/mp4|m4a|aac/i.test(type)) return 'm4a';
  if (/mpeg|mp3/i.test(type)) return 'mp3';
  if (/ogg/i.test(type)) return 'ogg';
  return 'webm';
}

/** 공유 시트로 저장 → 안 되면 바로 내려받기 → 그것도 안 되면 열기 */
export async function saveBlobToDevice(blob: Blob, filename: string): Promise<void> {
  if (typeof document === 'undefined') return;

  // 1) 아이폰 등 — 공유 시트에서 "파일에 저장"
  try {
    const nav = navigator as Navigator & {
      canShare?: (d: { files?: File[] }) => boolean;
      share?: (d: { files?: File[]; title?: string }) => Promise<void>;
    };
    const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' });
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: filename });
      return;
    }
  } catch (e) {
    // 사용자가 공유 시트를 닫은 것뿐이면 그대로 끝낸다 — 다시 내려받으면
    // 취소했는데 파일이 생기는 꼴이 된다.
    if ((e as Error)?.name === 'AbortError') return;
  }

  // 2) 안드로이드·컴퓨터 — 바로 내려받기
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
