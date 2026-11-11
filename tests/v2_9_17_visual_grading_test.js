// v2.9.40 — diagram-aware image grading and confidence safeguards.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ctx={console,Response,lang:'ar',grade:'الثانية متوسط',toast(){},document:{getElementById(){return null}},SM_GROQ:{enabled:()=>true}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(read('web/auto-grader.js'),ctx);
const t=ctx.SM_AUTOGRADER._t;
const prompt=t.buildGradingPrompt({subject:'رياضيات',grade:'الثالثة متوسط',maxMark:20,studentImageCount:2,modelImageCount:1});
assert(prompt.includes('الرسوم الهندسية والبيانية')||prompt.includes('الرسوم'));
assert(prompt.includes('لا تستنتج الأطوال أو الزوايا من مظهر الرسم'));
assert(prompt.includes('visual_observations')&&prompt.includes('diagram_notes'));
const normalized=t.normalizeGrade({confidence:'high',questions:[{max:10,awarded:8,criteria:[{name:'خطوة',max:10,awarded:8}]}],visual_observations:[
 {element:'النقطة A',observed_value:'A',confidence:'high',evidence:'حرف ظاهر قرب الرأس',role:'نقطة'},
 {element:'طول ضلع',observed_value:'غير واضح',confidence:'low',evidence:'الرقم مطموس',role:'قياس'}
],diagram_notes:['القياس غير مقروء ولا يجوز استنتاجه من تناسب الرسم']},20);
assert.equal(normalized.visualObservations.length,2);
const conflictGrade=t.normalizeGrade({confidence:'high',questions:[{max:10,awarded:10}],visual_conflicts:[{description:'النص يذكر 30° بينما الرسم يظهر 80°',text_evidence:'30° في نص السؤال',visual_evidence:'الوسم قرب الزاوية يبدو 80°',confidence:'medium'}]},20);
assert.equal(conflictGrade.visualConflicts.length,1);
assert.equal(conflictGrade.needsReview,true,'any text/diagram conflict requires teacher review');
const conflictHtml=t.renderGrade(conflictGrade);
assert(conflictHtml.includes('تعارضات تحتاج مراجعة الأستاذ'));
assert(conflictHtml.includes('30° في نص السؤال')&&conflictHtml.includes('80°'));
assert(prompt.includes('visual_conflicts'));

assert.equal(normalized.visualObservations[1].confidence,'low');
assert.equal(normalized.needsReview,true,'low-confidence visual observations require teacher review');
const html=t.renderGrade(normalized);
assert(html.includes('قراءة الرسم والصورة')&&html.includes('الدليل المرئي'));
assert(html.includes('غير واضح'));
const smart=read('web/smart-teacher.js');
assert(smart.includes('maxSide=2000'));
assert(smart.includes('2000/Math.max(page.view[2],page.view[3])'));
assert(smart.includes("toDataURL('image/jpeg',0.84)"));
const pkg=JSON.parse(read('package.json')),main=read('backend/app/main.py'),index=read('web/index.html'),sw=read('web/sw.js');
assert.equal(pkg.version,'2.9.40');assert(main.includes('version="2.9.40"'));
assert(index.includes('v2-9-17.js')&&index.includes('v2.9.40'));
assert(sw.includes('sm-school-ai-v2.9.40-shell-r1')&&sw.includes('./v2-9-17.js'));
const release={};vm.runInNewContext(read('web/v2-9-17.js'),{window:release});
assert.equal(release.SM_EDUCATION_RELEASE.version,'2.9.17');
console.log('PASS: v2.9.40 diagram-aware vision prompt, structured observations, confidence escalation, high-resolution image preparation and release wiring');
