/**
 * Firestore·Storage 보안 규칙 배포 — firebase-tools 대신 Rules API를 직접
 * 호출한다. (firebase-tools는 배포 전 serviceusage API 점검을 하는데, 서비스
 *  계정에 그 권한이 없어 403으로 실패했다. 규칙 API 자체 권한만으로 배포한다.)
 *
 * Storage 규칙은 콘솔에서 Storage를 아직 안 켰으면 배포할 대상이 없다 —
 * 그때는 안내만 남기고 넘어간다(Firestore 규칙 배포까지 같이 실패하면
 * 웹 배포 전체가 빨갛게 되므로).
 */
import { GoogleAuth } from 'google-auth-library';
import { existsSync, readFileSync } from 'node:fs';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
const sa = JSON.parse(saRaw);
const project = sa.project_id;
const rules = readFileSync('firestore.rules', 'utf8');

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const api = `https://firebaserules.googleapis.com/v1/projects/${project}`;
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

async function call(method, url, body) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${url} → HTTP ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

/** 규칙 파일 하나를 룰셋으로 만들어 해당 릴리스에 걸어 준다 */
async function release(fileName, content, releaseId) {
  const ruleset = await call('POST', `${api}/rulesets`, {
    source: { files: [{ name: fileName, content }] },
  });
  console.log(`룰셋 생성(${fileName}): ${ruleset.name}`);
  const releaseName = `projects/${project}/releases/${releaseId}`;
  try {
    await call('PATCH', `${api}/releases/${releaseId}`, {
      release: { name: releaseName, rulesetName: ruleset.name },
    });
    console.log(`릴리스 갱신 완료(${releaseId}) — 규칙이 적용됐습니다.`);
  } catch (e) {
    if (String(e.message).includes('404')) {
      await call('POST', `${api}/releases`, { name: releaseName, rulesetName: ruleset.name });
      console.log(`릴리스 생성 완료(${releaseId}) — 규칙이 적용됐습니다.`);
    } else {
      throw e;
    }
  }
}

// 1. 규칙 소스로 룰셋 생성
const ruleset = await call('POST', `${api}/rulesets`, {
  source: { files: [{ name: 'firestore.rules', content: rules }] },
});
console.log(`룰셋 생성: ${ruleset.name}`);

// 2. cloud.firestore 릴리스가 새 룰셋을 가리키게 갱신 (없으면 생성)
const releaseName = `projects/${project}/releases/cloud.firestore`;
try {
  await call('PATCH', `${api}/releases/cloud.firestore`, {
    release: { name: releaseName, rulesetName: ruleset.name },
  });
  console.log('릴리스 갱신 완료 — 규칙이 적용됐습니다.');
} catch (e) {
  if (String(e.message).includes('404')) {
    await call('POST', `${api}/releases`, { name: releaseName, rulesetName: ruleset.name });
    console.log('릴리스 생성 완료 — 규칙이 적용됐습니다.');
  } else {
    throw e;
  }
}

// 3. Storage 규칙 — 설교 녹음 파일 보관용. 콘솔에서 Storage를 아직 안 켰으면
//    걸어 줄 버킷이 없어 404가 난다. 그때는 안내만 남기고 넘어간다.
if (existsSync('storage.rules')) {
  const bucket = `${project}.firebasestorage.app`;
  try {
    await release('storage.rules', readFileSync('storage.rules', 'utf8'), `firebase.storage/${bucket}`);
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes('404') || msg.includes('403')) {
      console.log(
        `Storage 규칙은 건너뜁니다 — 콘솔에서 Storage를 켠 뒤 다시 배포하면 적용됩니다(${bucket}).`,
      );
    } else {
      throw e;
    }
  }
}
