/**
 * 관리자(교역자) 계정 생성/등록 스크립트.
 *
 * GitHub Actions(.github/workflows/make-admin.yml)의 "Run workflow"에서
 * 이메일·비밀번호를 입력해 실행하거나, 로컬에서:
 *
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" \
 *   ADMIN_EMAIL=admin@tvpc.church ADMIN_PASSWORD=비밀번호 \
 *   node scripts/make-admin.mjs
 *
 * 하는 일:
 *   1. 해당 이메일의 Firebase Auth 사용자를 만들거나(없으면) 비밀번호를 갱신
 *   2. Firestore admins/{이메일} 문서를 생성 → 앱의 "교역자 · 관리자" 로그인 가능
 *      (보안 규칙 isAdmin()이 admins/{request.auth.token.email} 존재를 확인)
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!saRaw || !email || !password) {
  console.error('FIREBASE_SERVICE_ACCOUNT / ADMIN_EMAIL / ADMIN_PASSWORD 환경변수가 필요합니다.');
  process.exit(1);
}
if (password.length < 6) {
  console.error('비밀번호는 6자 이상이어야 합니다.');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(saRaw)) });
const auth = getAuth();
const db = getFirestore();

// 제거 모드 — 관리자 명단과 로그인 계정을 삭제한다
if ((process.env.ADMIN_REMOVE || '').trim() === 'true') {
  await db.doc(`admins/${email}`).delete();
  try {
    const u = await auth.getUserByEmail(email);
    await auth.deleteUser(u.uid);
    console.log(`로그인 계정 삭제: ${email}`);
  } catch {
    console.log(`로그인 계정이 없어 명단만 삭제: ${email}`);
  }
  console.log(`완료! ${email} 이(가) 관리자 명단에서 제거되었습니다.`);
  process.exit(0);
}

let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password });
  console.log(`기존 사용자 비밀번호 갱신: ${email}`);
} catch {
  user = await auth.createUser({ email, password });
  console.log(`사용자 생성: ${email}`);
}

// 역할: pastor(목회자) = 말씀 관리, admin(관리자) = 소식·일정 관리
const role = (process.env.ADMIN_ROLE || 'admin').trim() === 'pastor' ? 'pastor' : 'admin';

await db.doc(`admins/${email}`).set({
  email,
  role,
  createdAt: Date.now(),
});

console.log(`완료! ${email} 계정이 ${role === 'pastor' ? '목회자' : '관리자'}로 등록되었습니다.`);
console.log('앱의 더보기 맨 아래 "교역자 · 관리자"에서 이 계정으로 로그인하세요.');
process.exit(0);
