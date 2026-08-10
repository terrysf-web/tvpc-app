/**
 * 가입 승인 대기 알림 — 새 가입 신청(members/status=pending)이 있으면
 * 승인 담당자(dhbaek@gmail.com로 로그인해 알림을 켠 기기)에게만 푸시를 보낸다.
 *
 * GitHub Actions(.github/workflows/notify-pending.yml)가 매시간 실행.
 * 이미 알린 신청은 notifiedAdminAt 필드로 건너뛴다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const APPROVER_EMAIL = 'dhbaek@gmail.com';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();

const pendingSnap = await db.collection('members').where('status', '==', 'pending').get();
console.log(`승인 대기 ${pendingSnap.size}건`);
if (pendingSnap.empty) process.exit(0);

// 승인 담당자(dhbaek@gmail.com) 계정으로 로그인해 등록된 알림 토큰만
const tokenDocs = (await db.collection('pushTokens').get()).docs.filter(
  (d) => String(d.get('email') ?? '').toLowerCase() === APPROVER_EMAIL,
);
console.log(`${APPROVER_EMAIL} 알림 기기 ${tokenDocs.length}대`);

if (tokenDocs.length === 0) {
  console.log(
    `${APPROVER_EMAIL} 계정으로 로그인해 알림을 켠 기기가 없습니다 — 다음 실행 때 다시 시도합니다.`,
  );
  // 알림을 보낼 수 없었으니 "이미 알림" 표시를 남기지 않는다(과거에 잘못
  // 표시된 신청도 함께 정리해 다음 실행에서 다시 시도되게 한다).
  for (const d of pendingSnap.docs) {
    if (d.get('notifiedAdminAt')) await d.ref.update({ notifiedAdminAt: null });
  }
  process.exit(0);
}

// 아직 알리지 않은 승인 대기 신청만
const fresh = pendingSnap.docs.filter((d) => !d.get('notifiedAdminAt'));
console.log(`새 신청 ${fresh.length}건`);
if (fresh.length === 0) process.exit(0);

const names = fresh.map((d) => d.get('name')).filter(Boolean);
const title = '새 가입 신청';
const body =
  (names.length === 1
    ? `${names[0]}님이 가입 승인을 기다립니다.`
    : `${names[0]}님 외 ${names.length - 1}명이 가입 승인을 기다립니다.`) +
  ' 관리자 → 가입 승인 탭에서 승인해 주세요.';

const res = await getMessaging().sendEachForMulticast({
  tokens: tokenDocs.map((d) => d.id),
  notification: { title, body },
  webpush: {
    notification: { icon: '/icon-192.png', tag: 'pending-members' },
    fcmOptions: { link: 'https://app.tvpc.church' },
  },
});
let sent = 0;
for (let i = 0; i < res.responses.length; i++) {
  const r = res.responses[i];
  if (r.success) {
    sent++;
  } else if (String(r.error?.code || '').includes('registration-token-not-registered')) {
    await tokenDocs[i].ref.delete().catch(() => {});
  }
}
console.log(`발송 ${sent}대`);

// 실제로 하나라도 발송에 성공했을 때만 "이미 알림" 표시 — 그래야 전부 실패했을 때
// 다음 실행에서 다시 시도된다(마크만 해두고 실제로는 못 보낸 상태가 남지 않게).
if (sent > 0) {
  for (const d of fresh) {
    await d.ref.update({ notifiedAdminAt: Date.now() });
  }
} else {
  console.log('발송 성공 0건 — 다음 실행 때 다시 시도합니다.');
}
console.log('완료');
process.exit(0);
