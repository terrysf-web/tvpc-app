/**
 * 저장소에 올라간 설교 녹음을 MP3로 바꾼다(한 번만 돌리면 되는 손보기).
 *
 * 크롬·안드로이드 브라우저는 녹음을 webm(opus)으로 담는데, 이 파일은 받아
 * 놓아도 윈도우 미디어 플레이어·아이폰·편집 프로그램에서 열리지 않는다.
 * 브라우저 안에서 바꿔 보기도 했지만 30분짜리 설교를 폰에서 바꾸려니
 * 몇 분씩 멈춘 것처럼 보여서, 저장소에 있는 파일 자체를 한 번 바꿔 둔다.
 * 그 뒤로는 내려받기도 앱 안 재생도 그냥 빠르다.
 *
 * 새로 녹음하는 파일은 브라우저가 되도록 m4a(mp4)로 담으므로 이 손보기가
 * 다시 필요하지 않다. 그래도 webm으로 담긴 게 생기면 이 스크립트를 다시
 * 돌리면 된다(이미 바꾼 파일은 건너뛴다).
 *
 * 실행: GitHub Actions → "Convert sermon audio to MP3 (one-off)"
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
const sa = JSON.parse(saRaw);
const bucketName = `${sa.project_id}.firebasestorage.app`;
initializeApp({ credential: cert(sa), storageBucket: bucketName });
const db = getFirestore();
const bucket = getStorage().bucket();

/** 바꿀 대상인가 — 이미 어디서나 열리는 형식이면 그냥 둔다 */
function needsConvert(name) {
  return /\.(webm|ogg|oga|opus)$/i.test(name);
}

/** 앱이 쓰는 내려받기 주소(토큰 포함) */
function downloadUrl(path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path,
  )}?alt=media&token=${token}`;
}

const tmp = mkdtempSync(join(tmpdir(), 'sermon-'));
const [files] = await bucket.getFiles({ prefix: 'sermonAudio/' });
const targets = files.filter((f) => needsConvert(f.name));

console.log(`설교 파일 ${files.length}개 중 바꿀 것 ${targets.length}개`);

let done = 0;
for (const file of targets) {
  const src = join(tmp, 'in' + (file.name.match(/\.\w+$/)?.[0] ?? '.webm'));
  const out = join(tmp, 'out.mp3');
  const newPath = file.name.replace(/\.\w+$/, '.mp3');

  try {
    await file.download({ destination: src });

    // 말소리용 — 32kHz 한 줄(모노) 64kbps면 30분 설교가 대략 14MB다
    execFileSync(
      'ffmpeg',
      ['-y', '-i', src, '-vn', '-ac', '1', '-ar', '32000', '-b:a', '64k', out],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    const token = randomUUID();
    await bucket.upload(out, {
      destination: newPath,
      metadata: {
        contentType: 'audio/mpeg',
        // 이 토큰이 있어야 앱이 쓰는 주소로 바로 받을 수 있다
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const url = downloadUrl(newPath, token);

    // 그날 말씀이 새 주소를 보게 한다 — 파일 이름(날짜)으로 찾지 않고,
    // 예전 주소를 그대로 들고 있는 문서를 찾아 바꾼다(가장 확실하다).
    const oldPart = encodeURIComponent(file.name);
    const snap = await db.collection('verses').get();
    let linked = 0;
    for (const doc of snap.docs) {
      const cur = String(doc.data().sermonAudioUrl ?? '');
      if (cur.includes(oldPart)) {
        await doc.ref.set({ sermonAudioUrl: url }, { merge: true });
        linked++;
      }
    }

    const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
    console.log(`  ✓ ${file.name} → ${newPath} (${mb}MB, 말씀 ${linked}건 연결)`);

    // 예전 파일은 연결을 옮긴 뒤에 지운다 — 중간에 실패해도 듣던 주소가
    // 살아 있도록 순서를 지킨다
    if (linked > 0) await file.delete();
    else console.log(`    (연결된 말씀이 없어 예전 파일은 남겨 둡니다: ${file.name})`);
    done++;
  } catch (e) {
    console.log(`  ✗ ${file.name}: ${e?.stderr?.toString?.().slice(-300) || e?.message || e}`);
  }
}

console.log(`끝났습니다 — ${done}/${targets.length}개 바꿨습니다.`);
