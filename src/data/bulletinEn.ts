/**
 * 주보를 English로 보여줄 때 쓰는 사전과 변환 — 화면 코드에서 떼어 둔다.
 * React를 쓰지 않는 순수 함수라 따로 돌려 보며 확인할 수 있다.
 */
import type { BulletinHymn, BulletinScripture } from './bulletin';
import { scriptureRefEn, scriptureRefsEn, stripBookParens } from './bibleEn';

// 늘 순서표에 등장하는 사역자 — 그 주 직함 표기가 "목사"든 "담임목사"든
// 상관없이 항상 같은 영어 직함·성으로 통일해서 부른다(사람마다 매주 표기가
// 달라 다르게 번역되면 안 되니까).
export const STAFF_EN: Record<string, { title: string; surname: string }> = {
  허성영: { title: 'Senior Pastor', surname: 'Huh' },
  최재하: { title: 'Youth Pastor', surname: 'Choi' },
  안현신: { title: 'Pastor', surname: 'Ahn' },
  안현숙: { title: 'CE Director', surname: 'Ahn' },
  조재희: { title: 'Elder', surname: 'Cho' },
};
// 위 목록에 없는 사람(매주 바뀌는 안내·헌금 위원 등)은 그 주 직함 단어만 영어로.
export const TITLE_EN: Record<string, string> = {
  담임목사: 'Senior Pastor',
  원로목사: 'Pastor Emeritus',
  협동목사: 'Associate Pastor',
  부목사: 'Associate Pastor',
  목사: 'Pastor',
  전도사: 'Rev.',
  교육사: 'CE Director',
  시무장로: 'Elder',
  장로: 'Elder',
  시무안수집사: 'Deacon',
  안수집사: 'Deacon',
  집사: 'Deacon',
  권사: 'Kwonsa',
};
// 이름 없이 역할만 적힌 한 단어 — 그대로 사전 치환
export const ROLE_WORD_EN: Record<string, string> = {
  인도자: 'Worship Leader',
  다같이: 'All',
  '다 같이': 'All',
  없음: 'None',
  성가대: 'Choir',
  찬양팀: 'Praise Team',
  연합찬양팀: 'Joint Praise Team',
  연합성가대: 'Joint Choir',
  어린이찬양: "Children's Song",
  '어린이 찬양': "Children's Song",
  교회소식: 'Announcements',
  '교회 소식': 'Announcements',
  광고: 'Announcements',
  입교식: 'Confirmation',
  세례식: 'Baptism',
  유아세례: 'Infant Baptism',
  전교인: 'All Members',
  회중: 'Congregation',
  헌금위원: 'Offering Committee',
  안내위원: 'Ushers',
  반주: 'Accompanist',
  지휘: 'Conductor',
};

/**
 * 성(姓)을 영어로 — 사전에 없는 분도 English에서 한글 이름이 그대로 남지
 * 않게 한다. 교회에서 쓰는 영문 표기(허=Huh, 최=Choi)를 따른다.
 * STAFF_EN에 있는 분은 그쪽이 먼저다(본인이 쓰시는 표기라서).
 */
export const SURNAME_EN: Record<string, string> = {
  김: 'Kim', 이: 'Lee', 박: 'Park', 최: 'Choi', 정: 'Jung', 강: 'Kang',
  조: 'Cho', 윤: 'Yoon', 장: 'Jang', 임: 'Lim', 한: 'Han', 오: 'Oh',
  서: 'Suh', 신: 'Shin', 권: 'Kwon', 황: 'Hwang', 안: 'Ahn', 송: 'Song',
  류: 'Ryu', 유: 'Yoo', 전: 'Jeon', 홍: 'Hong', 고: 'Ko', 문: 'Moon',
  양: 'Yang', 손: 'Son', 배: 'Bae', 백: 'Baek', 허: 'Huh', 남: 'Nam',
  심: 'Shim', 노: 'Noh', 하: 'Ha', 곽: 'Kwak', 성: 'Sung', 차: 'Cha',
  주: 'Joo', 우: 'Woo', 구: 'Koo', 민: 'Min', 지: 'Ji', 진: 'Jin',
  엄: 'Uhm', 채: 'Chae', 원: 'Won', 천: 'Chun', 방: 'Bang', 공: 'Kong',
  현: 'Hyun', 함: 'Ham', 변: 'Byun', 염: 'Yum', 여: 'Yeo', 추: 'Choo',
  도: 'Do', 소: 'So', 석: 'Suk', 선: 'Sun', 설: 'Seol', 마: 'Ma',
  길: 'Gil', 연: 'Yeon', 위: 'Wi', 표: 'Pyo', 명: 'Myung', 기: 'Ki',
  반: 'Ban', 라: 'Ra', 왕: 'Wang', 금: 'Keum', 옥: 'Ok', 육: 'Yook',
  인: 'In', 맹: 'Maeng', 제: 'Je', 모: 'Mo', 탁: 'Tak', 국: 'Kook',
  어: 'Eo', 은: 'Eun', 편: 'Pyun', 용: 'Yong', 예: 'Ye', 봉: 'Bong',
  사: 'Sa', 부: 'Boo', 피: 'Pi', 감: 'Kam', 호: 'Ho', 야: 'Ya',
  남궁: 'Namgoong', 황보: 'Hwangbo', 선우: 'Sunwoo', 제갈: 'Jegal',
  사공: 'Sagong', 서문: 'Seomun', 독고: 'Dokgo',
};

// 낱말 하나로 떨어져 있지 않고 "[넓은들에익은곡식]성가대"처럼 붙어 있는
// 경우도 많아, 글 안 어디에 있든 바꾼다(긴 낱말부터 — "연합성가대"가
// "성가대"보다 먼저 걸려야 한다).
export const ROLE_WORD_RE = new RegExp(
  Object.keys(ROLE_WORD_EN)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/\s+/g, '\\s*'))
    .join('|'),
  'g',
);

export function translateWordsEn(text: string): string {
  return text.replace(ROLE_WORD_RE, (m) => ROLE_WORD_EN[m] ?? ROLE_WORD_EN[m.replace(/\s+/g, '')] ?? m);
}

/** 한글 이름에서 성을 떼어 영어로 — 두 글자 성(남궁 등)을 먼저 본다 */
export function surnameEn(name: string): string | null {
  const n = name.replace(/\s+/g, '');
  return SURNAME_EN[n.slice(0, 2)] ?? SURNAME_EN[n.slice(0, 1)] ?? null;
}

/** 예배 순서 세부 내용(설교자·헌금 위원 등)을 눌러 English로 바꿨을 때 —
 * "이름 + 직함" 조각을 "직함 + (아는 사람이면 성, 모르면 이름 그대로)"로 바꾼다.
 * '/' '·'로 여러 사람이 이어진 경우도 각각 처리하고, 매칭 안 되는 부분(설교
 * 제목처럼 이미 영어가 섞인 문장 등)은 원문 그대로 둔다. */
export function translateNamesEn(text: string): string {
  if (!text) return text;
  const hasStar = text.endsWith('*');
  const body = hasStar ? text.slice(0, -1) : text;
  // 이름 앞에 곡 제목 같은 게 붙어 있을 수 있다("[산마다...]박수경집사").
  // 직함 바로 앞의 한글 몇 글자만 이름으로 보고, 앞쪽은 건드리지 않는다.
  const TITLE_SUFFIX = /^(.*?)([가-힣]{1,4})\s*(담임목사|원로목사|협동목사|부목사|시무안수집사|안수집사|시무장로|목사|전도사|교육사|장로|집사|권사)$/;
  const translated = body
    .split(/(\s*[·/]\s*)/)
    .map((piece, i) => {
      if (i % 2 === 1) return piece; // 구분자( · , / ) 그대로
      const seg = piece.trim();
      if (!seg) return piece;
      if (ROLE_WORD_EN[seg]) return ROLE_WORD_EN[seg];
      const m = seg.match(TITLE_SUFFIX);
      if (!m) return piece;
      const before = m[1].trim();
      const name = m[2].trim();
      const titleEn = TITLE_EN[m[3]];
      const known = STAFF_EN[name];
      // 사전에 없는 분도 English에서는 영어로 — 성만 옮겨 적는다
      const person = known ? `${known.title} ${known.surname}` : `${titleEn} ${surnameEn(name) ?? name}`;
      return before ? `${before} ${person}` : person;
    })
    .join('');
  return translated + (hasStar ? '*' : '');
}

/** English 모드에서 "한글 [English]"나 '"한글"(English)'처럼 같은 내용을
 * 한글·영어로 겹쳐 적어 둔 부분은 영어만 남긴다 — 한글은 안 보여도 되니까. */
export function stripKoreanDuplicates(text: string): string {
  return stripBookParens(text)
    .replace(/[가-힣][가-힣\s]*\[([A-Za-z][^\]]*)\]/g, '$1')
    .replace(/["“][^"”]*["”]\s*\(([^)]+)\)/g, '$1')
    // "거룩하신 하나님(Give Thanks)"처럼 한글 제목에 영어를 나란히 적어 둔 것
    .replace(/[가-힣][가-힣\s]*\(\s*([A-Za-z][A-Za-z\s'’.,!?-]*)\)/g, '$1')
    // "이사야(Isaiah)43:1"처럼 성경 책 이름 뒤에 바로 괄호로 영어를 덧붙인
    // 것도 영어만 남긴다(찬양 제목은 건드리지 않는다 — stripBookParens 참고)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 종이 주보에서 칸이 좁아 곡 제목이 두 줄로 끊긴 것을 도로 한 줄로 잇는다.
 *
 * 2026-10-25 2부 "경배와 기도"가 이렇게 들어왔다 —
 *   성가대 / [주님과 같이 / 경배하리 주 / 하나님]
 * 대괄호가 열린 채 줄이 바뀌어서, 줄 단위로 나눈 뒤에 곡 제목을 찾는
 * 아래 과정에서 "[주님과 같이 / 경배하리 주"와 "하나님]" 어느 쪽도 짝이
 * 맞지 않았다. 그래서 ♪ 배지로 바뀌지 못하고 대괄호가 그대로 보였다.
 * (1부는 같은 제목이 한 줄에 다 들어가서 멀쩡했다.)
 *
 * 닫는 대괄호가 나올 때까지 다음 줄을 이어 붙인다. 끝내 닫히지 않으면
 * 원래 줄 그대로 둔다 — 짐작으로 닫아 버리면 없는 제목이 생긴다.
 */

/** 한글 모드에서는 반대로 영어를 없앤다 — 칸이 좁은데 "책이름 [English]"
 * 처럼 뒤에 괄호로 덧붙은 영어까지 다 보여줄 필요는 없으니까. */
export function stripEnglishDuplicates(text: string): string {
  return text
    .replace(/([가-힣][가-힣\s]*)\[[A-Za-z][^\]]*\]/g, '$1')
    .replace(/(["“][^"”]*["”])\s*\([^)]+\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// 이 항목들은 세부 내용이 통째로 "찬송가 N장 [제목]" / "책이름 장:절" 인용
// 그 자체다 — 실제 저장된 영어 제목·본문 참조로 완전히 바꿔치기해도 안전하다.
// '어린이 설교'처럼 설교 제목·설교자까지 같이 적힌 줄은(장·절이 우연히 섞여
// 있어도) 인용만 남기면 나머지 내용을 잃으므로 이름·직함만 옮긴다.
export const PURE_CITATION_ITEMS = new Set(['찬송 / 헌금', '찬송', '성경봉독']);

/** 예배 순서 한 줄의 세부 내용을 English로 — 찬송·본문 인용 전용 줄이면 실제
 * 저장된 영어 제목/본문 참조를 쓰고(추측 아님), 그 외엔 이름·직함만 사전으로
 * 옮긴다. 끝의 '*'(일어서 주시기 바랍니다)는 번역 여부와 무관하게 그대로 남긴다. */
export function translateOrderDetail(
  itemName: string,
  rawDetail: string,
  hymn: BulletinHymn | null,
  scripture: BulletinScripture | null,
): string {
  if (PURE_CITATION_ITEMS.has(itemName)) {
    const star = rawDetail.trim().endsWith('*') ? '*' : '';
    if (hymn) return `Hymn ${hymn.number}${hymn.titleEn ? ` [${hymn.titleEn}]` : ''}${star}`;
    if (scripture) return `${scriptureRefEn(scripture.reference)}${star}`;
  }
  // 인용 전용 줄이 아니거나, 그 주 성경 본문이 저장되지 않아 위에서 못 바꾼
  // 경우 — 글 안에 섞인 성경 참조와 "찬송가 N장" 표기만이라도 영어로 바꾼다.
  // (2026-11-22 "성경봉독 [하박국3:17-19]"이 scriptures가 비어 있어서 English
  //  탭에서도 한글 그대로 남아 있었다.)
  return translateWordsEn(scriptureRefsEn(stripKoreanDuplicates(translateNamesEn(rawDetail))))
    .replace(/\](?=[A-Za-z가-힣])/g, '] ')
    .replace(/찬송가\s*(\d+)\s*장/g, 'Hymn $1')
    .replace(/(\d+)\s*장/g, 'No. $1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
