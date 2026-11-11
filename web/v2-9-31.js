/* SM EDUCATION v2.9.31 — Smart Teacher knowledge traceability guard. */
(function(g){'use strict';
 let audit=null,loadPromise=null;
 function load(){if(audit)return Promise.resolve(audit);if(loadPromise)return loadPromise;loadPromise=g.fetch('./data/teacher-knowledge-integrity-2026-2027.json').then(r=>{if(!r.ok)throw new Error('Teacher knowledge integrity index unavailable');return r.json()}).then(d=>{if(!d||!Array.isArray(d.deep_content_links)||!d.summary)throw new Error('Invalid teacher knowledge integrity index');audit=d;return d}).catch(e=>{loadPromise=null;throw e});return loadPromise}
 function stats(){return audit?Object.assign({},audit.summary):null}
 function context(p){if(!audit)return 'فهرس تتبع مصادر قاعدة المعلم الذكي غير متاح؛ لا تدّعِ التحقق من روابط المصادر.';const rows=typeof g.smTeacherDeepContentSearch==='function'?g.smTeacherDeepContentSearch(Object.assign({},p||{},{limit:10})):[];const byId=new Map(audit.deep_content_links.map(x=>[x.deep_lesson_id,x]));const selected=rows.map(r=>byId.get(String(r.lesson_id||''))).filter(Boolean);const refs=selected.reduce((n,r)=>n+r.matched_source_count,0);const unmatched=selected.reduce((n,r)=>n+r.unmatched_source_ids.length,0);return `تتبع قاعدة المعلم الذكي v2.9.31: ${selected.length} من ${rows.length} سجلات المحتوى المسترجعة لها سجل تتبع مطابق؛ ${refs} إحالة تمرين مرتبطة بمصدرها داخل الموسوعة؛ إحالات غير متطابقة: ${unmatched}. هذا فحص بنيوي للروابط فقط، ولا يثبت صحة المحتوى أو مطابقته الرسمية. لا توجد في الفهرس سجلات مثبتة التحقق الرسمي من المنهاج.`}
 g.smTeacherKnowledgeIntegrityReady=load();g.smTeacherKnowledgeIntegrityStats=stats;g.smTeacherKnowledgeIntegrityContext=context;
 const oldDeep=g.smTeacherDeepContentContext;if(typeof oldDeep==='function')g.smTeacherDeepContentContext=function(p){return oldDeep(p)+'\n\n'+context(p)};
 const oldReview=g.smTeacherBuildReviewContext,oldExam=g.smTeacherBuildExamPrompt;
 if(typeof oldReview==='function')g.smTeacherBuildReviewContext=p=>oldReview(p)+'\n\n'+context(p);
 if(typeof oldExam==='function')g.smTeacherBuildExamPrompt=p=>oldExam(p)+'\n\n'+context(p);
 g.SM_EDUCATION_RELEASE=g.SM_EDUCATION_RELEASE||{};g.SM_EDUCATION_RELEASE.version='2.9.31';g.SM_EDUCATION_RELEASE.features=Object.assign({},g.SM_EDUCATION_RELEASE.features||{},{teacherKnowledgeTraceability:true,teacherKnowledgeIntegrityAudit:true});
})(window);
