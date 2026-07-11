/**
 * 데일리브레드 푸시 발송 — 오늘(캘리포니아 기준) 등록된 말씀이 있으면
 * pushTokens에 등록된 모든 기기로 "오늘의 말씀" 알림을 보낸다.
 *
 * GitHub Actions(.github/workflows/push-daily-verse.yml)가 매일 아침 실행.
 * 말씀이 아직 등록되지 않은 날은 조용히 건너뛴다.
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

// 오늘 날짜 — 교회 지역(캘리포니아) 기준
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
console.log(`오늘(${today}) 말씀 확인 중…`);

const snap = await db.doc(`verses/${today}`).get();
if (!snap.exists) {
  console.log('오늘 등록된 말씀이 없어 발송을 건너뜁니다.');
  process.exit(0);
}
const verse = snap.data();
const title = `오늘의 말씀 · ${verse.reference}`;
const body = String(verse.heroText || '').replace(/\s+/g, ' ').trim().slice(0, 160);

const tokensSnap = await db.collection('pushTokens').get();
const tokens = tokensSnap.docs.map((d) => d.id);
console.log(`등록 기기 ${tokens.length}대`);
if (tokens.length === 0) process.exit(0);

const messaging = getMessaging();
let sent = 0;
let removed = 0;

for (let i = 0; i < tokens.length; i += 500) {
  const chunk = tokens.slice(i, i + 500);
  const res = await messaging.sendEachForMulticast({
    tokens: chunk,
    notification: { title, body },
    webpush: {
      notification: { icon: '/icon-192.png', tag: `verse-${today}` },
      fcmOptions: { link: 'https://happytvpc.web.app' },
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
        console.log(`  ! 발송 실패(${code})`);
      }
    }
  }
}

console.log(`완료: ${sent}대 발송, 무효 토큰 ${removed}개 정리`);
process.exit(0);
