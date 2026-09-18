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

/** 모서리가 둥근 칸 하나 그리기 (예배 이름표) */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

export async function makeSermonCover(opts: {
  date: string;
  /** 가운데 큰 글씨 — 보통 본문(예: "예레미야 6장") */
  title: string;
  /** 그 아래 한 줄 — 보통 예배 이름(예: "새벽예배") */
  subtitle: string;
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

    // 위아래로 짙어지는 그늘 — 가운데 글씨는 또렷하고 사진 느낌은 살린다
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(6,18,38,0.72)');
    shade.addColorStop(0.45, 'rgba(6,18,38,0.5)');
    shade.addColorStop(1, 'rgba(6,18,38,0.8)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    // 교회 로고와 이름 — 왼쪽 위
    const logo = await loadImage('/icon-512.png');
    if (logo) ctx.drawImage(logo, 64, 52, 72, 72);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = '600 27px Pretendard, sans-serif';
    ctx.fillText(opts.churchName, logo ? 152 : 64, 98);

    // 날짜 — 오른쪽 위
    ctx.font = '500 24px Pretendard, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    const dl = dateLabel(opts.date);
    ctx.fillText(dl, W - 64 - ctx.measureText(dl).width, 98);

    // 가운데 — 예배 이름표, 본문, 밑줄
    const chip = opts.subtitle.trim();
    let y = H / 2 - 92;
    if (chip) {
      ctx.font = '600 25px Pretendard, sans-serif';
      const cw = ctx.measureText(chip).width + 44;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      roundRect(ctx, (W - cw) / 2, y - 30, cw, 46, 23);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(chip, (W - cw) / 2 + 22, y + 2);
      y += 74;
    } else {
      y += 30;
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 88px Pretendard, sans-serif';
    const lines = wrap(ctx, opts.title, W - 220);
    // 줄이 늘면 전체가 가운데에 오도록 시작 높이를 올린다
    y -= (lines.length - 1) * 52;
    for (const line of lines) {
      ctx.fillText(line, (W - ctx.measureText(line).width) / 2, y + 66);
      y += 104;
    }

    // 짧은 밑줄 하나 — 제목 아래 균형을 잡아 준다
    const bar = ctx.createLinearGradient(W / 2 - 70, 0, W / 2 + 70, 0);
    bar.addColorStop(0, 'rgba(255,255,255,0.15)');
    bar.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    bar.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = bar;
    ctx.fillRect(W / 2 - 70, y + 24, 140, 3);

    // 맨 아래 — 교회 주소
    ctx.font = '500 22px Pretendard, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const foot = 'tvpc.church';
    ctx.fillText(foot, (W - ctx.measureText(foot).width) / 2, H - 56);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
    );
  } catch {
    return null;
  }
}
