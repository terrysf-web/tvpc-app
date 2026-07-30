/**
 * 웰컴(교회 표어) 등록 — 표어 문구와 배경 그림을 Firestore에 올린다.
 *
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" node scripts/set-welcome.mjs
 *
 * 문서를 둘로 나눠 저장한다:
 *   welcome/motto : 표어 번호·문구 (평소 실행 때는 이 작은 문서만 확인)
 *   welcome/image : 배경 그림 데이터 URL (보여줄 때만 내려받음)
 * 새해에 표어가 바뀌면 아래 값과 assets/ 그림을 바꾸고 다시 돌리면 된다 —
 * version 이 바뀌면 이미 본 교인에게도 한 번 다시 보인다.
 */
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MOTTO = {
  version: '2026',
  badge: '2026 교회 표어',
  title: '담장을 넘어',
  subtitle: 'Over the Wall',
  verse: '요셉은 무성한 가지 곧 샘 곁의 무성한 가지라\n그 가지가 담을 넘었도다',
  reference: '(창세기 49장 22절)',
};
const IMAGE_FILE = 'assets/welcome-2026.jpg';
/** 더보기 › 사진 출처 화면에 그대로 보여줄 문구 */
const IMAGE_CREDIT = '자체 제작 (AI 생성 이미지)';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();

const img = readFileSync(IMAGE_FILE);
const dataUrl = `data:image/jpeg;base64,${img.toString('base64')}`;
if (dataUrl.length > 950_000) {
  console.error(`그림이 너무 큽니다 (${Math.round(dataUrl.length / 1024)}KB) — 900KB 아래로 줄여 주세요.`);
  process.exit(1);
}

const now = new Date().toISOString();
await db.doc('welcome/motto').set({ ...MOTTO, updatedAt: now });
await db.doc('welcome/image').set({ image: dataUrl, credit: IMAGE_CREDIT, updatedAt: now });
console.log(
  `등록 완료 — ${MOTTO.badge} "${MOTTO.title}" / 그림 ${Math.round(dataUrl.length / 1024)}KB`,
);
