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

// 아직 알리지 않은 승인 대기 신청
const pendingSnap = await db.collection('members').where('status', '==', 'pending').get();
const fresh = pendingSnap.docs.filter((d) => !d.get('notifiedAdminAt'));
console.log(`승인 대기 ${pendingSnap.size}건, 새 신청 ${fresh.length}건`);
if (fresh.length === 0) process.exit(0);

// 승인 담당자(dhbaek@gmail.com) 계정으로 로그인해 등록된 알림 토큰만
const tokenDocs = (await db.collection('pushTokens').get()).docs.filter(
  (d) => String(d.get('email') ?? '').toLowerCase() === APPROVER_EMAIL,
);
console.log(`${APPROVER_EMAIL} 알림 기기 ${tokenDocs.length}대`);

if (tokenDocs.length > 0) {
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
} else {
  console.log(
    `${APPROVER_EMAIL} 계정으로 로그인해 알림을 켠 기기가 없습니다 — 그 계정으로 로그인 후 알림을 켜 주세요.`,
  );
}

// 같은 신청을 반복 알림하지 않도록 표시
for (const d of fresh) {
  await d.ref.update({ notifiedAdminAt: Date.now() });
}
console.log('완료');
process.exit(0);
