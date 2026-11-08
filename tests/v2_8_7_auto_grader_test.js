// v2.8.7: auto-grader logic, consent/Groq gates, library wiring, and "no GitHub secrets in the app" scan.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

const els={};const calls=[];
const ctx={console,Response,lang:'ar',grade:'الثانية متوسط',toast(){},escapeReviewText:s=>String(s),
 activeLearner:()=>({id:'l1',name:'Secret Pupil',grade:'الثانية متوسط'}),apiBase:()=>'',
 document:{getElementById:id=>els[id]||null},SM_GROQ:{enabled:()=>true}};
ctx.window=ctx;
ctx.fetch=async(u,i)=>{calls.push([u,JSON.parse(i.body)]);return ctx.__reply()};
vm.createContext(ctx);vm.runInContext(read('web/auto-grader.js'),ctx);
const A=ctx.SM_AUTOGRADER,t=A._t;

const reply=obj=>()=>new Response(JSON.stringify({mode:'groq',answer:typeof obj==='string'?obj:JSON.stringify(obj)}),{status:200});
const good={questions:[
 {id:'1',max:8,awarded:8,verdict:'wrong',student_answer:'x=3',errors:[],correction:''},        // verdict lies: must be corrected to "correct"
 {id:'2',max:6,awarded:2.1,verdict:'correct',student_answer:'y=2',errors:['خطأ في الإشارة'],correction:'y=-2'},
 {id:'3',max:6,awarded:9,verdict:'partial',student_answer:'',errors:[],correction:'z'}],     // awarded > max: clamp
 general_remarks:'جيد',unreadable_parts:[],confidence:'high'};

(async()=>{
 // --- extractJson: fences, prose around it, braces/quotes inside strings
 assert.equal(t.extractJson('```json\n{"a":1}\n```').a,1);
 assert.equal(t.extractJson('نتيجة: {"a":"}{ \\" x","b":{"c":2}} انتهى').b.c,2);
 assert.throws(()=>t.extractJson('no json here'));assert.throws(()=>t.extractJson('{"a":'));

 // --- normalizeGrade: clamp, 0.25 rounding, verdict consistent with points, deterministic total
 const g=t.normalizeGrade(good,20);
 assert.deepEqual(g.items.map(x=>[x.awarded,x.max,x.verdict]),[[8,8,'correct'],[2,6,'partial'],[6,6,'correct']]);
 assert.equal(g.total,16);assert.equal(g.totalMax,20);assert.equal(g.mark,16);assert.equal(g.scaled,false);assert.equal(g.needsReview,false);
 // model's own total is ignored; mismatched max is rescaled to the requested maximum
 const g2=t.normalizeGrade({questions:[{id:'a',max:10,awarded:5},{id:'b',max:10,awarded:10}],total:99,confidence:'high'},40);
 assert.equal(g2.mark,30);assert.equal(g2.scaled,true);
 // unreadable never earns points and forces review; low confidence forces review
 const g3=t.normalizeGrade({questions:[{id:'1',max:10,awarded:10,verdict:'unreadable'},{id:'2',max:10,awarded:10,verdict:'correct'}],unreadable_parts:['السطر 3']},20);
 assert.equal(g3.items[0].awarded,0);assert.equal(g3.mark,10);assert.equal(g3.needsReview,true);
 assert.equal(t.normalizeGrade({questions:[{max:5,awarded:5}],confidence:'low'},20).needsReview,true);
 assert.throws(()=>t.normalizeGrade({questions:[]},20));assert.throws(()=>t.normalizeGrade({questions:[{max:0,awarded:0}]},20));assert.throws(()=>t.normalizeGrade(null,20));

 // --- prompt: carries model answer + student text, JSON-only contract, image order, no pupil name
 const prompt=t.buildGradingPrompt({subject:'رياضيات',grade:'2AM',maxMark:20,modelText:'الحل: x=3',studentText:'x=4',studentImageCount:2,modelImageCount:1,question:'حل المعادلة'});
 assert(prompt.includes('الحل: x=3')&&prompt.includes('x=4')&&prompt.includes('JSON')&&prompt.includes('أول 2 صورة'));
 assert(!prompt.includes('Secret Pupil'));

 // --- gates: consent, Groq key, missing inputs — nothing is sent
 const base={consent:true,subject:'رياضيات',grade:'2AM',maxMark:20,modelText:'m',studentText:'s'};
 await assert.rejects(()=>A.grade({...base,consent:false}),/no-consent/);
 ctx.SM_GROQ.enabled=()=>false;await assert.rejects(()=>A.grade(base),/groq-disabled/);ctx.SM_GROQ.enabled=()=>true;
 await assert.rejects(()=>A.grade({...base,studentText:''}),/no-student/);
 await assert.rejects(()=>A.grade({...base,modelText:''}),/no-model/);
 assert.equal(calls.length,0,'no network call before all gates pass');

 // --- full call: Groq-routable payload, vision budget (3 images, student sheet first), strict JSON
 ctx.__reply=reply(good);
 const res=await A.grade({...base,studentImages:['s1','s2','s3'],modelImages:['m1']});
 const [url,body]=calls[0];
 assert(/\/api\/v1\/ai\/tutor$/.test(url));assert.equal(body.task,'evaluate');assert.equal(body.strict_json,true);
 assert.deepEqual(body.vision_images,['s1','s2','m1']);assert.equal(res.truncated,true);assert.equal(res.mark,16);
 assert(!JSON.stringify(body).includes('Secret Pupil'),'learner name must not be sent');
 // unstructured reply -> no invented mark, raw text kept for display
 ctx.__reply=reply('الإجابة جيدة جداً بدون JSON');
 await assert.rejects(()=>A.grade(base),e=>e.message==='unparseable'&&e.raw.includes('جيدة'));

 // --- rendering escapes model/student text
 const html=t.renderGrade(t.normalizeGrade({questions:[{id:'1',max:5,awarded:1,errors:['<img src=x onerror=1>'],correction:'<b>x</b>'}],general_remarks:'<script>1</script>'},20));
 assert(!/<img |<script|<b>x/.test(html),'model text must be escaped');
 assert(html.includes('&lt;img')&&html.includes('4 / 20'),'escaped text kept; mark 1/5 rescaled to 20 = 4');

 // --- UI flow through the DOM
 const el=(v)=>({value:v,files:[],checked:false,innerHTML:'',textContent:''});
 Object.assign(els,{agrOut:el(''),agrConsent:el(''),agrStudentText:el('x=4'),agrModelText:el('x=3'),agrStudentFile:el(''),agrModelFile:el(''),agrLibrary:el(''),agrSubject:el('رياضيات'),agrQuestion:el(''),agrMax:el('20')});
 await ctx.smAutoGrade();assert(els.agrOut.textContent.includes('الموافقة'),'consent required in UI');
 els.agrConsent.checked=true;ctx.__reply=reply(good);await ctx.smAutoGrade();
 assert(els.agrOut.innerHTML.includes('16 / 20'),'UI shows computed mark');

 // --- library helpers: DzExams + Raji3DZ in one list, value routing
 ctx.SM_DZLIB={_t:{docs:()=>[{ext:'pdf',grade:'الثانية متوسط',title:'فرض dz',solution:true},{ext:'docx',grade:'الثانية متوسط',title:'word'}],load:async()=>1},readPdfText:async i=>({text:'dz'+i})};
 ctx.SM_RAJI3DZ={_t:{docs:()=>[{ext:'pdf',grade:'الثانية متوسط',title:'حل rj'},{ext:'pdf',grade:'أولى ثانوي',title:'other grade'}],load:async()=>1},readPdfText:async i=>({text:'rj'+i})};
 const opts=t.libraryPdfOptions('الثانية متوسط');
 assert.deepEqual(opts.map(o=>o.value),['dz:0','rj:0']);assert(opts[1].label.includes('Raji3DZ'));
 assert.equal((await t.readLibraryPdf('rj:0')).text,'rj0');assert.equal((await t.readLibraryPdf('dz:0')).text,'dz0');assert.equal((await t.readLibraryPdf('0')).text,'dz0','legacy numeric value = DzExams');
 await assert.rejects(()=>t.readLibraryPdf('evil:1'),/invalid/);

 // --- wiring
 const html2=read('web/index.html'),sw=read('web/sw.js'),teacher=read('web/smart-teacher.js'),groq=read('web/groq-direct.js');
 assert(html2.includes('src="auto-grader.js"')&&html2.includes('src="v2-8-7.js"')&&sw.includes('./auto-grader.js')&&sw.includes('./v2-8-7.js'));
 assert(html2.indexOf('auto-grader.js')<html2.indexOf('v2-8-7.js'));
 assert(teacher.includes('smAutoGraderPanel')&&teacher.includes('smLibraryPdfOptions')&&teacher.includes('smReadLibraryPdf'));
 assert(groq.includes('strict_json'));
 const rel={};vm.runInContext(read('web/v2-8-7.js'),Object.assign(ctx,{SM_EDUCATION_RELEASE:{}}));assert.equal(ctx.SM_EDUCATION_RELEASE.version,'2.8.7');

 // --- no GitHub (or other) secrets anywhere in the shipped web app, and no GitHub API access
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='vendor'?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
 const bad=[];
 for(const f of walk(path.join(root,'web')).filter(f=>/\.(js|html|json|css|webmanifest)$/.test(f))){
  const s=fs.readFileSync(f,'utf8'),rel2=path.relative(root,f);
  if(/\bgh[pousr]_[A-Za-z0-9]{30,}/.test(s)||/github_pat_[A-Za-z0-9_]{20,}/.test(s))bad.push(rel2+': GitHub token');
  if(/https?:\/\/(?:api|uploads)\.github\.com|fetch\([^)]*(?:api|uploads)\.github\.com/.test(s))bad.push(rel2+': GitHub API access'); /* sw.js only has an inert hostname bypass, which is allowed */
  if(/\bgsk_[A-Za-z0-9]{20,}/.test(s)||/AKIA[0-9A-Z]{16}/.test(s)||/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s))bad.push(rel2+': secret');
  if(/Authorization['"]?\s*:\s*['"`](?:token|Bearer)\s+[A-Za-z0-9_\-]{20,}/.test(s))bad.push(rel2+': hardcoded Authorization header');
 }
 assert.deepEqual(bad,[],'secrets in web/: '+bad.join('; '));
 console.log('PASS: v2.8.7 auto-grader logic/gates/rendering, library wiring, release wiring and no-secrets scan');
})().catch(e=>{console.error(e);process.exit(1)});
