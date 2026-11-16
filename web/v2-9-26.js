/* SM éducation v2.9.26 — parent progress comparison and actionable guidance. */
function familyDashboardPeriodMetrics(learner, progress, from, to){
 const id=learner?.id||'default',rows=(Array.isArray(progress)?progress:[]).filter(x=>x&&((x.learnerId===id)||(!x.learnerId&&id==='default'))&&String(x.date||'')>=from&&String(x.date||'')<=to);
 const total=rows.reduce((n,x)=>n+Math.max(0,Number(x.total)||0),0),correct=rows.reduce((n,x)=>{const t=Math.max(0,Number(x.total)||0);return n+Math.max(0,Math.min(t,Number(x.correct)||0))},0);
 const subjects={};rows.forEach(x=>{const key=String(x.subject||'—').trim()||'—',v=subjects[key]||(subjects[key]={total:0,correct:0,activities:0}),t=Math.max(0,Number(x.total)||0);v.total+=t;v.correct+=Math.max(0,Math.min(t,Number(x.correct)||0));v.activities++});
 return {activities:rows.length,total,correct,accuracy:total?Math.round(correct/total*100):null,subjects:Object.entries(subjects).map(([subject,v])=>({subject,total:v.total,activities:v.activities,accuracy:v.total?Math.round(v.correct/v.total*100):null})).sort((a,b)=>(a.accuracy??101)-(b.accuracy??101))};
}
function familyDashboardComparison(learner, progress, now=new Date()){
 const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()),start=new Date(end);start.setDate(start.getDate()-29);const previousEnd=new Date(start);previousEnd.setDate(previousEnd.getDate()-1);const previousStart=new Date(previousEnd);previousStart.setDate(previousStart.getDate()-29);
 const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const current=familyDashboardPeriodMetrics(learner,progress,fmt(start),fmt(end)),previous=familyDashboardPeriodMetrics(learner,progress,fmt(previousStart),fmt(previousEnd));
 const delta=current.accuracy===null||previous.accuracy===null?null:current.accuracy-previous.accuracy;
 const focus=current.subjects.find(x=>x.total>=5&&x.accuracy!==null&&x.accuracy<70)||current.subjects.find(x=>x.total>=5&&x.accuracy!==null);
 let recommendation='اجعل المراجعة قصيرة ومنتظمة، ثم أعد التقييم بأسئلة جديدة.';
 if(focus)recommendation=`خصص جلستين قصيرتين لمراجعة ${focus.subject}، ثم تحقق من الفهم بخمسة أسئلة جديدة على الأقل.`;
 else if(current.total<5)recommendation='اجمع نتائج تدريب إضافية قبل تحديد مادة تحتاج إلى دعم؛ البيانات الحالية غير كافية.';
 else recommendation='حافظ على المراجعة المتوازنة، وواصل تسجيل النتائج لمراقبة التطور.';
 return {current,previous,delta,focus,recommendation,from:fmt(start),to:fmt(end),previousFrom:fmt(previousStart),previousTo:fmt(previousEnd)};
}
const familyDashboardPanelV2925=familyDashboardPanel;
familyDashboardPanel=function(){
 const base=familyDashboardPanelV2925();if(!base)return base;
 const learners=typeof getLearners==='function'?getLearners():[],progress=typeof getProgress==='function'?getProgress():[],ar=lang==='ar',fr=lang==='fr',L=(a,f,e)=>ar?a:fr?f:e;
 const cards=learners.map(learner=>{const m=familyDashboardComparison(learner,progress),delta=m.delta===null?L('لا توجد مقارنة كافية','Comparaison insuffisante','Not enough data'):`${m.delta>0?'+':''}${m.delta} ${L('نقطة مئوية','points','pp')}`,tone=m.delta===null?'':m.delta>0?'trend-up':m.delta<0?'trend-down':'trend-flat';return `<article class="fd-compare-card"><div class="fd-compare-title"><b>${escapeReviewText(learner.name||L('تلميذ','Élève','Learner'))}</b><span class="${tone}">${delta}</span></div><div class="fd-compare-grid"><div><strong>${m.current.accuracy===null?'—':m.current.accuracy+'%'}</strong><small>${L('آخر 30 يوماً','30 derniers jours','Current 30 days')}</small></div><div><strong>${m.previous.accuracy===null?'—':m.previous.accuracy+'%'}</strong><small>${L('30 يوماً السابقة','30 jours précédents','Previous 30 days')}</small></div><div><strong>${m.current.activities}</strong><small>${L('أنشطة الفترة','Activités','Activities')}</small></div></div><p>${L('التوصية: ','Conseil : ','Recommendation: ')}${escapeReviewText(m.recommendation)}</p>${m.focus?`<small>${L('مادة ذات أولوية: ','À renforcer : ','Support focus: ')}${escapeReviewText(m.focus.subject)} (${m.focus.accuracy}%)</small>`:''}</article>`}).join('');
 const heading=L('مقارنة شهرية وتوصيات المتابعة','Comparaison mensuelle et conseils','Monthly comparison & guidance');
 return base.replace('</section>',`<div class="fd-comparison"><h4>📈 ${heading}</h4><p>${L('مقارنة آخر 30 يوماً بالـ30 يوماً السابقة لكل تلميذ. لا تُعرض نسبة التغير عند نقص البيانات.','Comparaison des 30 derniers jours aux 30 jours précédents. Pas de variation affichée si les données sont insuffisantes.','Compares the latest 30 days with the preceding 30 days. Changes are withheld when evidence is insufficient.')}</p>${cards}</div></section>`);
}
const downloadFamilyDashboardReportV2925=downloadFamilyDashboardReport;
function downloadFamilyDashboardReport(){
 const learners=typeof getLearners==='function'?getLearners():[],progress=typeof getProgress==='function'?getProgress():[],rows=[['learner','grade','current_30d_activities','current_30d_answers','current_30d_accuracy','previous_30d_accuracy','accuracy_change_percentage_points','support_focus','recommendation']];
 learners.forEach(learner=>{const m=familyDashboardComparison(learner,progress);rows.push([learner.name||'',learner.grade||'',m.current.activities,m.current.total,m.current.accuracy===null?'':m.current.accuracy+'%',m.previous.accuracy===null?'':m.previous.accuracy+'%',m.delta===null?'':m.delta,m.focus?`${m.focus.subject}: ${m.focus.accuracy}%`:'',m.recommendation])});
 const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SM-SCHOOL-AI-family-monthly-comparison.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
