/**
 * 긴급 알림 즉시 발송 — 관리자가 alerts 문서를 등록하는 순간 실행돼
 * 알림을 켠 모든 기기(pushTokens)로 몇 초 안에 푸시를 보낸다.
 * 다른 알림(오늘의 말씀 등)과 달리 선택 해제할 수 없다 — 알림을 켠 기기라면
 * pushTokens.topics 값과 무관하게 무조건 받는다(src/push.ts 참고).
 *
 * GitHub 예비 발송(send-alert.yml, 5분 간격)과 같은 잠금 규약(pending→sending)을
 * 쓰므로 두 경로가 겹쳐도 알림은 한 번만 나간다.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';

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

/**
 * "오늘의 말씀" + "감사일기" 예약 발송 — 태평양 시각 08:00/12:30/19:00
 * 정각에 맞춰 보낸다.
 *
 * 원래 깃허브 Actions 예약 실행(scripts/send-scheduled-push.mjs)이
 * 맡았었는데, 깃허브의 예약 실행은 공용 대기열이라 몇 시간씩 밀리는
 * 일이 있다(2026-08-27 실측 — 오전 8시 알림이 오후 3시에야 도착,
 * 12:30 알림은 6시간 가까이 밀림). Cloud Scheduler는 구글이 직접
 * 관리하는 전용 크론이라 정각에 훨씬 안정적으로 실행되므로, 알림
 * 시각의 정확도가 중요한 이 기능만 여기로 옮겼다.
 */
async function sendScheduledPush(targetTime) {
  const db = getFirestore();
  const messaging = getMessaging();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  // 주일엔 예배에서 말씀을 이미 듣기 때문에 "오늘의 말씀" 알림은 건너뛴다
  // (감사일기는 그대로 보낸다).
  const isSunday =
    new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }) ===
    'Sun';

  async function sendTopic({ topic, defaultTime, timeField, build }) {
    const tokensSnap = await db
      .collection('pushTokens')
      .where('topics', 'array-contains', topic)
      .get();
    const targets = tokensSnap.docs.filter((d) => (d.get(timeField) ?? defaultTime) === targetTime);
    console.log(`[${topic}] ${targetTime} 타임 대상 ${targets.length}대 (전체 ${tokensSnap.size}대 중)`);
    if (targets.length === 0) return;

    const content = await build();
    if (!content) {
      console.log(`[${topic}] 오늘 보낼 내용이 없어 건너뜁니다.`);
      return;
    }
    const { title, body, link, tag } = content;

    const tokens = targets.map((d) => d.id);
    let sent = 0;
    let removed = 0;
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        webpush: {
          notification: { icon: '/icon-192.png', tag },
          fcmOptions: { link },
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
            console.log(`  ! [${topic}] 발송 실패(${code})`);
          }
        }
      }
    }
    console.log(`[${topic}] 완료: ${sent}대 발송, 무효 토큰 ${removed}개 정리`);
  }

  await sendTopic({
    topic: 'verse',
    defaultTime: '08:00',
    timeField: 'verseTime',
    build: async () => {
      if (isSunday) return null;
      const snap = await db.doc(`verses/${today}`).get();
      if (!snap.exists) return null;
      const verse = snap.data();
      return {
        title: `오늘의 말씀 · ${verse.reference}`,
        body: String(verse.heroText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160),
        link: 'https://app.tvpc.church/word',
        tag: `verse-${today}`,
      };
    },
  });

  await sendTopic({
    topic: 'gratitude',
    defaultTime: '19:00',
    timeField: 'gratitudeTime',
    build: async () => ({
      title: '감사일기',
      body: '오늘도 하나님의 은혜 안에 지내셨나요? 작은 것 하나라도 적어보세요.',
      link: 'https://app.tvpc.church/gratitude',
      tag: `gratitude-${today}`,
    }),
  });
}

const SCHEDULED_PUSH_OPTS = {
  timeZone: 'America/Los_Angeles',
  memory: '256MiB',
  timeoutSeconds: 300,
  retry: false,
};

export const pushScheduled0800 = onSchedule(
  { schedule: '0 8 * * *', ...SCHEDULED_PUSH_OPTS },
  () => sendScheduledPush('08:00'),
);

export const pushScheduled1230 = onSchedule(
  { schedule: '30 12 * * *', ...SCHEDULED_PUSH_OPTS },
  () => sendScheduledPush('12:30'),
);

export const pushScheduled1900 = onSchedule(
  { schedule: '0 19 * * *', ...SCHEDULED_PUSH_OPTS },
  () => sendScheduledPush('19:00'),
);

/**
 * 성경(개역개정판) 저작권 사용허가 갱신 알림 — 관리자로 로그인한 기기에
 * 재신청을 알린다.
 *
 * 대한성서공회 사용허가 공문(대성공 : 저2026-042)에 따르면 이번 허가
 * 기간은 2026-08-01~2027-07-31(1년)이고, 만료 한 달 전까지는 재신청서를
 * 내야 한다. 앞으로도 같은 주기(1년, 8월 시작)로 갱신될 걸로 보고 매년
 * 6월 30일에 알리도록 했다 — 다음 허가 기간이 달라지면 이 날짜를
 * 다시 조정하면 된다.
 */
export const remindBibleLicense = onSchedule(
  {
    schedule: '0 9 30 6 *',
    timeZone: 'America/Los_Angeles',
    memory: '256MiB',
    timeoutSeconds: 120,
    retry: false,
  },
  async () => {
    const db = getFirestore();
    const adminsSnap = await db.collection('admins').get();
    const emails = adminsSnap.docs
      .map((d) => String(d.data().email || d.id).toLowerCase())
      .slice(0, 30);
    if (emails.length === 0) {
      console.log('관리자 계정이 없어 건너뜁니다.');
      return;
    }
    const tokensSnap = await db.collection('pushTokens').where('email', 'in', emails).get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    if (tokens.length === 0) {
      console.log('관리자 로그인 기기에 알림 등록이 없어 건너뜁니다.');
      return;
    }
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: '📖 성경 저작권 사용허가 갱신',
        body: '대한성서공회 개역개정판 사용허가 만료(7/31)가 한 달 남았습니다. 재신청서를 제출해주세요.',
      },
      webpush: {
        notification: { icon: '/icon-192.png', tag: 'bible-license-reminder' },
        fcmOptions: { link: 'https://app.tvpc.church/admin' },
      },
    });
    console.log(`성경 저작권 갱신 알림: 관리자 기기 ${tokens.length}대 중 ${res.successCount}대 발송`);
  },
);

/**
 * 주보 동기화(sync-bulletin.yml) 예약 실행 트리거 — 실제 동기화 로직
 * (playwright 로그인, poppler PDF 렌더링)은 그대로 깃허브 Actions에
 * 두고, 이 함수는 "지금 실행해" 신호만 깃허브 API로 보낸다.
 *
 * 깃허브 자체 예약 실행(cron)은 공용 대기열이라 통째로 씹히는 날이
 * 있었다(2026-08-30 실측 — 새벽부터 한 번도 안 돎). Cloud Scheduler는
 * 구글이 직접 관리해 훨씬 안정적이므로, "버튼을 눌러주는 역할"만
 * 여기로 옮겼다 — workflow_dispatch는 사람이 수동 실행할 때와 똑같이
 * 항상 잘 작동했기 때문에, 그 경로를 정확한 시각에 대신 눌러주는
 * 것만으로 충분하다.
 *
 * GITHUB_PAT 시크릿 필요 — 저장소 Actions 쓰기 권한이 있는 깃허브
 * personal access token(fine-grained, Actions: Read and write).
 *   firebase functions:secrets:set GITHUB_PAT --project tvpc-40043
 */
const githubPat = defineSecret('GITHUB_PAT');
const BULLETIN_REPO = 'terrysf-web/tvpc-app';
const BULLETIN_BRANCH = 'claude/react-native-firebase-app-e0vg1r';

async function triggerBulletinSync() {
  const res = await fetch(
    `https://api.github.com/repos/${BULLETIN_REPO}/actions/workflows/sync-bulletin.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubPat.value()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tvpc-app-cloud-scheduler',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: BULLETIN_BRANCH }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`깃허브 워크플로 트리거 실패: HTTP ${res.status} ${text}`);
  }
  console.log('주보 동기화 워크플로 트리거 성공');
}

const BULLETIN_TRIGGER_OPTS = {
  timeZone: 'America/Los_Angeles',
  memory: '128MiB',
  timeoutSeconds: 30,
  retry: false,
  secrets: [githubPat],
};

// 토요일 오후 5시 ~ 밤 11시(태평양) — 자정을 넘어가는 구간은 별도 함수로 분리
export const triggerBulletinSyncSat = onSchedule(
  { schedule: '0 17-23 * * 6', ...BULLETIN_TRIGGER_OPTS },
  triggerBulletinSync,
);

// 일요일 밤 12시 ~ 오후 2시(태평양)
export const triggerBulletinSyncSun = onSchedule(
  { schedule: '0 0-14 * * 0', ...BULLETIN_TRIGGER_OPTS },
  triggerBulletinSync,
);
