/** 일회성 — 교회 홈페이지 달력 원본에서 한 낱말이 들어간 일정을 그대로 본다. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
const find = (process.env.FIND || '성찬').trim();

async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

for (const page of ['https://tvpc.church/wp/ko/calendar/', 'https://tvpc.church/wp/calendar/']) {
  const html = await get(page);
  console.log(`\n=== ${page} — ${html ? Math.round(html.length / 1024) + 'KB' : '못 받음'} ===`);
  if (!html) continue;
  const re = /<ul class="events" aria-labelledby="[^"]*?(\d{8})">([\s\S]*?)<\/ul>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, d8, block] = m;
    if (!block.includes(find)) continue;
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`  ${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6)}  ${text.slice(0, 180)}`);
    if (process.env.RAW) {
      for (const li of block.split(/<li[\s>]/).slice(1)) {
        if (!li.includes(find)) continue;
        console.log(`      RAW ${li.replace(/\s+/g, ' ').trim().slice(0, 900)}`);
      }
    }
  }
}

for (const ics of [
  'https://tvpc.church/wp/events/?ical=1',
  'https://tvpc.church/wp/?post_type=tribe_events&ical=1',
  'https://calendar.google.com/calendar/ical/c_a99f28d37872a22d1f6c20ee9aaf0d24cbf7db13d0161df1bc4dea20667fb598%40group.calendar.google.com/public/basic.ics',
]) {
  const t = await get(ics);
  console.log(`\n=== ${ics} — ${t ? Math.round(t.length / 1024) + 'KB' : '못 받음'} ===`);
  if (!t) continue;
  for (const b of t.split('BEGIN:VEVENT').slice(1)) {
    if (!b.includes(find)) continue;
    const g = (k) => b.match(new RegExp(`^${k}[^:]*:(.*)$`, 'm'))?.[1]?.trim() ?? '';
    console.log(
      `  SUMMARY=${g('SUMMARY')}  DTSTART=${g('DTSTART')}  DTEND=${g('DTEND')}` +
        `  RRULE=${g('RRULE')}  UID=${g('UID').slice(0, 40)}`,
    );
  }
}
