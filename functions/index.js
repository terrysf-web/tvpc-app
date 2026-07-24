/**
 * 긴급 알림 즉시 발송 — 관리자가 alerts 문서를 등록하는 순간 실행돼
 * 알림을 켠 모든 기기(pushTokens)로 몇 초 안에 푸시를 보낸다.
 *
 * GitHub 예비 발송(send-alert.yml, 5분 간격)과 같은 잠금 규약(pending→sending)을
 * 쓰므로 두 경로가 겹쳐도 알림은 한 번만 나간다.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

initializeApp();
setGlobalOptions({ maxInstances: 2 });

export const sendAlert = onDocumentCreated(
  { document: 'alerts/{id}', memory: '256MiB', timeoutSeconds: 300, retry: false },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const db = getFirestore();
    const ref = snap.ref;

    // 잠금 선점 — 예비 발송 경로와 겹쳐도 한 번만 나간다
    const claimed = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data();
      if (!cur || cur.status !== 'pending') return false;
      if (Date.now() - Number(cur.createdAt || 0) > 24 * 3600e3) {
        tx.update(ref, { status: 'expired' });
        return false;
      }
      tx.update(ref, { status: 'sending', claimedAt: Date.now() });
      return true;
    });
    if (!claimed) {
      console.log(`${event.params.id}: 이미 처리 중이라 건너뜁니다.`);
      return;
    }

    const alert = snap.data();
    const title = String(alert.title || '긴급 공지').slice(0, 60);
    const body = String(alert.body || '').replace(/\s+/g, ' ').trim().slice(0, 500);

    const tokensSnap = await db.collection('pushTokens').get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    console.log(`${event.params.id} "${title}": 등록 기기 ${tokens.length}대`);

    const messaging = getMessaging();
    let sent = 0;
    let removed = 0;

    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        webpush: {
          // requireInteraction: 사용자가 확인할 때까지 알림이 사라지지 않는다
          notification: {
            icon: '/icon-192.png',
            tag: `alert-${event.params.id}`,
            requireInteraction: true,
          },
          fcmOptions: { link: 'https://app.tvpc.church' },
        },
      });
      for (let j = 0; j < res.responses.length; j++) {
        const r = res.responses[j];
        if (r.success) {
          sent++;
        } else {
          const code = r.error?.code || '';
          if (
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-argument')
          ) {
            await db.doc(`pushTokens/${chunk[j]}`).delete().catch(() => {});
            removed++;
          } else {
            console.log(`  ! 발송 실패(${code})`);
          }
        }
      }
    }

    await ref.update({ status: 'sent', sentAt: Date.now(), sentCount: sent });
    console.log(`완료: ${sent}대 발송, 무효 토큰 ${removed}개 정리`);
  },
);
