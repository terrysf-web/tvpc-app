/**
 * 이미 올라간 설교 녹음의 소리를 고르게 맞추기.
 *
 * 두 가지를 손본다.
 *
 * 하나, 한 줄(모노)로 다시 담는다. 마이크는 한 줄인데 녹음으로 내보내는
 * 자리가 두 줄(스테레오)이라, 브라우저에 따라 왼쪽 칸에만 소리가 담겼다.
 * 한 줄짜리는 어느 기기든 양쪽 귀로 들린다.
 *
 * 둘, 소리 크기를 방송에서 쓰는 기준(-16 LUFS)에 맞춘다. 녹음이 작게
 * 담긴 파일은 올리고, 큰 파일은 낮춰 어느 설교를 들어도 크기가 비슷하다.
 * 단순히 볼륨만 올리는 게 아니라 전체를 재어 본 뒤 맞추므로 찌그러지지
 * 않는다.
 *
 * 손본 파일은 이름 끝에 "-lvl"을 붙여 두고 다음에 돌릴 때 건너뛴다.
 *
 * 실행: GitHub Actions → "Fix sermon audio (mono)"
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const bucketName = `${sa.project_id}.firebasestorage.app`;
initializeApp({ credential: cert(sa), storageBucket: bucketName });
const db = getFirestore();
const bucket = getStorage().bucket();
/** 살펴보기만 하고 고치지는 않기 */
const DRY = process.env.DRY_RUN === '1';

/** 칸 수 */
function channelsOf(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=channels,codec_name',
    '-of', 'default=nw=1:nk=1',
    file,
  ]).toString().trim().split('\n');
  return { codec: out[0] ?? '', channels: Number(out[1] ?? 0) };
}

/**
 * 실제로 얼마나 큰 소리인지 재기.
 *
 * 사람이 느끼는 크기는 방송 기준(LUFS)으로 잰다 — 숫자가 0에 가까울수록
 * 크다. -16이 팟캐스트·유튜브에서 쓰는 기준이고, -30쯤이면 많이 작다.
 * 가장 큰 순간(peak)도 함께 본다.
 */
function loudness(file) {
  // ffmpeg는 잰 값을 stderr로 내보낸다 — 성공해도 거기 있으므로 spawnSync로 받는다
  const r = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:print_format=json', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const err = r.stderr ?? '';
  const j = err.slice(err.lastIndexOf('{'));
  try {
    const m = JSON.parse(j);
    return `크기 ${m.input_i} LUFS (기준 -16), 가장 큰 순간 ${m.input_tp} dB`;
  } catch {
    return '(못 읽음)';
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'mono-'));
const [files] = await bucket.getFiles({ prefix: 'sermonAudio/' });
console.log(`설교 녹음 ${files.length}개 살펴보기${DRY ? ' (고치지 않음)' : ''}`);

for (const file of files) {
  if (/-lvl\.\w+$/.test(file.name) && !DRY) {
    console.log(`\n  · ${file.name}\n      이미 손본 파일입니다 — 건너뜁니다`);
    continue;
  }
  const ext = file.name.match(/\.\w+$/)?.[0] ?? '.m4a';
  const src = join(tmp, `in${ext}`);
  try {
    await file.download({ destination: src });
    const { codec, channels } = channelsOf(src);
    console.log(`\n  · ${file.name}\n      형식=${codec} 칸=${channels} ${loudness(src)}`);
    if (DRY) {
      console.log('      고칠 대상(지금은 살펴보기만)');
      continue;
    }

    // 한 줄로 합치고(한쪽이 비어 있어도 소리가 살아난다), 소리 크기를
    // 방송 기준에 맞춘다(작게 담긴 녹음은 올라가고 찌그러지지 않는다)
    const out = join(tmp, `out${ext}`);
    execFileSync(
      'ffmpeg',
      [
        '-y', '-i', src,
        '-vn',
        '-ac', '1',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar', '48000',
        '-c:a', 'aac', '-b:a', '128k',
        out,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    const newName = file.name.replace(/-mono$|$/, '').replace(/\.\w+$/, '') + '-lvl.m4a';
    const token = randomUUID();
    await bucket.upload(out, {
      destination: newName,
      metadata: {
        contentType: 'audio/mp4',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const url =
      `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
      `${encodeURIComponent(newName)}?alt=media&token=${token}`;

    // 그날 말씀이 새 파일을 보게 한다 — 예전 주소를 들고 있는 문서를 찾아 바꾼다
    const oldPart = encodeURIComponent(file.name);
    const snap = await db.collection('verses').get();
    let linked = 0;
    for (const doc of snap.docs) {
      if (String(doc.data().sermonAudioUrl ?? '').includes(oldPart)) {
        await doc.ref.set({ sermonAudioUrl: url }, { merge: true });
        linked++;
      }
    }
    const mb = (statSync(out).size / 1048576).toFixed(1);
    console.log(`      → ${newName} (${mb}MB, 말씀 ${linked}건 연결)`);
    if (linked > 0) await file.delete();
    else console.log('      (연결된 말씀이 없어 예전 파일은 남겨 둡니다)');
  } catch (e) {
    console.log(`      ✗ ${e?.stderr?.toString?.().slice(-300) || e?.message || e}`);
  }
}
console.log('\n끝났습니다.');
