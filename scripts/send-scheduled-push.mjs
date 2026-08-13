/**
 * 오늘의 말씀 + 감사일기 통합 발송 — 이 스크립트 하나가 세 번(오전 8시·
 * 오후 12:30·오후 7시, 태평양) 실행되며, 그때마다 TARGET_TIME 환경변수로
 * "지금이 몇 시 타임인지"를 받는다. 각 알림 종류(topic)는 하루에 한 번만
 * 가지만, 기기마다 그 한 번을 언제 받을지 고를 수 있다(더보기 탭 알림
 * 설정, src/push.ts 참고) — pushTokens 문서의 "{topic}Time" 필드(예:
 * verseTime, gratitudeTime)에 저장되고, 없으면 DEFAULT_TIME의 기본값을 쓴다.
 * 이 기본값은 반드시 src/push.ts의 NOTIFICATION_TOPICS.defaultTime과
 * 같아야 한다(설정 화면에 보이는 값과 실제 발송 시각이 어긋나지 않게).
 *
 * GitHub Actions(.github/workflows/push-scheduled-*.yml) 3개가 각자
 * 목표 시각까지 기다렸다가 TARGET_TIME을 다르게 주고 이 스크립트를 부른다.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const TARGET_TIME = process.env.TARGET_TIME;
if (!TARGET_TIME) {
  console.error('TARGET_TIME 환경변수(예: 08:00)가 필요합니다.');
  process.exit(1);
}

const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saRaw) {
  console.error('FIREBASE_SERVICE_ACCOUNT 환경변수(서비스 계정 JSON)가 필요합니다.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(saRaw)) });
const db = getFirestore();
const messaging = getMessaging();

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

async function sendTopic({ topic, defaultTime, timeField, build }) {
  const tokensSnap = await db.collection('pushTokens').where('topics', 'array-contains', topic).get();
  const targets = tokensSnap.docs.filter((d) => (d.get(timeField) ?? defaultTime) === TARGET_TIME);
  console.log(`[${topic}] ${TARGET_TIME} 타임 대상 ${targets.length}대 (전체 ${tokensSnap.size}대 중)`);
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
        // 앱 삭제·권한 철회 등으로 무효해진 토큰은 정리
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
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
    const snap = await db.doc(`verses/${today}`).get();
    if (!snap.exists) return null;
    const verse = snap.data();
    return {
      title: `오늘의 말씀 · ${verse.reference}`,
      body: String(verse.heroText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
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

process.exit(0);
