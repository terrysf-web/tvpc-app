/**
 * 한쪽에서만 들리는 설교 녹음 고치기.
 *
 * 마이크는 한 줄(모노)인데 녹음으로 내보내는 자리는 두 줄(스테레오)이라,
 * 브라우저에 따라 왼쪽 칸에만 소리가 담겼다. 헤드폰으로 들으면 한쪽에서만
 * 들린다. 녹음하는 쪽은 고쳤지만, 이미 올라간 파일은 여기서 손본다.
 *
 * 각 파일의 칸 수와 칸별 소리 크기를 먼저 살펴보고, 한쪽이 비어 있거나
 * 두 줄로 담긴 파일만 한 줄(모노)로 다시 담는다 — 한 줄짜리는 어느 기기든
 * 양쪽 귀로 들린다. 소리 크기는 건드리지 않는다.
 *
 * 실행: GitHub Actions → "Fix sermon audio (mono)"
 */
import { execFileSync } from 'node:child_process';
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

/** 왼쪽·오른쪽 각각 얼마나 큰지(dB) — 한쪽이 비었는지 보려고 */
function levels(file) {
  try {
    const err = execFileSync(
      'ffmpeg',
      ['-hide_banner', '-i', file, '-af', 'channelsplit=channel_layout=stereo,astats=metadata=1', '-f', 'null', '-'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    return err.toString();
  } catch (e) {
    const s = e?.stderr?.toString() ?? '';
    const peaks = [...s.matchAll(/Peak level dB:\s*(-?[\d.]+|-inf)/g)].map((m) => m[1]);
    return peaks.length ? peaks.join(' / ') : '(못 읽음)';
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'mono-'));
const [files] = await bucket.getFiles({ prefix: 'sermonAudio/' });
console.log(`설교 녹음 ${files.length}개 살펴보기${DRY ? ' (고치지 않음)' : ''}`);

for (const file of files) {
  const ext = file.name.match(/\.\w+$/)?.[0] ?? '.m4a';
  const src = join(tmp, `in${ext}`);
  try {
    await file.download({ destination: src });
    const { codec, channels } = channelsOf(src);
    console.log(`\n  · ${file.name}\n      형식=${codec} 칸=${channels} 크기(왼/오른)=${levels(src)}`);
    if (channels < 2) {
      console.log('      한 줄이라 그대로 둡니다');
      continue;
    }
    if (DRY) {
      console.log('      두 줄 — 고칠 대상(지금은 살펴보기만)');
      continue;
    }

    // 두 칸을 합쳐 한 줄로 — 한쪽이 비어 있어도 나머지 소리가 그대로 살아난다
    const out = join(tmp, `out${ext}`);
    execFileSync(
      'ffmpeg',
      ['-y', '-i', src, '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '128k', out],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    const newName = file.name.replace(/\.\w+$/, '') + '-mono.m4a';
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
