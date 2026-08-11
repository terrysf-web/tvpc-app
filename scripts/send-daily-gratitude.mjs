/**
 * 감사일기 알림 — "감사일기" 알림을 켠 기기로 매일 저녁
 * "오늘도 하나님의 은혜 안에 지내셨나요?" 알림을 보낸다.
 *
 * 감사일기 자체는 서버에 저장하지 않는(기기 로컬) 개인 기록이라 오늘의
 * 말씀처럼 "오늘 내용이 등록됐는지" 확인할 게 없다 — 그냥 매일 그대로 보낸다.
 *
 * GitHub Actions(.github/workflows/push-daily-gratitude.yml)가 매일 저녁 실행.
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

const tokensSnap = await db
  .collection('pushTokens')
  .where('topics', 'array-contains', 'gratitude')
  .get();
const tokens = tokensSnap.docs.map((d) => d.id);
console.log(`감사일기 알림 켠 기기 ${tokens.length}대`);
if (tokens.length === 0) process.exit(0);

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const title = '감사일기';
const body = '오늘도 하나님의 은혜 안에 지내셨나요? 작은 것 하나라도 적어보세요.';

const messaging = getMessaging();
let sent = 0;
let removed = 0;

for (let i = 0; i < tokens.length; i += 500) {
  const chunk = tokens.slice(i, i + 500);
  const res = await messaging.sendEachForMulticast({
    tokens: chunk,
    notification: { title, body },
    webpush: {
      notification: { icon: '/icon-192.png', tag: `gratitude-${today}` },
      fcmOptions: { link: 'https://app.tvpc.church/gratitude' },
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
        removed++;
      } else {
        console.log(`  ! 발송 실패(${code})`);
      }
    }
  }
}

console.log(`완료: ${sent}대 발송, 무효 토큰 ${removed}개 정리`);
process.exit(0);
