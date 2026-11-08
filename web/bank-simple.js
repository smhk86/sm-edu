/* SM éducation — simplified exercise bank home: grade → generator (subject, term, difficulty, count) → optional browse. */
(function(g){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L=()=>typeof lang!=='undefined'?lang:'ar';
const tr=(a,f,e)=>L()==='ar'?a:L()==='fr'?f:e;
function home(){
  const recs=(typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords))?exerciseBankRecords:[];
  const gr=typeof grade!=='undefined'?grade:'';
  const rows=recs.filter(x=>x.grade===gr);
  const subs=[...new Set(rows.map(x=>x.subject))];
  const grades=(typeof levels!=='undefined')?levels.primary.concat(levels.middle,levels.secondary):[gr];
  const gradeSel=`<label style="display:block;margin:.5rem 0">${tr('السنة الدراسية','Année scolaire','School grade')}<select id="exerciseGradeSelect" onchange="chooseExerciseGrade(this.value)">${grades.map(x=>`<option value="${esc(x)}"${x===gr?' selected':''}>${esc(x)}</option>`).join('')}</select></label>`;
  const gen=(g.SM_PRACTICE&&g.SM_PRACTICE.panelHtml)?g.SM_PRACTICE.panelHtml():'';
  const browse=subs.length?`<details class="bank-browse" style="margin-top:1rem"><summary style="cursor:pointer;font-weight:700">${tr('تصفّح البنك حسب المادة','Parcourir par matière','Browse by subject')} · ${subs.length}</summary><div class="subject-grid" style="margin-top:.6rem">${subs.map(s=>{const n=rows.filter(x=>x.subject===s).length;return `<div class="subject-card" data-subject="${esc(s)}" onclick="renderExerciseBank(this.dataset.subject)"><strong>${esc(s)}</strong><span class="pill">${n} ${tr('تمارين','exercices','exercises')}</span></div>`}).join('')}</div></details>`:`<div class="notice">${tr('جارٍ تحميل بنك التمارين...','Chargement…','Loading…')}</div>`;
  return `${sectionHead(tr('مولّد التمارين','Générateur d’exercices','Exercise generator'),gr)}<div class="panel">${gradeSel}</div>${gen}${browse}`;
}
g.exerciseBankHomePage=home;
g.SM_BANK_SIMPLE={home};
})(window);
