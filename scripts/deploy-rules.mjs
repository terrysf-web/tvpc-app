/**
 * Firestore 보안 규칙 배포 — firebase-tools 대신 Rules API를 직접 호출한다.
 * (firebase-tools는 배포 전 serviceusage API 점검을 하는데, 서비스 계정에
 *  그 권한이 없어 403으로 실패했다. 규칙 API 자체 권한만으로 배포한다.)
 */
import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

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
