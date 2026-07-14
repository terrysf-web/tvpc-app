package com.terry.handwritingreminder;

import java.text.Normalizer;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ScheduleParser {
    private ScheduleParser() {}
    public static final class Result { public String title; public LocalDate date; public LocalTime time; public boolean hasExplicitTime; }

    public static Result parse(String source, LocalDate today) {
        Result r=new Result(); String text=source==null?"":Normalizer.normalize(source.trim(),Normalizer.Form.NFKC);
        r.date=parseDate(text,today); TimeMatch tm=parseTime(text); r.time=tm.time; r.hasExplicitTime=tm.explicit; r.title=cleanTitle(text); if(r.title.isBlank())r.title="새 일정"; return r;
    }
    private static LocalDate parseDate(String text,LocalDate today){
        String lower=text.toLowerCase(Locale.US);
        if(lower.contains("모레")||lower.contains("day after tomorrow"))return today.plusDays(2);
        if(lower.contains("내일")||lower.contains("tomorrow"))return today.plusDays(1);
        if(lower.contains("오늘")||lower.contains("today"))return today;
        Matcher iso=Pattern.compile("\\b(20\\d{2})[./-](\\d{1,2})[./-](\\d{1,2})\\b").matcher(text); if(iso.find())return safe(Integer.parseInt(iso.group(1)),Integer.parseInt(iso.group(2)),Integer.parseInt(iso.group(3)),today);
        Matcher ko=Pattern.compile("(?:(20\\d{2})년\\s*)?(\\d{1,2})월\\s*(\\d{1,2})일").matcher(text); if(ko.find())return infer(ko.group(1)==null?null:Integer.parseInt(ko.group(1)),Integer.parseInt(ko.group(2)),Integer.parseInt(ko.group(3)),today);
        Matcher slash=Pattern.compile("(?<!\\d)(\\d{1,2})[./-](\\d{1,2})(?!\\d)").matcher(text); if(slash.find())return infer(null,Integer.parseInt(slash.group(1)),Integer.parseInt(slash.group(2)),today);
        DayOfWeek dow=weekday(lower); if(dow!=null){ boolean next=lower.contains("다음주")||lower.contains("다음 주")||lower.contains("next week"); LocalDate d=today.with(TemporalAdjusters.nextOrSame(dow)); if(next){LocalDate mon=today.with(TemporalAdjusters.next(DayOfWeek.MONDAY));d=mon.with(TemporalAdjusters.nextOrSame(dow));}else if(d.equals(today))d=d.plusWeeks(1); return d; }
        return today;
    }
    private static LocalDate infer(Integer year,int m,int d,LocalDate today){int y=year==null?today.getYear():year;LocalDate x=safe(y,m,d,today);if(year==null&&x.isBefore(today.minusDays(1)))x=safe(y+1,m,d,today);return x;}
    private static LocalDate safe(int y,int m,int d,LocalDate fallback){try{return LocalDate.of(y,m,d);}catch(Exception e){return fallback;}}
    private static final class TimeMatch{LocalTime time=LocalTime.of(9,0);boolean explicit=false;}
    private static TimeMatch parseTime(String text){TimeMatch r=new TimeMatch();String lower=text.toLowerCase(Locale.US);Matcher c=Pattern.compile("(?<!\\d)([01]?\\d|2[0-3]):([0-5]\\d)(?!\\d)").matcher(lower);if(c.find()){r.time=LocalTime.of(Integer.parseInt(c.group(1)),Integer.parseInt(c.group(2)));r.explicit=true;return r;}Matcher en=Pattern.compile("(?<!\\d)(1[0-2]|0?[1-9])(?:[:.]([0-5]\\d))?\\s*(am|pm)\\b").matcher(lower);if(en.find()){int h=Integer.parseInt(en.group(1)),m=en.group(2)==null?0:Integer.parseInt(en.group(2));if(en.group(3).equals("pm")&&h!=12)h+=12;if(en.group(3).equals("am")&&h==12)h=0;r.time=LocalTime.of(h,m);r.explicit=true;return r;}Matcher ko=Pattern.compile("(오전|오후)?\\s*(\\d{1,2})시(?:\\s*(\\d{1,2})분)?").matcher(text);if(ko.find()){int h=Integer.parseInt(ko.group(2)),m=ko.group(3)==null?0:Integer.parseInt(ko.group(3));String ap=ko.group(1);if("오후".equals(ap)&&h<12)h+=12;if("오전".equals(ap)&&h==12)h=0;if(ap==null&&h>=1&&h<=6)h+=12;if(h<=23&&m<=59){r.time=LocalTime.of(h,m);r.explicit=true;}}return r;}
    private static DayOfWeek weekday(String s){String[][] n={{"월요일","monday"},{"화요일","tuesday"},{"수요일","wednesday"},{"목요일","thursday"},{"금요일","friday"},{"토요일","saturday"},{"일요일","sunday"}};DayOfWeek[] d=DayOfWeek.values();for(int i=0;i<n.length;i++)for(String x:n[i])if(s.contains(x))return d[i];return null;}
    private static String cleanTitle(String t){t=t.replaceAll("(?i)\\b20\\d{2}[./-]\\d{1,2}[./-]\\d{1,2}\\b|(?:20\\d{2}년\\s*)?\\d{1,2}월\\s*\\d{1,2}일|(?<!\\d)\\d{1,2}[./-]\\d{1,2}(?!\\d)"," ");t=t.replaceAll("(?i)(?<!\\d)(?:[01]?\\d|2[0-3]):[0-5]\\d(?!\\d)|(?<!\\d)(?:1[0-2]|0?[1-9])(?:[:.]?[0-5]\\d)?\\s*(?:am|pm)\\b|(?:오전|오후)?\\s*\\d{1,2}시(?:\\s*\\d{1,2}분)?"," ");t=t.replaceAll("(?i)오늘|내일|모레|today|tomorrow|day after tomorrow|다음\\s*주|월요일|화요일|수요일|목요일|금요일|토요일|일요일|monday|tuesday|wednesday|thursday|friday|saturday|sunday"," ");return t.replaceAll("^[\\s,;:\\-–—]+|[\\s,;:\\-–—]+$","").replaceAll("\\s+"," ").trim();}
}
