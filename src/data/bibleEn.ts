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

/** 성경 참조(예: "창세기 1:31")를 영어로 — 책 이름만 사전에서 바꾸고 장:절은 그대로 둔다.
 * 사전에 없는 책이면(오타 등) 원문을 그대로 돌려준다 — 틀리게 보여주는 것보다 낫다. */
export function scriptureRefEn(reference: string): string {
  const m = reference.match(/^([가-힣0-9]+)\s*(.+)$/);
  if (!m) return reference;
  const en = BIBLE_BOOK_EN[m[1]];
  return en ? `${en} ${m[2]}` : reference;
}
