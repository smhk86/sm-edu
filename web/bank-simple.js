/* SM éducation — exercise bank home: grade → exercise generator → Raji3DZ library. (Text exercise bank removed from this page.) */
(function(g){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L=()=>typeof lang!=='undefined'?lang:'ar';
const tr=(a,f,e)=>L()==='ar'?a:L()==='fr'?f:e;
function home(){
  const gr=typeof grade!=='undefined'?grade:'';
  const grades=(typeof levels!=='undefined')?levels.primary.concat(levels.middle,levels.secondary):[gr];
  const gradeSel=`<label style="display:block;margin:.5rem 0">${tr('السنة الدراسية','Année scolaire','School grade')}<select id="exerciseGradeSelect" onchange="chooseExerciseGrade(this.value)">${grades.map(x=>`<option value="${esc(x)}"${x===gr?' selected':''}>${esc(x)}</option>`).join('')}</select></label>`;
  const gen=(g.SM_PRACTICE&&g.SM_PRACTICE.panelHtml)?g.SM_PRACTICE.panelHtml():'';
  const lib=typeof g.raji3dzPanel==='function'?g.raji3dzPanel(gr):'';
  return `${sectionHead(tr('مولّد التمارين وبنك الامتحانات','Générateur d’exercices et banque d’examens','Exercise generator and exam bank'),gr)}<div class="panel">${gradeSel}</div>${gen}${lib}`;
}
g.exerciseBankHomePage=home;
g.SM_BANK_SIMPLE={home};
})(window);
