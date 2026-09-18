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
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

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

/**
 * 설교 녹음 보관 정리 — 무료 용량 안에서만 쌓이도록 지킨다.
 *
 * 새벽설교 한 편이 14MB쯤이라 1년에 300MB 정도다. 무료 5GB면 십수 년치가
 * 들어가므로 평소에는 아무것도 지우지 않는다. 다만 언젠가 한도에 닿으면
 * 요금이 붙기 시작하므로, 그 전에 오래된 것부터 덜어낸다.
 *
 * 지울 때는 파일만 지우지 않고 그날 verses 문서의 설교 주소도 함께 비운다 —
 * 안 그러면 "설교 듣기"가 깨진 링크로 남는다(주소가 비면 앱은 다시
 * "준비 중"으로 안내한다).
 */
const SERMON_AUDIO_KEEP_BYTES = 4 * 1024 * 1024 * 1024; // 무료 5GB에 여유를 둔 4GB

export const pruneSermonAudio = onSchedule(
  { schedule: '0 4 * * 1', ...SCHEDULED_PUSH_OPTS },
  async () => {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: 'sermonAudio/' });
    const items = files
      .map((f) => ({
        file: f,
        size: Number(f.metadata?.size ?? 0),
        // 파일 이름이 "sermonAudio/2026-09-10-1757…webm"이라 앞부분이 그날 날짜다
        date: (f.name.match(/sermonAudio\/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? '',
        created: f.metadata?.timeCreated ?? '',
      }))
      .sort((a, b) => (a.created < b.created ? -1 : 1)); // 오래된 것부터

    let total = items.reduce((n, it) => n + it.size, 0);
    const mb = (n) => Math.round(n / 1048576);
    console.log(`설교 녹음 ${items.length}개, ${mb(total)}MB (한도 ${mb(SERMON_AUDIO_KEEP_BYTES)}MB)`);
    if (total <= SERMON_AUDIO_KEEP_BYTES) return;

    const db = getFirestore();
    let removed = 0;
    for (const it of items) {
      if (total <= SERMON_AUDIO_KEEP_BYTES) break;
      try {
        await it.file.delete();
        total -= it.size;
        removed++;
        if (it.date) {
          await db
            .doc(`verses/${it.date}`)
            .set({ sermonAudioUrl: null }, { merge: true })
            .catch(() => {});
        }
        console.log(`  - 지움: ${it.file.name} (${mb(it.size)}MB)`);
      } catch (e) {
        console.log(`  ! 못 지움: ${it.file.name} — ${e.message}`);
      }
    }
    console.log(`정리 완료: ${removed}개 지움, 남은 용량 ${mb(total)}MB`);
  },
);

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

// ── 설교 녹음 손보기 + 유튜브에 올릴 영상 만들기 ──────────────────────
/**
 * 녹음이 올라오면 서버가 바로 두 가지를 한다.
 *
 * 하나, 소리를 바로잡는다 — 한 줄(모노)로 맞추고, 크기를 방송 기준
 * (-16 LUFS)에 맞춘다. 브라우저마다 녹음이 제각각이라(한쪽 귀에서만
 * 들리거나, 작게 담기거나) 올라온 뒤에 한 번 손봐야 확실하다. 실제로
 * 왼쪽에서만 들리는 일이 두 번 있었다 — 녹음하는 쪽만 고쳐서는 그 기기에
 * 새 판이 내려가기 전까지 또 같은 일이 생긴다.
 *
 * 둘, 그 소리에 배경 그림을 입혀 영상(mp4)으로 만들어 둔다. 유튜브는 소리만
 * 있는 파일을 받지 않아서, 목사님이 직접 올리실 수 있게 준비해 두는 것이다.
 *
 * 손본 파일은 이름 끝에 "-fix"가 붙는다. 그 파일이 다시 올라오면 소리는
 * 건드리지 않고 영상만 만든다(끝없이 되풀이되지 않게).
 */
const SERMON_AUDIO_OPTS = {
  memory: '1GiB',
  timeoutSeconds: 540,
  retry: false,
};

/** ffmpeg 한 번 돌리기 */
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => {
      err = (err + d.toString()).slice(-800);
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `ffmpeg ${code}`))));
  });
}

/** 앱이 쓰는 내려받기 주소(토큰 포함)로 올린다 */
async function uploadWithToken(bucket, localPath, destination, contentType) {
  const token = randomUUID();
  await bucket.upload(localPath, {
    destination,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
  });
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(destination)}?alt=media&token=${token}`
  );
}

export const makeSermonVideo = onObjectFinalized(SERMON_AUDIO_OPTS, async (event) => {
  const name = event.data.name ?? '';
  // 설교 녹음만 — 우리가 만든 영상(sermonVideo/)에는 반응하지 않는다
  if (!name.startsWith('sermonAudio/') || !/\.(m4a|mp3|webm|ogg)$/i.test(name)) return;

  const date = (name.match(/sermonAudio\/(\d{4}-\d{2}-\d{2})/) ?? [])[1];
  if (!date) return;

  const bucket = getStorage().bucket(event.data.bucket);
  const db = getFirestore();
  const already = /-fix\.\w+$/.test(name);
  const stamp = Date.now();
  const tmpIn = join(tmpdir(), `in-${stamp}${name.match(/\.\w+$/)?.[0] ?? '.m4a'}`);
  const tmpFixed = join(tmpdir(), `fix-${stamp}.m4a`);
  const tmpOut = join(tmpdir(), `out-${stamp}.mp4`);
  const bg = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'sermon-bg.jpg');
  let audioForVideo = tmpIn;

  try {
    await bucket.file(name).download({ destination: tmpIn });

    // 1) 소리 바로잡기 — 한 줄로, 크기는 방송 기준으로
    if (!already) {
      await runFfmpeg([
        '-y', '-i', tmpIn,
        '-vn',
        '-ac', '1',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar', '48000',
        '-c:a', 'aac', '-b:a', '128k',
        tmpFixed,
      ]);
      const fixedName = name.replace(/\.\w+$/, '') + '-fix.m4a';
      const url = await uploadWithToken(bucket, tmpFixed, fixedName, 'audio/mp4');
      await db.doc(`verses/${date}`).set({ sermonAudioUrl: url }, { merge: true });
      // 손본 파일로 옮겨 붙인 뒤에 원본을 지운다 — 중간에 멈춰도 듣던 주소가 산다
      await bucket.file(name).delete().catch(() => {});
      audioForVideo = tmpFixed;
      console.log(`설교 녹음 손봄: ${fixedName}`);
    }

    // 2) 유튜브에 올리실 영상 만들기 — 멈춘 그림 한 장 + 손본 소리
    await runFfmpeg([
      '-y',
      '-loop', '1',
      '-i', bg,
      '-i', audioForVideo,
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
      '-r', '2', // 멈춘 그림이라 1초에 2장이면 충분하다(용량이 거의 안 는다)
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'stillimage',
      '-shortest',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      tmpOut,
    ]);
    const outName = name
      .replace(/^sermonAudio\//, 'sermonVideo/')
      .replace(/(-fix)?\.\w+$/, '.mp4');
    const videoUrl = await uploadWithToken(bucket, tmpOut, outName, 'video/mp4');
    await db.doc(`verses/${date}`).set({ sermonVideoUrl: videoUrl }, { merge: true });
    console.log(`설교 영상 준비 완료: ${outName}`);
  } catch (e) {
    console.error(`설교 녹음 손보기 실패(${name}): ${e?.message ?? e}`);
  } finally {
    for (const f of [tmpIn, tmpFixed, tmpOut]) {
      try {
        unlinkSync(f);
      } catch {
        /* 없으면 그만 */
      }
    }
  }
});
