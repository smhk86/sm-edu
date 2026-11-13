// v2.9.40 — stepwise formative grading and release wiring.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const els={};const ctx={console,Response,lang:'ar',grade:'الثانية متوسط',toast(){},document:{getElementById:id=>els[id]||null},SM_AI:{enabled:()=>true},apiBase:()=>''};
ctx.window=ctx;ctx.fetch=async()=>new Response(JSON.stringify({mode:'gemini',answer:'{}'}),{status:200});
vm.createContext(ctx);vm.runInContext(read('web/auto-grader.js'),ctx);
const t=ctx.SM_AUTOGRADER._t;
const graded=t.normalizeGrade({confidence:'high',questions:[{
 id:'Q1',max:10,awarded:6,verdict:'partial',student_answer:'حل جزئي',
 criteria:[
  {name:'فهم المعطيات',max:2,awarded:2,evidence:'كتب المعطيات',feedback:'صحيح'},
  {name:'اختيار الطريقة',max:3,awarded:2,evidence:'اختار القانون',feedback:'التعويض ناقص'},
  {name:'الحساب والنتيجة',max:5,awarded:2,evidence:'خطأ في الإشارة',feedback:'راجع الإشارة'}
 ],first_error:'في السطر الثالث عند تغيير الإشارة',error_type:'sign',correction:'التصحيح: x=3'
}]},20);
assert.equal(graded.items[0].max,10);
assert.equal(graded.items[0].awarded,6);
assert.equal(graded.items[0].criteria.reduce((n,c)=>n+c.max,0),10);
assert.equal(graded.items[0].criteria.reduce((n,c)=>n+c.awarded,0),6);
assert.equal(graded.items[0].firstError,'في السطر الثالث عند تغيير الإشارة');
assert.equal(graded.items[0].errorType,'sign');
assert.equal(graded.mark,12);
const normalized=t.normalizeGrade({confidence:'high',questions:[{max:8,awarded:7,criteria:[{name:'أ',max:1,awarded:1},{name:'ب',max:3,awarded:2}]}]},20);
assert.equal(normalized.items[0].criteria.reduce((n,c)=>n+c.max,0),8,'criterion maximums normalized to question max');
assert.equal(normalized.items[0].criteria.reduce((n,c)=>n+c.awarded,0),normalized.items[0].awarded,'awarded points equal rubric sum');
const missing=t.normalizeGrade({confidence:'high',questions:[{max:4,awarded:4,verdict:'missing',criteria:[{name:'خطوة',max:4,awarded:4}]}]},20);
assert.equal(missing.items[0].awarded,0);assert.equal(missing.items[0].criteria[0].awarded,0);assert.equal(missing.items[0].verdict,'missing','preserve explicit missing-answer state');
const unreadable=t.normalizeGrade({confidence:'medium',questions:[{max:4,awarded:3,verdict:'unreadable',criteria:[{name:'جزء غير واضح',max:4,awarded:3}]}]},20);
assert.equal(unreadable.items[0].awarded,0);assert.equal(unreadable.items[0].verdict,'unreadable','preserve unreadable state');assert.equal(unreadable.needsReview,true);
const html=t.renderGrade(graded);
assert(html.includes('تفصيل الخطوات والمعايير'));
assert(html.includes('أول خطأ'));
assert(html.includes('الدليل'));
assert(!html.includes('<script'));
const prompt=t.buildGradingPrompt({subject:'رياضيات',grade:'الثانية متوسط',maxMark:20,modelText:'x=3',studentText:'x=4'});
assert(prompt.includes('criteria')&&prompt.includes('first_error')&&prompt.includes('error_type'));
const pkg=JSON.parse(read('package.json')),main=read('backend/app/main.py'),htmlApp=read('web/index.html'),sw=read('web/sw.js');
assert.equal(pkg.version,'2.9.40');assert(main.includes('version="2.9.40"'));
assert(htmlApp.includes('v2.9.40')&&htmlApp.includes('v2-9-16.js'));
assert(htmlApp.includes('v2-9-17.js'));
assert(sw.includes('./v2-9-17.js'));
assert(sw.includes('sm-school-ai-v2.9.40-shell-r1')&&sw.includes('./v2-9-16.js'));
const release={};vm.runInNewContext(read('web/v2-9-16.js'),{window:release});
assert.equal(release.SM_EDUCATION_RELEASE.version,'2.9.16');
console.log('PASS: v2.9.40 stepwise rubric, point normalization, missing/unreadable verdicts, error localization, rendering and release wiring');
