/* SM éducation v2.2.2 — focused practice and assessment experience. */
(function(){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ar=()=>typeof lang!=='undefined'&&lang==='ar';
 const fr=()=>typeof lang!=='undefined'&&lang==='fr';
 const tr=(a,f,e)=>ar()?a:fr()?f:e;
 const oldExercise=window.exerciseBankHomePage;
 if(typeof oldExercise==='function'){
  window.exerciseBankHomePage=function(){
   let html=oldExercise();
   const records=typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords)?exerciseBankRecords:[];
   const gradeNow=typeof grade!=='undefined'?grade:'';
   const rows=records.filter(x=>x.grade===gradeNow);
   const subjects=[...new Set(rows.map(x=>x.subject))];
   const count=rows.length;
   const search=`<section class="v222-bank-tools panel"><div class="v222-tools-title"><div><span class="v222-kicker">${tr('تدريب موجّه','Entraînement ciblé','Focused practice')}</span><h3>${tr('اعثر على تمرينك بسرعة','Trouvez un exercice rapidement','Find the right exercise')}</h3></div><span class="v222-total">${count} ${tr('تمريناً','exercices','exercises')}</span></div><label class="v222-search"><span aria-hidden="true">⌕</span><input id="v222SubjectSearch" type="search" placeholder="${tr('ابحث باسم المادة…','Rechercher une matière…','Search subjects…')}" autocomplete="off" oninput="sm222FilterSubjects(this.value)"></label><div class="v222-quick-filters"><button type="button" class="v222-chip active" onclick="sm222FilterSubjects('')">${tr('كل المواد','Toutes','All subjects')}</button><button type="button" class="v222-chip" onclick="sm222FilterSubjectStage('مبتدئ')">${tr('بداية سهلة','Débutant','Beginner')}</button><button type="button" class="v222-chip" onclick="sm222FilterSubjectStage('متقدم')">${tr('تحدّي متقدم','Avancé','Advanced')}</button></div><p class="v222-helper">${tr('اختر المادة لفتح التمارين، ثم صفِّ حسب الفصل والمهارة والصعوبة.','Choisissez une matière puis filtrez par trimestre, compétence et difficulté.','Choose a subject, then filter by term, skill and difficulty.')}</p></section>`;
   html=html.replace(/<h3 class="bank-section-title">/,search+'<h3 class="bank-section-title">');
   return html;
  };
 }
 window.sm222FilterSubjects=function(query){const q=String(query||'').trim().toLocaleLowerCase();document.querySelectorAll('.subject-grid .subject-card').forEach(card=>{card.hidden=!!q&&!card.textContent.toLocaleLowerCase().includes(q)});};
 window.sm222FilterSubjectStage=function(diff){
  const records=typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords)?exerciseBankRecords:[];
  const g=typeof grade!=='undefined'?grade:'';
  const eligible=new Set(records.filter(x=>x.grade===g&&x.difficulty===diff).map(x=>x.subject));
  document.querySelectorAll('.subject-grid .subject-card').forEach(card=>{const name=card.querySelector('strong')?.textContent||'';card.hidden=!eligible.has(name)});
  const input=document.getElementById('v222SubjectSearch');if(input)input.value='';
 };
 const oldTest=window.testBankHomePage;
 if(typeof oldTest==='function'){
  window.testBankHomePage=function(){
   let html=oldTest();
   const records=typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords)?exerciseBankRecords:[];
   const g=typeof bankTestSelection!=='undefined'?bankTestSelection.grade:'';
   const s=typeof bankTestSelection!=='undefined'?bankTestSelection.subject:'';
   const pool=records.filter(x=>x.grade===g&&(!s||x.subject===s));
   const terms=[1,2,3].map(n=>pool.filter(x=>String(x.term)===String(n)).length);
   const total=pool.length;
   const stats=`<section class="v222-test-overview"><div class="v222-test-stat"><span>📚</span><b>${total}</b><small>${tr('سؤال متاح للمادة','questions disponibles','available questions')}</small></div>${terms.map((n,i)=>`<div class="v222-test-stat"><span>${['①','②','③'][i]}</span><b>${n}</b><small>${tr('الفصل','Trimestre','Term')} ${i+1}</small></div>`).join('')}</section>`;
   html=html.replace('<section class="panel test-builder v2-builder">',''+stats+'<section class="panel test-builder v2-builder">');
   return html;
  };
 }
 document.addEventListener('click',e=>{if(e.target.closest('.v222-chip')){document.querySelectorAll('.v222-chip').forEach(b=>b.classList.toggle('active',b===e.target.closest('.v222-chip')))}});
})();
