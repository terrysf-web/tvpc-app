/**
 * 긴급 알림 발송 — alerts 컬렉션의 대기(pending) 문서를
 * pushTokens에 등록된 모든 기기로 전송하고 발송 완료로 표시한다.
 *
 * 관리자 화면에서 알림을 등록하면 send-alert.yml 워크플로가 즉시 실행되고,
 * 같은 워크플로의 5분 간격 예비 실행이 남은 대기 알림을 발송한다.
 * 두 실행이 겹쳐도 트랜잭션 잠금(pending→sending)으로 한 번만 나간다.
 * 24시간이 지난 대기 알림은 뒤늦게 나가지 않도록 만료 처리한다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();

// sending 상태도 함께 조회 — 이전 실행이 중간에 죽어 잠긴 채 남은 알림을 되살린다
const pendingSnap = await db
  .collection('alerts')
  .where('status', 'in', ['pending', 'sending'])
  .get();
if (pendingSnap.empty) {
  console.log('대기 중인 긴급 알림이 없습니다.');
  process.exit(0);
}

const tokensSnap = await db.collection('pushTokens').get();
let tokens = tokensSnap.docs.map((d) => d.id);
console.log(`대기 알림 ${pendingSnap.size}건 · 등록 기기 ${tokens.length}대`);

const messaging = getMessaging();

for (const alertDoc of pendingSnap.docs) {
  const alert = alertDoc.data();

  if (Date.now() - Number(alert.createdAt || 0) > 24 * 3600e3) {
    await alertDoc.ref.update({ status: 'expired' });
    console.log(`- ${alertDoc.id}: 24시간 경과로 만료 처리`);
    continue;
  }

  // 잠금 선점 — 다른 실행이 이미 보내는 중이면 건너뛴다 (10분 넘게 잠겨 있으면 회수)
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(alertDoc.ref);
    const cur = snap.data();
    if (!cur) return false;
    const staleClaim =
      cur.status === 'sending' && Date.now() - Number(cur.claimedAt || 0) > 10 * 60e3;
    if (cur.status !== 'pending' && !staleClaim) return false;
    tx.update(alertDoc.ref, { status: 'sending', claimedAt: Date.now() });
    return true;
  });
  if (!claimed) {
    console.log(`- ${alertDoc.id}: 다른 실행이 발송 중이라 건너뜁니다.`);
    continue;
  }

  const title = String(alert.title || '긴급 공지').slice(0, 60);
  const body = String(alert.body || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  let sent = 0;
  let removed = 0;

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: { title, body },
      webpush: {
        // requireInteraction: 사용자가 확인할 때까지 알림이 사라지지 않는다
        notification: { icon: '/icon-192.png', tag: `alert-${alertDoc.id}`, requireInteraction: true },
        fcmOptions: { link: 'https://app.tvpc.church' },
      },
    });
    for (let j = 0; j < res.responses.length; j++) {
      const r = res.responses[j];
      if (r.success) {
        sent++;
      } else {
        const code = r.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          await db.doc(`pushTokens/${chunk[j]}`).delete().catch(() => {});
          tokens = tokens.filter((t) => t !== chunk[j]);
          removed++;
        } else {
          console.log(`  ! 발송 실패(${code})`);
        }
      }
    }
  }

  await alertDoc.ref.update({ status: 'sent', sentAt: Date.now(), sentCount: sent });

  // 알림을 지운 뒤에도 다시 볼 수 있게 소식 탭에 자동 등록
  const todayLA = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  await db.doc(`news/n-${alertDoc.id}`).set({
    category: 'notice',
    title,
    body,
    date: todayLA,
    imageUrl: null,
    alert: true,
  });

  console.log(`- ${alertDoc.id} "${title}": ${sent}대 발송, 무효 토큰 ${removed}개 정리`);
}

console.log('완료');
process.exit(0);
