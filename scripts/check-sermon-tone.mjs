/**
 * 설교 녹음의 소리 결을 재어 본다(읽기 전용).
 *
 * "웅웅거린다"는 느낌은 대개 낮은 음(100~300Hz)이 말소리 대역(1~4kHz)보다
 * 지나치게 센 데서 온다. 귀로 짐작하지 않고 대역별 세기를 재어 숫자로 본다.
 *
 * 실행: GitHub Actions → "Check sermon tone (one-off)"
 *   COUNT=최근 몇 개를 볼지(기본 3)
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
  bands.forEach(([label], i) => {
    const v = vals[i];
    console.log(`    ${label.padEnd(24)} ${Number.isFinite(v) ? v.toFixed(1) : '?'} dB`);
  });
  // 또렷함의 잣대 — 웅웅대는 음이 말소리 대역보다 얼마나 센가
  const mud = vals[1];
  const speech = vals[3];
  if (Number.isFinite(mud) && Number.isFinite(speech)) {
    const d = mud - speech;
    console.log(
      `    → 웅웅대는 음이 말소리보다 ${d.toFixed(1)}dB ${d > 0 ? '셈' : '약함'}` +
        ` (${d > 12 ? '너무 셈 — 웅웅거립니다' : d > 6 ? '조금 센 편' : '괜찮음'})`,
    );
  }
  console.log('');
}
