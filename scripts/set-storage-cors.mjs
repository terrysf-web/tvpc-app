/**
 * 설교 녹음 파일 저장소(Firebase Storage)의 CORS 설정.
 *
 * 브라우저는 다른 도메인에 있는 파일을 스크립트로 받아오는 걸 기본으로 막는다.
 * 그래서 "지난 새벽설교"의 내려받기 단추가 파일을 저장하지 못하고 새 탭으로
 * 여는 것으로 물러섰다. 앱 주소에서 오는 읽기 요청만 허용해 두면 눌렀을 때
 * 바로 저장된다.
 *
 * 허용하는 건 읽기(GET/HEAD)뿐이다 — 올리기는 예전처럼 로그인한 사역자만
 * 할 수 있고(storage.rules), 그 경로는 Firebase SDK가 알아서 처리한다.
 *
 * 버킷 설정이라 한 번만 걸어 두면 되지만, 값이 바뀌어도 같은 결과가 되도록
 * (멱등) 매 배포마다 그대로 덮어쓴다.
 */
import { GoogleAuth } from 'google-auth-library';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
const sa = JSON.parse(saRaw);
const bucket = `${sa.project_id}.firebasestorage.app`;

const CORS = [
  {
    origin: [
      'https://app.tvpc.church',
      'https://happytvpc.web.app',
      'https://happytvpc.firebaseapp.com',
      'http://localhost:8081',
    ],
    method: ['GET', 'HEAD'],
    responseHeader: ['Content-Type', 'Content-Length', 'Content-Disposition'],
    maxAgeSeconds: 3600,
  },
];

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const url = `https://storage.googleapis.com/storage/v1/b/${bucket}?fields=cors`;
const res = await fetch(url, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ cors: CORS }),
});
const body = await res.text();

if (res.ok) {
  console.log(`Storage CORS 설정 완료(${bucket}): ${body.replace(/\s+/g, ' ').slice(0, 200)}`);
  process.exit(0);
}

// 저장소를 아직 안 켰거나(404) 서비스 계정에 저장소 권한이 없으면(403) —
// 내려받기는 새 탭으로 여는 방식으로 그대로 동작하므로 배포는 실패시키지 않는다.
console.log(
  `Storage CORS 설정 건너뜀 — HTTP ${res.status}: ${body.replace(/\s+/g, ' ').slice(0, 300)}`,
);
if (res.status === 403) {
  console.log(
    '  (서비스 계정에 저장소 권한이 없습니다. 구글 클라우드 콘솔 → IAM에서 해당 계정에 "Storage 관리자"를 주면 됩니다.)',
  );
}
