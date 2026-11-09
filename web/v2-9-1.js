/* SM EDUCATION v2.9.1 — dedicated Algerian curriculum generator and navigation cleanup. */
(function(g){'use strict';
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{version:'2.9.1',focus:'dedicated-curriculum-generator-pdf-arabic-ux',features:(prior.features||[]).concat(['dedicated-generator-all-grades-bank','term-difficulty-duration-points','answer-key-marking-scheme','raji3dz-reference-entry','remove-progress-navigation','remove-textbook-navigation','arabic-pdf-text-layer-typography'])});
 const $=id=>document.getElementById(id), esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const grades=['الأولى ابتدائي','الثانية ابتدائي','الثالثة ابتدائي','الرابعة ابتدائي','الخامسة ابتدائي','الأولى متوسط','الثانية متوسط','الثالثة متوسط','الرابعة متوسط','الأولى ثانوي','الثانية ثانوي','الثالثة ثانوي'];
 const lang=()=>g.lang||'ar';
 const records=()=>typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords)?exerciseBankRecords:[];
 const selected=()=>({grade:$('smGenGrade')?.value||g.grade||grades[0],subject:$('smGenSubject')?.value||'',term:Number($('smGenTerm')?.value||1),difficulty:$('smGenDifficulty')?.value||'mixed',count:Number($('smGenCount')?.value||8),minutes:Number($('smGenMinutes')?.value||60),points:Number($('smGenPoints')?.value||20)});
 function subjectsFor(gr){return [...new Set(records().filter(x=>x.grade===gr).map(x=>x.subject))].sort((a,b)=>a.localeCompare(b,'ar'))}
 function options(xs,cur){return xs.map(x=>`<option value="${esc(x)}"${x===cur?' selected':''}>${esc(x)}</option>`).join('')}
 function page(){
  const currentGrade=typeof grade!=='undefined'?grade:grades[0],gr=grades.includes(currentGrade)?currentGrade:grades[0],subs=subjectsFor(gr),subject=subs.includes('الرياضيات')?'الرياضيات':(subs[0]||'');
  return `<section class="panel sm-generator">
   <div class="generator-heading"><div class="generator-icon">✨</div><div><h2>المولّد الذكي للتمارين والاختبارات</h2><p>إنشاء مواضيع تدريبية مع الحلول والتصحيح وسلم التنقيط، حسب الطور والمادة والفصل.</p></div></div>
   <div class="generator-grid">
    <label>الطور والسنة<select id="smGenGrade" onchange="SM_GENERATOR.gradeChanged()">${options(grades,gr)}</select></label>
    <label>المادة<select id="smGenSubject">${options(subs,subject)}</select></label>
    <label>الفصل الدراسي<select id="smGenTerm">${options(['1','2','3'],'1')}</select></label>
    <label>مستوى الصعوبة<select id="smGenDifficulty">${options([{v:'easy',t:'سهل'},{v:'medium',t:'متوسط'},{v:'hard',t:'صعب'},{v:'mixed',t:'متدرج'}].map(x=>x.v),'mixed')}</select></label>
    <label>عدد التمارين<select id="smGenCount">${options(['5','8','10','12','15'],'8')}</select></label>
    <label>مدة الاختبار (دقيقة)<input id="smGenMinutes" type="number" min="10" max="240" value="60"></label>
    <label>العلامة الكلية<input id="smGenPoints" type="number" min="1" max="100" value="20"></label>
   </div>
   <div class="generator-actions"><button class="primary-btn" onclick="SM_GENERATOR.generate()">إنشاء التمارين / الاختبار</button><button class="secondary-btn" onclick="SM_GENERATOR.generate(true)">موضوع جديد متنوع</button></div>
   <div class="notice" style="margin-top:12px">المحتوى من بنك المنصة والمولّدات الحسابية المتاحة. مواءمة التدرج السنوي الرسمي تحتاج مراجعة بشرية؛ لا يُعرض المحتوى على أنه موضوع رسمي.</div>
   <div class="generator-actions"><button class="secondary-btn" onclick="SM_GENERATOR.raji()">فتح مرجع Raji3DZ</button></div>
   <div id="smGeneratorResult" class="generator-result" aria-live="polite"></div>
  </section>`;
 }
 function updateSubjects(){
  const gr=$('smGenGrade')?.value,el=$('smGenSubject');if(!el)return;
  const subs=subjectsFor(gr);el.innerHTML=options(subs,subs.includes('الرياضيات')?'الرياضيات':subs[0]||'');
 }
 function bankPool(s){
  return records().filter(x=>x.grade===s.grade&&x.subject===s.subject&&Number(x.term)===s.term);
 }
 function generatedByExisting(s){
  if(g.SM_LOCAL_EXAM&&typeof g.SM_LOCAL_EXAM.practiceItems==='function'){
   const r=g.SM_LOCAL_EXAM.practiceItems(s.grade,s.subject,s.term,s.count,s.difficulty);
   if(r&&r.items&&r.items.length)return r.items.map(x=>({topic:x.topic||'',question:x.question,answer:x.answer||'',explanation:x.explanation||'',steps:x.steps||x.solution_steps||[],choices:x.choices||[]}));
  }
  return [];
 }
 function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
 function make(){
  const s=selected(),all=bankPool(s),pool=shuffle(all),out=[];
  if(s.difficulty!=='mixed'){
   const ar={easy:'مبتدئ',medium:'متوسط',hard:'متقدم'}[s.difficulty];
   const matched=pool.filter(x=>x.difficulty===ar);if(matched.length)pool.splice(0,pool.length,...matched);
  }
  for(let i=0;i<Math.min(s.count,pool.length);i++){
   const x=pool[i];out.push({topic:x.topic||x.lesson||'',question:x.question,answer:x.solution||'',explanation:x.explanation||'',steps:x.solution_steps||[],choices:x.choices||[]});
  }
  return out;
 }
 function generate(){
  const s=selected(),mount=$('smGeneratorResult');if(!mount)return;
  if(!s.subject){mount.innerHTML='<p class="notice">لا توجد مواد مسجلة لهذه السنة في بنك المحتوى حالياً.</p>';return}
  let qs=generatedByExisting(s),source='مولّد المنصة';
  if(!qs.length){qs=make();source='بنك التمارين المحلي'}
  if(!qs.length){mount.innerHTML='<p class="notice">لا تتوفر أسئلة كافية لهذه المادة والفصل في قاعدة البيانات الحالية. اختر مادة أو فصلاً آخر، أو أضف محتوى موثقاً إلى البنك.</p>';return}
  const total=Math.max(1,s.points),base=Math.floor(total/qs.length),extra=total-base*qs.length;
  const paper=`<article class="generator-paper"><h3>موضوع تدريبي: ${esc(s.subject)} — ${esc(s.grade)}</h3><p>الفصل ${s.term} · المدة ${s.minutes} دقيقة · العلامة ${total} · الصعوبة ${({easy:'سهل',medium:'متوسط',hard:'صعب',mixed:'متدرج'})[s.difficulty]}</p><hr>${qs.map((q,i)=>`<section class="generator-question"><b>السؤال ${i+1} (${base+(i<extra?1:0)} ن)</b><p>${esc(q.question)}</p>${q.choices?.length?`<ul>${q.choices.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}</section>`).join('')}</article>`;
  const key=`<article class="generator-paper"><h3>التصحيح النموذجي وسلم التنقيط</h3>${qs.map((q,i)=>`<section class="generator-question"><b>السؤال ${i+1} — ${base+(i<extra?1:0)} ن</b><p><b>الإجابة:</b> ${esc(q.answer||'راجع خطوات الحل')}</p>${q.steps?.length?`<ol>${q.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}<p>${esc(q.explanation||'')}</p><small>توزيع النقاط: يمنح رصيد السؤال عند صحة النتيجة واحترام خطوات الحل.</small></section>`).join('')}</article>`;
  mount.innerHTML=`<div class="learning-meta"><b>${esc(source)} · ${qs.length} سؤالاً</b><span class="pill">${esc(s.grade)}</span></div>${paper}<details class="generator-paper"><summary><b>إظهار الحلول والتصحيح النموذجي</b></summary>${key}</details><div class="generator-actions"><button class="primary-btn" onclick="SM_GENERATOR.print()">طباعة / حفظ PDF</button><button class="secondary-btn" onclick="SM_GENERATOR.generate()">توليد موضوع آخر</button></div>`;
  g.SM_GENERATOR.last={paper,key,subject:s.subject,grade:s.grade,term:s.term};
 }
 function printPaper(){if(!g.SM_GENERATOR.last)return;const x=g.SM_GENERATOR.last,w=window.open('','_blank');if(!w){alert('اسمح بفتح نافذة الطباعة من إعدادات المتصفح.');return}w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>موضوع تدريبي</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.8}article{margin-bottom:20px}li{margin:5px 0}</style>${x.paper}${x.key}</html>`);w.document.close();w.focus();w.print()}
 function raji(){if(g.SM_RAJI3DZ&&typeof g.raji3dzPanel==='function'){g.go('teacher');setTimeout(()=>{const p=document.getElementById('rjLib');if(p)p.scrollIntoView({behavior:'smooth'})},250)}else alert('مكتبة Raji3DZ غير متاحة في هذه النسخة.')}
 g.SM_GENERATOR={gradeChanged:updateSubjects,generate,print:printPaper,raji};
 g.smGeneratorPage=page;
})(window);
