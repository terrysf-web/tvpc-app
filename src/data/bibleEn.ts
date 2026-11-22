// 성경책 이름(개역개정 한글 → 영어) — 66권 고정 목록이라 매주 바뀌지 않는다.
// sync-bulletin.mjs의 findBookIn()처럼 "요한1서/요한일서" 두 표기 모두 인식.
export const BIBLE_BOOK_EN: Record<string, string> = {
  창세기: 'Genesis', 출애굽기: 'Exodus', 레위기: 'Leviticus', 민수기: 'Numbers', 신명기: 'Deuteronomy',
  여호수아: 'Joshua', 사사기: 'Judges', 룻기: 'Ruth',
  사무엘상: '1 Samuel', 사무엘하: '2 Samuel', 열왕기상: '1 Kings', 열왕기하: '2 Kings',
  역대상: '1 Chronicles', 역대하: '2 Chronicles', 에스라: 'Ezra', 느헤미야: 'Nehemiah', 에스더: 'Esther',
  욥기: 'Job', 시편: 'Psalms', 잠언: 'Proverbs', 전도서: 'Ecclesiastes', 아가: 'Song of Songs',
  이사야: 'Isaiah', 예레미야: 'Jeremiah', 예레미야애가: 'Lamentations', 에스겔: 'Ezekiel', 다니엘: 'Daniel',
  호세아: 'Hosea', 요엘: 'Joel', 아모스: 'Amos', 오바댜: 'Obadiah', 요나: 'Jonah', 미가: 'Micah',
  나훔: 'Nahum', 하박국: 'Habakkuk', 스바냐: 'Zephaniah', 학개: 'Haggai', 스가랴: 'Zechariah', 말라기: 'Malachi',
  마태복음: 'Matthew', 마가복음: 'Mark', 누가복음: 'Luke', 요한복음: 'John', 사도행전: 'Acts',
  로마서: 'Romans', 고린도전서: '1 Corinthians', 고린도후서: '2 Corinthians', 갈라디아서: 'Galatians',
  에베소서: 'Ephesians', 빌립보서: 'Philippians', 골로새서: 'Colossians',
  데살로니가전서: '1 Thessalonians', 데살로니가후서: '2 Thessalonians',
  디모데전서: '1 Timothy', 디모데후서: '2 Timothy', 디도서: 'Titus', 빌레몬서: 'Philemon',
  히브리서: 'Hebrews', 야고보서: 'James', 베드로전서: '1 Peter', 베드로후서: '2 Peter',
  요한일서: '1 John', 요한1서: '1 John', 요한이서: '2 John', 요한2서: '2 John',
  요한삼서: '3 John', 요한3서: '3 John', 유다서: 'Jude', 요한계시록: 'Revelation',
};


/** 사전에 있는 책 이름을 긴 것부터 — "요한복음"이 "요한일서"보다 먼저 걸리지
 * 않도록(둘 다 "요한"으로 시작한다) 길이 순으로 세워 둔다.
 * 글자 사이에 띄어쓰기가 들어간 표기도 잡는다 — 주보에 "데살로니가 전서"처럼
 * 띄어 적힌 것이 실제로 있다. */
const BOOK_NAMES = Object.keys(BIBLE_BOOK_EN).sort((a, b) => b.length - a.length);
const BOOK_ALT = BOOK_NAMES.map((k) => k.split('').join('\\s*')).join('|');
const EN_BOOK_SET = new Set(Object.values(BIBLE_BOOK_EN));
const EN_ALT = [...EN_BOOK_SET].sort((a, b) => b.length - a.length).join('|');

// 앞 글자가 한글이면 다른 낱말의 일부다("아가"가 "좋아 가"에 걸리지 않게).
// 뒤에는 장·절 숫자가 와야 한다 — 그래야 평범한 글 속의 낱말을 안 건드린다.
const BOOK_RE = new RegExp(`(?<![가-힣])(${BOOK_ALT})\\s*(?=\\d)`, 'g');
// "데살로니가 전서 1 Thessalonians 5:16-18"처럼 한글·영어를 나란히 적어 둔 것
const BOOK_BILINGUAL_RE = new RegExp(`(?<![가-힣])(${BOOK_ALT})\\s*(${EN_ALT})`, 'g');

/**
 * 글 안에 섞여 있는 성경 참조를 전부 영어로 바꾼다 — "[하박국3:17-19]" →
 * "[Habakkuk 3:17-19]".
 *
 * scriptureRefEn()은 "창세기 1:31"처럼 참조만 들어 있는 문자열에만 쓸 수
 * 있었다. 그런데 주보의 예배 순서에는 "[하박국3:17-19]"처럼 대괄호 안에
 * 들어 있거나 설교자 이름과 한 줄에 같이 적힌 참조가 많아서, English로
 * 바꿔도 책 이름만 한글로 남아 섞여 보였다.
 *
 * 사전에 없는 책 이름은 그대로 둔다 — 틀리게 보여주는 것보다 낫다.
 */
export function scriptureRefsEn(text: string): string {
  if (!text) return text;
  return text
    // 한글·영어를 나란히 적었으면 영어만 남긴다
    .replace(BOOK_BILINGUAL_RE, (full, ko: string, en: string) =>
      BIBLE_BOOK_EN[ko.replace(/\s+/g, '')] === en ? en : full,
    )
    .replace(BOOK_RE, (full) => {
      const en = BIBLE_BOOK_EN[full.replace(/\s+/g, '')];
      return en ? `${en} ` : full;
    });
}

/** 성경 참조 한 건(예: "창세기 1:31")을 영어로 — 책 이름만 바꾸고 장:절은
 * 그대로 둔다. "데살로니가 전서 5:16"처럼 띄어 적힌 것도 같이 처리하려고
 * scriptureRefsEn()에 맡긴다. 사전에 없는 책이면 원문 그대로 둔다. */
export function scriptureRefEn(reference: string): string {
  return scriptureRefsEn(reference);
}

/**
 * 대괄호 안의 글이 성경 참조인지 — "[하박국 3:17-19]", "[이사야(Isaiah)43:1,4)]".
 *
 * 주보를 만드는 분이 찬양 곡 제목과 성경 본문에 똑같이 대괄호를 쓰셔서,
 * 앱이 본문까지 ♪ 배지(찬양)로 보여 주고 있었다. 책 이름으로 시작하고
 * 장·절 숫자가 따라오면 성경 참조로 본다.
 */
export function isScriptureRef(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // 영어로 이미 바뀐 뒤일 수도 있으니 두 가지 모두 본다
  const head = t.match(/^[가-힣\s]+/)?.[0]?.replace(/\s+/g, '') ?? '';
  const koBook = !!BIBLE_BOOK_EN[head];
  const enBook = EN_BOOK_SET.has(t.match(new RegExp(`^(${EN_ALT})`))?.[1] ?? '');
  return (koBook || enBook) && /\d{1,3}\s*[:：]\s*\d{1,3}/.test(t);
}
