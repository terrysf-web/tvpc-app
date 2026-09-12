/**
 * 녹음 파일을 MP3로 바꾸기.
 *
 * 크롬·안드로이드 브라우저는 녹음을 webm(opus)으로 담는데, 이 파일은 받아
 * 놓아도 윈도우 미디어 플레이어·아이폰·대부분의 편집 프로그램에서 열리지
 * 않는다("다운로드했는데 플레이가 안 돼"). 그래서 기기에 저장할 때 어디서나
 * 열리는 MP3로 바꿔서 준다.
 *
 * 브라우저 안에서만 처리한다 — 서버로 올렸다 받지 않으므로 설교가 밖으로
 * 나가지 않고, 인터넷이 느려도 기다릴 일이 없다.
 */
import { Mp3Encoder } from '@breezystack/lamejs';

/** 말소리용 — 32kHz 모노 64kbps면 30분 설교가 대략 14MB다 */
const RATE = 32000;
const KBPS = 64;
/** MP3는 1152개 표본을 한 덩이로 담는다 */
const FRAME = 1152;

/** 이미 어디서나 열리는 형식인가 — 이런 파일은 손대지 않는다 */
export function playsEverywhere(type: string): boolean {
  return /mpeg|mp3|mp4|m4a|aac|wav/i.test(type);
}

/**
 * 오디오 덩어리(Blob)를 MP3로. 바꾸지 못하면 원본을 그대로 돌려준다 —
 * 저장이 아예 안 되는 것보다 낫다.
 */
export async function toMp3(blob: Blob): Promise<Blob> {
  if (playsEverywhere(blob.type)) return blob;
  try {
    const raw = await blob.arrayBuffer();

    // 녹음을 말소리에 맞는 32kHz 한 줄(모노)로 풀어 놓는다. 이 자리에서
    // 표본 수를 줄여 두면 뒤 단계가 가볍다.
    const Ctx =
      (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
        .OfflineAudioContext ??
      (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!Ctx) return blob;
    const decoded = await new Ctx(1, 1, RATE).decodeAudioData(raw);

    // 두 줄(스테레오)로 담겼으면 하나로 합친다
    const ch = decoded.numberOfChannels;
    const left = decoded.getChannelData(0);
    const right = ch > 1 ? decoded.getChannelData(1) : null;

    const encoder = new Mp3Encoder(1, decoded.sampleRate, KBPS);
    const parts: Uint8Array[] = [];
    const block = new Int16Array(FRAME);

    for (let i = 0; i < left.length; i += FRAME) {
      const n = Math.min(FRAME, left.length - i);
      for (let j = 0; j < n; j++) {
        const v = right ? (left[i + j] + right[i + j]) / 2 : left[i + j];
        // -1~1 실수를 16비트 정수로 (범위를 넘으면 잘라 낸다)
        block[j] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      }
      const part = encoder.encodeBuffer(block.subarray(0, n));
      if (part.length) parts.push(new Uint8Array(part));

      // 긴 설교는 오래 걸린다 — 중간중간 화면에 숨 쉴 틈을 준다
      // (안 그러면 바꾸는 동안 앱이 멈춘 것처럼 보인다)
      if ((i / FRAME) % 400 === 399) await new Promise((r) => setTimeout(r));
    }
    const tail = encoder.flush();
    if (tail.length) parts.push(new Uint8Array(tail));

    return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
  } catch {
    // 형식을 못 풀거나 기기 메모리가 모자랄 때 — 원본이라도 저장되게 둔다
    return blob;
  }
}
