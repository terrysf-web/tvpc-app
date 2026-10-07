/**
 * 설교 녹음의 소리 결을 재어 본다(읽기 전용).
 *
 * "웅웅거린다"는 느낌은 대개 낮은 음(100~300Hz)이 말소리 대역(1~4kHz)보다
 * 지나치게 센 데서 온다. 귀로 짐작하지 않고 대역별 세기를 재어 숫자로 본다.
 *
 * TRY=1로 돌리면 손볼 값(아래 TONE_FIX)을 실제로 입혀 보고, 손보기 전과
 * 뒤를 나란히 재어 준다 — 귀에 기대지 않고 숫자로 확인한 뒤 적용한다.
 *
 * 실행: GitHub Actions → "Check sermon tone (one-off)"
 *   COUNT=최근 몇 개를 볼지(기본 3), TRY=1이면 손본 뒤도 함께 잰다
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const bucketName = `${sa.project_id}.firebasestorage.app`;
initializeApp({ credential: cert(sa), storageBucket: bucketName });
const bucket = getStorage().bucket();
const COUNT = Number(process.env.COUNT || 3);
const TRY = process.env.TRY === '1';

/**
 * 말소리를 또렷하게 하는 손질.
 *
 *  · highpass 80  — 바닥에 깔리는 울림(발소리·에어컨)을 걷어낸다
 *  · 230Hz −3.5dB — 웅웅거리는 대역을 살짝 덜어낸다
 *  · 2.8kHz +3.5dB — 말이 또렷하게 들리는 대역을 올린다
 *  · loudnorm     — 그러고 나서 전체 크기를 방송 기준(-16)으로 맞춘다
 */
const TONE_FIX =
  'highpass=f=80,' +
  'equalizer=f=230:t=q:w=1.0:g=-3.5,' +
  'equalizer=f=2800:t=q:w=1.0:g=3.5,' +
  'loudnorm=I=-16:TP=-1.5:LRA=11';

/** 한 대역의 평균 세기(dB) — 숫자가 클수록(0에 가까울수록) 세다 */
function bandDb(file, lo, hi) {
  const chain = [];
  if (lo > 0) chain.push(`highpass=f=${lo}`, `highpass=f=${lo}`);
  if (hi > 0) chain.push(`lowpass=f=${hi}`, `lowpass=f=${hi}`);
  chain.push('volumedetect');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', chain.join(','), '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const m = (r.stderr ?? '').match(/mean_volume:\s*(-?[\d.]+) dB/);
  return m ? Number(m[1]) : NaN;
}

const tmp = mkdtempSync(join(tmpdir(), 'tone-'));
const [files] = await bucket.getFiles({ prefix: 'sermonAudio/' });
const recent = files
  .filter((f) => /\.(m4a|mp3|mp4|webm)$/i.test(f.name))
  .sort((a, b) => (a.name < b.name ? 1 : -1))
  .slice(0, COUNT);

console.log(`설교 녹음 ${recent.length}개의 소리 결을 재어 봅니다.\n`);
for (const file of recent) {
  const src = join(tmp, `in${file.name.match(/\.\w+$/)?.[0] ?? '.m4a'}`);
  await file.download({ destination: src });
  const bands = [
    ['아주 낮은 음 (~100Hz)', 0, 100],
    ['웅웅대는 음 (100~300Hz)', 100, 300],
    ['목소리 바탕 (300~1k)', 300, 1000],
    ['말소리 또렷함 (1k~4k)', 1000, 4000],
    ['치찰음·공기감 (4k~)', 4000, 0],
  ];
  console.log(`· ${file.name}`);
  const vals = bands.map(([, lo, hi]) => bandDb(src, lo, hi));
  let after = null;
  if (TRY) {
    const out = join(tmp, 'try.m4a');
    spawnSync('ffmpeg', ['-y', '-i', src, '-vn', '-ac', '1', '-af', TONE_FIX, '-ar', '48000', '-c:a', 'aac', '-b:a', '128k', out], { encoding: 'utf8' });
    after = bands.map(([, lo, hi]) => bandDb(out, lo, hi));
  }
  bands.forEach(([label], i) => {
    const v = vals[i];
    const a = after?.[i];
    console.log(
      `    ${label.padEnd(24)} ${Number.isFinite(v) ? v.toFixed(1) : '?'} dB` +
        (after ? `  →  ${Number.isFinite(a) ? a.toFixed(1) : '?'} dB` : ''),
    );
  });
  // 또렷함의 잣대 — 웅웅대는 음이 말소리 대역보다 얼마나 센가
  const gap = (v) => (Number.isFinite(v?.[1]) && Number.isFinite(v?.[3]) ? v[1] - v[3] : NaN);
  const judge = (d) => (d > 12 ? '너무 셈 — 웅웅거립니다' : d > 6 ? '조금 센 편' : '괜찮음');
  const d0 = gap(vals);
  if (Number.isFinite(d0)) {
    console.log(`    → 손보기 전: 웅웅대는 음이 말소리보다 ${d0.toFixed(1)}dB 셈 (${judge(d0)})`);
  }
  if (after) {
    const d1 = gap(after);
    if (Number.isFinite(d1)) {
      console.log(`    → 손본  뒤: 웅웅대는 음이 말소리보다 ${d1.toFixed(1)}dB 셈 (${judge(d1)})`);
    }
  }
  console.log('');
}
