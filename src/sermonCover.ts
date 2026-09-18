/**
 * 유튜브에 올릴 영상의 첫 화면(표지) 만들기.
 *
 * 녹음을 올릴 때 앱에서 그림 한 장을 같이 만들어 올린다 — 본문·날짜·교회
 * 이름과 로고가 들어간 1280×720 그림이다. 서버는 이 그림에 소리를 입혀
 * 영상으로 만든다.
 *
 * 왜 앱에서 만드나 — 글씨를 서버에서 넣으려면 한글 글꼴을 서버에 따로
 * 넣어야 하는데, 앱(브라우저)에는 이미 교회 앱이 쓰는 글꼴이 올라와 있다.
 * 여기서 그리면 화면에서 보시는 글씨 그대로 나온다.
 *
 * 만들지 못하는 기기(캔버스를 못 쓰는 경우)에서는 그냥 null을 돌려준다 —
 * 서버가 준비된 기본 그림으로 대신 만든다.
 */

const W = 1280;
const H = 720;

/** "2026-09-18" → "2026년 9월 18일 (금)" */
function dateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/** 그림 한 장 불러오기 — 없으면 null */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 글자가 칸을 넘으면 줄을 나눈다 — 한글은 띄어쓰기 자리에서만 나눈다 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export async function makeSermonCover(opts: {
  date: string;
  /** 예: "예레미야 6장" */
  reference: string;
  /** 예: "새벽예배" */
  service: string;
  churchName: string;
}): Promise<Blob | null> {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 앱 글꼴이 다 올라온 뒤에 그려야 글씨가 기본 글꼴로 나오지 않는다
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;

    // 바탕 — 교회 앱의 새벽 배경. 못 불러오면 짙은 남색으로 채운다.
    const bg = await loadImage('/verse-bg-dawn.jpg');
    if (bg) {
      const scale = Math.max(W / bg.width, H / bg.height);
      const w = bg.width * scale;
      const h = bg.height * scale;
      ctx.drawImage(bg, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#12325B';
      ctx.fillRect(0, 0, W, H);
    }
    // 글씨가 또렷하게 보이도록 어둡게 한 겹 덮는다
    ctx.fillStyle = 'rgba(8,22,44,0.55)';
    ctx.fillRect(0, 0, W, H);

    // 교회 로고 — 왼쪽 위
    const logo = await loadImage('/icon-512.png');
    if (logo) ctx.drawImage(logo, 64, 56, 84, 84);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '500 30px Pretendard, sans-serif';
    ctx.fillText(opts.churchName, logo ? 168 : 64, 110);

    // 본문 — 가운데 크게
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 82px Pretendard, sans-serif';
    const lines = wrap(ctx, opts.reference, W - 200);
    let y = H / 2 - (lines.length - 1) * 50 + 10;
    for (const line of lines) {
      const tw = ctx.measureText(line).width;
      ctx.fillText(line, (W - tw) / 2, y);
      y += 100;
    }

    // 예배·날짜 — 본문 아래
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = '500 36px Pretendard, sans-serif';
    const sub = `${opts.service} · ${dateLabel(opts.date)}`;
    const sw = ctx.measureText(sub).width;
    ctx.fillText(sub, (W - sw) / 2, y + 18);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
    );
  } catch {
    return null;
  }
}
