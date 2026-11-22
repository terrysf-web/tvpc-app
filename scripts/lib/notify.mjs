/**
 * 관리자에게 보내는 알림 — 동기화 스크립트들이 같이 쓴다.
 *
 * 고치는 건 관리자 몫이라 목회자(role === 'pastor')는 제외한다.
 * 보내기가 실패해도 동기화 자체는 성공으로 둬야 하므로 절대 throw 하지 않는다.
 */
export async function notifyAdmins(db, { what, title, body, tag }) {
  try {
    const { getMessaging } = await import('firebase-admin/messaging');
    const adminsSnap = await db.collection('admins').get();
    const emails = adminsSnap.docs
      .filter((d) => d.data().role !== 'pastor')
      .map((d) => String(d.data().email || d.id).toLowerCase())
      .slice(0, 30);
    if (emails.length === 0) {
      console.log(`  ! ${what} 알림: 관리자 계정이 없어 건너뜁니다.`);
      return;
    }
    const tokensSnap = await db.collection('pushTokens').where('email', 'in', emails).get();
    const tokens = tokensSnap.docs.map((d) => d.id);
    if (tokens.length === 0) {
      console.log(`  ! ${what} 알림: 관리자 로그인 기기에 알림 등록이 없어 건너뜁니다.`);
      return;
    }
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        notification: { icon: '/icon-192.png', tag },
        fcmOptions: { link: 'https://app.tvpc.church/admin' },
      },
    });
    console.log(`  → ${what} 알림: 기기 ${tokens.length}대 중 ${res.successCount}대 발송`);
  } catch (e) {
    console.log(`  ! ${what} 알림 보내기 실패(무해): ${e.message}`);
  }
}
