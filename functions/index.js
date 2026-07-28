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
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';

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
          // 알림을 누르면 앱의 알림 보관함이 열린다
          fcmOptions: { link: 'https://app.tvpc.church/alerts' },
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

    // 알림을 지운 뒤에도 다시 볼 수 있게 소식 탭에 자동 등록 (아래에서 계속)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    await db.doc(`news/n-${event.params.id}`).set({
      category: 'notice',
      title,
      body,
      date: today,
      imageUrl: null,
      alert: true,
    });

    console.log(`완료: ${sent}대 발송, 무효 토큰 ${removed}개 정리`);
  },
);

/** 새 기도요청 알림 — 목회자로 로그인해 알림을 켠 기기로만 보낸다 */
export const notifyPrayerRequest = onDocumentCreated(
  { document: 'prayerRequests/{id}', memory: '256MiB', timeoutSeconds: 120, retry: false },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const db = getFirestore();
    const req = snap.data();

    const pastorsSnap = await db.collection('admins').where('role', '==', 'pastor').get();
    const emails = pastorsSnap.docs
      .map((d) => String(d.data().email || d.id).toLowerCase())
      .slice(0, 30);
    if (emails.length === 0) {
      console.log('목회자 계정이 없어 알림을 건너뜁니다.');
      return;
    }
    const tokensSnap = await db.collection('pushTokens').where('email', 'in', emails).get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    if (tokens.length === 0) {
      console.log('목회자 로그인 기기에 알림 등록이 없어 건너뜁니다.');
      return;
    }

    const name = String(req.name || '').trim();
    // 사생활 보호 — 잠금화면에는 내용 없이 도착 사실만 알린다
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: '🙏 새 기도요청',
        body: name ? `${name}님이 기도요청을 보냈습니다.` : '새 기도요청이 도착했습니다.',
      },
      webpush: {
        notification: { icon: '/icon-192.png', tag: `pray-${event.params.id}` },
        // 알림을 누르면 기도요청함이 바로 열린다
        fcmOptions: { link: 'https://app.tvpc.church/pray-inbox' },
      },
    });
    console.log(`기도요청 알림: 목회자 기기 ${tokens.length}대 중 ${res.successCount}대 발송`);
  },
);

/**
 * 목사님이 '기도 시작했어요'를 누르면 기도를 보낸 그 기기 한 대에만 알린다.
 * (교인 전체 발송이 아니다 — 요청에 적힌 알림 주소 하나로만 보낸다)
 */
export const notifyPrayerStarted = onDocumentUpdated(
  { document: 'prayerRequests/{id}', memory: '256MiB', timeoutSeconds: 60, retry: false },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === 'prayed' || after.status !== 'prayed') return;

    const token = String(after.deviceToken || '');
    if (!token) {
      console.log('보낸 기기의 알림 주소가 없어 건너뜁니다(앱 안에서는 상태로 보입니다).');
      return;
    }
    try {
      // 잠금화면에 기도 제목이 뜨지 않게 내용은 담지 않는다
      await getMessaging().send({
        token,
        notification: {
          title: '🙏 함께 기도하고 있습니다',
          body: '목사님이 기도 제목을 읽고 함께 기도하고 계십니다.',
        },
        webpush: {
          notification: { icon: '/icon-192.png', tag: `pray-started-${event.params.id}` },
          fcmOptions: { link: 'https://app.tvpc.church/pray-request' },
        },
      });
      console.log(`기도 시작 알림 발송: ${event.params.id}`);
    } catch (e) {
      // 앱을 지웠거나 알림을 끈 기기 — 조용히 넘어간다
      console.log(`기도 시작 알림 실패(무시): ${e && e.message ? e.message : e}`);
    }
  },
);

/** 응답 나눔이 도착하면 목회자에게 알린다 (교인 전체 발송이 아니다) */
export const notifyPrayerAnswer = onDocumentUpdated(
  { document: 'prayerRequests/{id}', memory: '256MiB', timeoutSeconds: 60, retry: false },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.answer || !after.answer) return;

    const db = getFirestore();
    const pastorsSnap = await db.collection('admins').where('role', '==', 'pastor').get();
    const emails = pastorsSnap.docs
      .map((d) => String(d.data().email || d.id).toLowerCase())
      .slice(0, 30);
    if (emails.length === 0) return;
    const tokensSnap = await db.collection('pushTokens').where('email', 'in', emails).get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    if (tokens.length === 0) return;

    const name = String(after.name || '').trim();
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: '🌱 기도 응답 나눔',
        body: name ? `${name}님이 응답 소식을 전해왔습니다.` : '응답 소식이 도착했습니다.',
      },
      webpush: {
        notification: { icon: '/icon-192.png', tag: `pray-answer-${event.params.id}` },
        fcmOptions: { link: 'https://app.tvpc.church/pray-inbox' },
      },
    });
    console.log(`응답 나눔 알림: 목회자 기기 ${tokens.length}대 중 ${res.successCount}대 발송`);
  },
);
