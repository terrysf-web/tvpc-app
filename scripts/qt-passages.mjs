/**
 * 생명의 삶(두란노 QT) 월별 본문표 읽기.
 *
 * 두란노 QT 공지사항에 매달 "YYYY년 M월호 본문 알려 드립니다" 글이 올라오고,
 * 그 안에 날짜별 본문 범위(예: "1 / 시 107:1~22")가 적혀 있다. 로그인 없이
 * 볼 수 있는 이 표에서 "본문 범위"만 가져오고, 실제 성경 본문은 앱이 가진
 * 개역한글에서 뽑아 쓴다(두란노의 묵상 글은 가져오지 않는다).
 */

/** 성경 약자 → 앱 성경 데이터의 책 이름 */
export const BOOK_ABBR = {
  창: '창세기', 출: '출애굽기', 레: '레위기', 민: '민수기', 신: '신명기',
  수: '여호수아', 삿: '사사기', 룻: '룻기', 삼상: '사무엘상', 삼하: '사무엘하',
  왕상: '열왕기상', 왕하: '열왕기하', 대상: '역대상', 대하: '역대하',
  스: '에스라', 느: '느헤미야', 에: '에스더', 욥: '욥기', 시: '시편',
  잠: '잠언', 전: '전도서', 아: '아가', 사: '이사야', 렘: '예레미야',
  애: '예레미야애가', 겔: '에스겔', 단: '다니엘', 호: '호세아', 욜: '요엘',
  암: '아모스', 옵: '오바댜', 욘: '요나', 미: '미가', 나: '나훔',
  합: '하박국', 습: '스바냐', 학: '학개', 슥: '스가랴', 말: '말라기',
  마: '마태복음', 막: '마가복음', 눅: '누가복음', 요: '요한복음', 행: '사도행전',
  롬: '로마서', 고전: '고린도전서', 고후: '고린도후서', 갈: '갈라디아서',
  엡: '에베소서', 빌: '빌립보서', 골: '골로새서', 살전: '데살로니가전서',
  살후: '데살로니가후서', 딤전: '디모데전서', 딤후: '디모데후서', 딛: '디도서',
  몬: '빌레몬서', 히: '히브리서', 약: '야고보서', 벧전: '베드로전서',
  벧후: '베드로후서', 요일: '요한일서', 요이: '요한2서', 요삼: '요한3서',
  유: '유다서', 계: '요한계시록',
};

/** HTML → 줄 단위 텍스트 (<br>을 줄바꿈으로) */
export function htmlToLines(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim());
}

/**
 * 본문표 글 → 날짜별 본문.
 * "1" 줄 다음에 "시 107:1~22" 줄이 오는 형식이며,
 * "겔 29:17~30:9"처럼 장을 넘어가는 범위도 지원한다.
 */
export function parseQtNotice(html) {
  const lines = htmlToLines(html);
  const out = new Map();
  let day = null;
  for (const line of lines) {
    if (!line) continue;
    const dayOnly = line.match(/^(\d{1,2})$/);
    if (dayOnly) {
      const n = Number(dayOnly[1]);
      if (n >= 1 && n <= 31) day = n;
      continue;
    }
    const m = line.match(
      /^([가-힣]{1,2}(?:전|후|상|하|일|이|삼)?)\s*(\d{1,3}):(\d{1,3})\s*(?:[~\-–]\s*(?:(\d{1,3}):)?(\d{1,3}))?$/,
    );
    if (!m) continue;
    // "1 시 107:1~22"처럼 한 줄에 날짜가 같이 오는 경우도 허용
    const book = BOOK_ABBR[m[1]];
    if (!book || day == null) continue;
    const ch1 = Number(m[2]);
    const v1 = Number(m[3]);
    const ch2 = m[4] ? Number(m[4]) : ch1;
    const v2 = m[5] ? Number(m[5]) : v1;
    if (!out.has(day)) out.set(day, { book, ch1, v1, ch2, v2 });
    day = null;
  }
  return out;
}

/** 공지 목록에서 해당 연·월 본문표 글 주소 찾기 */
export function findNoticeUrl(listHtml, year, month) {
  const re = /notice_detail\.asp\?sn=(\d+)[^']*'"[^>]*>\s*<span>([^<]*)<\/span>/g;
  for (const m of listHtml.matchAll(re)) {
    const title = m[2].replace(/\s+/g, ' ');
    if (title.includes(`${year}년`) && title.includes(`${month}월호`) && title.includes('본문')) {
      return `https://www.duranno.com/qt/view/notice_detail.asp?sn=${m[1]}&page=notice`;
    }
  }
  return null;
}

/**
 * 해당 달의 생명의 삶 본문표를 가져온다.
 * @param {(url: string) => Promise<string>} fetchText 페이지를 한글로 읽어 오는 함수
 * @returns {Promise<Map<number, {book,ch1,v1,ch2,v2}>>}
 */
export async function fetchQtMonth(year, month, fetchText) {
  for (const pg of [1, 2]) {
    const list = await fetchText(
      `https://www.duranno.com/qt/view/notice.asp?page=notice&pg=${pg}`,
    );
    const url = findNoticeUrl(list, year, month);
    if (!url) continue;
    return { url, days: parseQtNotice(await fetchText(url)) };
  }
  return { url: null, days: new Map() };
}
