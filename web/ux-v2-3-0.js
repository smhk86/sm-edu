/* SM éducation v2.3.0 — exercise bank: resume where you stopped + a daily challenge subject. */
(function(){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ar=()=>typeof lang!=='undefined'&&lang==='ar';
 const fr=()=>typeof lang!=='undefined'&&lang==='fr';
 const tr=(a,f,e)=>ar()?a:fr()?f:e;
 const KEY='smExerciseLastSubject';
 const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){return {}}};
 const write=m=>{try{localStorage.setItem(KEY,JSON.stringify(m))}catch(e){}};
 const records=()=>typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords)?exerciseBankRecords:[];
 const gradeNow=()=>typeof grade!=='undefined'?grade:'';
 /* same subject for everyone on the same day and grade, different the next day */
 window.sm230DailySubject=function(g,subjects,day){
  const list=[...subjects].sort();if(!list.length)return '';
  let h=0;const s=String(day)+'|'+String(g);for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
  return list[h%list.length];
 };
 const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const oldRender=window.renderExerciseBank;
 if(typeof oldRender==='function'){
  window.renderExerciseBank=function(subject){
   try{if(typeof subject==='string'&&subject){const m=read();m[gradeNow()]=subject;write(m)}}catch(e){}
   return oldRender.apply(this,arguments);
  };
 }
 window.sm230OpenSubject=function(btn){const s=btn&&btn.dataset&&btn.dataset.subject;if(s&&typeof window.renderExerciseBank==='function')window.renderExerciseBank(s)};
 const oldHome=window.exerciseBankHomePage;
 if(typeof oldHome==='function'){
  window.exerciseBankHomePage=function(){
   let html=oldHome();
   const g=gradeNow(),rows=records().filter(x=>x.grade===g),subjects=[...new Set(rows.map(x=>x.subject))];
   if(!subjects.length)return html;
   const count=s=>rows.filter(x=>x.subject===s).length;
   const last=read()[g],resume=last&&subjects.includes(last)?last:'',daily=window.sm230DailySubject(g,subjects,today());
   const card=(kicker,title,s,cta)=>`<div class="v230-card"><span class="v230-kicker">${kicker}</span><b>${esc(title)}</b><small>${count(s)} ${tr('تمريناً','exercices','exercises')}</small><button type="button" class="primary-btn" data-subject="${esc(s)}" onclick="sm230OpenSubject(this)">${cta}</button></div>`;
   const block=`<section class="v230-quick panel">${resume?card(tr('تابع من حيث توقفت','Reprendre','Continue'),resume,resume,tr('أكمل','Continuer','Resume')):''}${daily?card(tr('تحدّي اليوم','Défi du jour','Today’s challenge'),daily,daily,tr('ابدأ التحدّي','Commencer','Start')):''}</section>`;
   return html.replace(/<h3 class="bank-section-title">/,block+'<h3 class="bank-section-title">');
  };
 }
})();
