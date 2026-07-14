package com.terry.handwritingreminder;

import android.app.Activity;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;

public class MainActivity extends Activity {
    private EditText sourceInput, titleInput;
    private Button dateButton, timeButton;
    private LocalDate selectedDate = LocalDate.now();
    private LocalTime selectedTime = LocalTime.of(9, 0);
    private boolean explicitTime = false;

    @Override protected void onCreate(Bundle savedInstanceState) { super.onCreate(savedInstanceState); setContentView(buildUi()); handleIntent(getIntent()); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleIntent(intent); }

    private View buildUi() {
        int pad = dp(20);
        ScrollView scroll = new ScrollView(this); scroll.setBackgroundColor(Color.rgb(244,247,252));
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(pad,pad,pad,pad);
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(label("손글씨 일정 도우미",26,true));
        TextView sub=label("Nebo에서 손글씨를 텍스트로 변환한 뒤 공유하세요.",15,false); sub.setTextColor(Color.DKGRAY); root.addView(sub,margins(0,6,0,18));
        root.addView(label("공유된 메모 또는 직접 입력",14,true));
        sourceInput=new EditText(this); sourceInput.setHint("예: 다음주 화요일 오후 3시 Doug 미팅"); sourceInput.setMinLines(5); sourceInput.setGravity(Gravity.TOP); sourceInput.setBackgroundColor(Color.WHITE); sourceInput.setPadding(dp(14),dp(12),dp(14),dp(12)); root.addView(sourceInput,margins(0,6,0,10));
        Button analyze=primaryButton("날짜와 시간 분석"); analyze.setOnClickListener(v->analyzeText()); root.addView(analyze,margins(0,0,0,22));
        root.addView(label("일정 제목",14,true));
        titleInput=new EditText(this); titleInput.setSingleLine(true); titleInput.setBackgroundColor(Color.WHITE); titleInput.setPadding(dp(14),dp(10),dp(14),dp(10)); root.addView(titleInput,margins(0,6,0,12));
        LinearLayout row=new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); dateButton=secondaryButton(""); timeButton=secondaryButton(""); dateButton.setOnClickListener(v->pickDate()); timeButton.setOnClickListener(v->pickTime()); row.addView(dateButton,new LinearLayout.LayoutParams(0,dp(52),1)); LinearLayout.LayoutParams tp=new LinearLayout.LayoutParams(0,dp(52),1); tp.setMargins(dp(8),0,0,0); row.addView(timeButton,tp); root.addView(row,margins(0,0,0,12));
        TextView note=label("기본 일정 길이: 1시간 · Google Calendar 저장 화면에서 알림을 선택할 수 있습니다.",13,false); note.setTextColor(Color.DKGRAY); root.addView(note,margins(0,0,0,18));
        Button add=primaryButton("Google Calendar에 추가"); add.setOnClickListener(v->openCalendar()); root.addView(add);
        TextView examples=label("인식 예시\n• 7/25 2pm HVAC PM\n• 8월 3일 오전 10시 SAT Meeting\n• 내일 오후 5시 교회 연습\n• 다음주 화요일 3시 Doug 미팅",14,false); examples.setTextColor(Color.DKGRAY); examples.setBackgroundColor(Color.WHITE); examples.setPadding(dp(14),dp(14),dp(14),dp(14)); root.addView(examples,margins(0,22,0,30));
        refreshButtons(); return scroll;
    }

    private void handleIntent(Intent intent) { if(intent!=null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) { String shared=intent.getStringExtra(Intent.EXTRA_TEXT); if(shared!=null && !shared.isBlank()){ sourceInput.setText(shared); analyzeText(); } } }
    private void analyzeText(){ ScheduleParser.Result r=ScheduleParser.parse(sourceInput.getText().toString(),LocalDate.now()); selectedDate=r.date; selectedTime=r.time; explicitTime=r.hasExplicitTime; titleInput.setText(r.title); refreshButtons(); Toast.makeText(this,"일정을 분석했습니다.",Toast.LENGTH_SHORT).show(); }
    private void pickDate(){ new DatePickerDialog(this,(view,year,month,day)->{ selectedDate=LocalDate.of(year,month+1,day); refreshButtons(); },selectedDate.getYear(),selectedDate.getMonthValue()-1,selectedDate.getDayOfMonth()).show(); }
    private void pickTime(){ new TimePickerDialog(this,(view,hour,minute)->{ selectedTime=LocalTime.of(hour,minute); explicitTime=true; refreshButtons(); },selectedTime.getHour(),selectedTime.getMinute(),false).show(); }
    private void refreshButtons(){ if(dateButton==null)return; dateButton.setText(String.format("날짜  %04d-%02d-%02d",selectedDate.getYear(),selectedDate.getMonthValue(),selectedDate.getDayOfMonth())); String suffix=explicitTime?"":" (기본)"; timeButton.setText(String.format("시간  %02d:%02d%s",selectedTime.getHour(),selectedTime.getMinute(),suffix)); }
    private void openCalendar(){ String title=titleInput.getText().toString().trim(); if(title.isEmpty()){Toast.makeText(this,"일정 제목을 입력하세요.",Toast.LENGTH_SHORT).show();return;} LocalDateTime start=LocalDateTime.of(selectedDate,selectedTime); long startMillis=start.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(); long endMillis=start.plusHours(1).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(); Intent intent=new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI).putExtra(CalendarContract.Events.TITLE,title).putExtra(CalendarContract.Events.DESCRIPTION,sourceInput.getText().toString()).putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME,startMillis).putExtra(CalendarContract.EXTRA_EVENT_END_TIME,endMillis); try{startActivity(intent);}catch(ActivityNotFoundException e){Toast.makeText(this,"캘린더 앱을 찾을 수 없습니다. Google Calendar를 설치해 주세요.",Toast.LENGTH_LONG).show();} }
    private TextView label(String text,int sp,boolean bold){TextView v=new TextView(this);v.setText(text);v.setTextSize(sp);v.setTextColor(Color.rgb(25,31,45));if(bold)v.setTypeface(v.getTypeface(),android.graphics.Typeface.BOLD);return v;}
    private Button primaryButton(String text){Button b=new Button(this);b.setText(text);b.setTextSize(16);b.setTextColor(Color.WHITE);b.setBackgroundColor(Color.rgb(36,87,197));b.setAllCaps(false);return b;}
    private Button secondaryButton(String text){Button b=new Button(this);b.setText(text);b.setTextSize(14);b.setTextColor(Color.rgb(25,31,45));b.setBackgroundColor(Color.WHITE);b.setAllCaps(false);return b;}
    private LinearLayout.LayoutParams margins(int l,int t,int r,int b){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);p.setMargins(dp(l),dp(t),dp(r),dp(b));return p;}
    private int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
}
