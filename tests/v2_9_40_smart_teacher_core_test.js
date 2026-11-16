'use strict';
/* Smart Teacher core: DB-first answers, honest "not in the base", visible Gemini errors, grounding + conversation history. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const mem=new Map();
global.window=global;global.lang='ar';global.grade='الثالثة متوسط';global.toast=()=>{};
global.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
global.document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},body:null};
global.addEventListener=()=>{};
global.smFetchJSON=u=>Promise.resolve(JSON.parse(fs.readFileSync(path.join(root,'web',u.replace(/^\.\//,'')),'utf8')));
const calls=[];let geminiStatus=200,geminiBody={candidates:[{content:{parts:[{text:'جواب Gemini'}]}}]};
global.fetch=async(url,init)=>{calls.push({url:String(url),body:init&&init.body?JSON.parse(init.body):null});
 if(String(url).includes('generativelanguage.googleapis.com'))return new Response(JSON.stringify(geminiStatus===200?geminiBody:{error:{message:'bad key'}}),{status:geminiStatus,headers:{'Content-Type':'application/json'}});
 return new Response('{}',{status:404})};
global.offlineTutorReply=async(m,s,t)=>t==='practice'?'📝 تمارين\n1) س؟ — ج':'old';
const load=f=>eval(fs.readFileSync(path.join(root,'web',f),'utf8'));
load('gemini-direct.js');load('smart-teacher-core.js');
const C=global.SM_TEACHER_CORE;
const tutor=(message,task='lesson',subject='عام')=>global.fetch('/api/v1/ai/tutor',{method:'POST',body:JSON.stringify({task,message,student_answer:'',language:'ar',grade,subject})});
(async()=>{
 const I=await C.ensure();
 assert(I.counts.deep>=1250,'all lesson packs must be indexed');
 assert.strictEqual(I.counts.ency,1250,'all 1,250 encyclopedia records must be loaded and linked into retrieval');
 assert.strictEqual(I.counts.bank,1581,'all 1,581 exercise records must remain linked');
 assert(I.docs.length>=I.counts.deep,'index must hold packs and stand-alone exercises');
 assert(I.docs.some(d=>d.kind==='pack'&&d.ency&&Array.isArray(d.ency.learning_targets)),'deep lesson packs must be enriched with their matching encyclopedia records');
 /* 1. a lesson that exists is found across subjects, confidently */
 let h=await C.search('الثورة التحريرية');
 assert(h.length&&/الثورة التحريرية/.test(h[0].d.lesson),'resistance-era lesson in the base must rank first: '+(h[0]&&h[0].d.lesson));
 assert(C.confident(h,'الثورة التحريرية'));
 const grounded=await C.kbContext('الاسم والفعل والحرف');
 assert(grounded.includes('ليست وثيقة وزارية'),'AI grounding must carry the non-official source warning');
 assert(grounded.includes('الأهداف:'),'AI grounding must include encyclopedia learning targets when available');
 assert(/\[KB-1 \|/.test(grounded),'grounding must provide stable local source identifiers without fabricated page numbers');
 /* Explicit learner context must be preserved when the AI grounding search is rebuilt. */
 const scoped=await C.kbContext('التنفس',{grade:'الثالثة متوسط',subject:'العلوم الطبيعية'});
 assert(scoped.includes('الثالثة متوسط — العلوم الطبيعية'),'grounding must prioritize the explicitly selected grade and subject');
 const scopedPrimary=await C.kbContext('التنفس',{grade:'الأولى ابتدائي',subject:'التربية العلمية والتكنولوجية'});
 assert(scopedPrimary.includes('الأولى ابتدائي — التربية العلمية والتكنولوجية'),'grounding must honor a different explicitly selected grade and subject');
 const local=C.localAnswer('الثورة التحريرية',h);
 assert(local.includes('ليس نصاً وزارياً معتمداً'),'local answers must disclose platform-derived provenance');
 /* 2. DB first: answered locally, no network call */
 calls.length=0;localStorage.setItem('smSchoolGeminiKeys',JSON.stringify(['a'.repeat(30)]));
 let r=await tutor('اشرح لي الثورة التحريرية');
 let j=await r.json();
 assert.strictEqual(j.mode,'local');assert(/الثورة التحريرية/.test(j.answer));
 assert.strictEqual(calls.filter(c=>c.url.includes('generativelanguage')).length,0,'DB-first must not call Gemini when the base answers');
 /* Explicit request scope overrides the app-wide grade; local retrieval must not leak a same-topic lesson from another grade. */
 C.setMode('db');
 r=await global.fetch('/api/v1/ai/tutor',{method:'POST',body:JSON.stringify({task:'lesson',message:'الاسم والفعل والحرف',language:'ar',grade:'الأولى ابتدائي',subject:'اللغة العربية'})});
 j=await r.json();assert.strictEqual(j.mode,'local');assert(j.answer.includes('اللغة العربية  ·  الأولى ابتدائي'),'explicit grade/subject must scope the local Smart Teacher answer');
 /* 3. a topic absent from the base is NOT answered with unrelated content; it goes to the AI with history/grounding */
 geminiStatus=200;calls.length=0;
 r=await tutor('المقاومة الجزائرية');j=await r.json();
 assert.strictEqual(j.mode,'gemini','unknown topic should reach Gemini when a key exists');
 let sent=calls.find(c=>c.url.includes('generativelanguage')).body;
 assert(sent.systemInstruction.parts[0].text.includes('conversational teacher'));
 assert(sent.contents.some(m=>m.role==='user'&&m.parts[0].text.includes('اشرح لي الثورة التحريرية')),'previous turn must be sent as conversation history');
 /* 4. Gemini failure is visible in the fallback answer, not silent */
 geminiStatus=401;
 r=await tutor('المقاومة الجزائرية');assert(!r.ok);
 const off=await global.offlineTutorReply('المقاومة الجزائرية','عام','lesson');
 assert(/تعذّر الحصول على جواب الذكاء الاصطناعي/.test(off),'real Gemini error must be shown');
 assert(/لا يوجد في قاعدة المنصة المحلية/.test(off),'honest not-in-base message expected');
 assert(!/مرحباً|وضع المنصة \(دون إنترنت\)/.test(off));
 /* 5. no key + unknown topic: honest answer, closest lessons, never a fabricated lesson */
 localStorage.removeItem('smSchoolGeminiKeys');
 const off2=await global.offlineTutorReply('المقاومة الجزائرية','عام','lesson');
 assert(/Gemini غير مفعّل/.test(off2));
 /* 6. grounding block reaches the system prompt when the AI is first */
 localStorage.removeItem('smSchoolGeminiExhausted');C.setMode('ai');localStorage.setItem('smSchoolGeminiKeys',JSON.stringify(['a'.repeat(30)]));geminiStatus=200;calls.length=0;
 await tutor('ما هي قراءة الخريطة');
 sent=calls.find(c=>c.url.includes('generativelanguage')).body;
 assert(/PLATFORM KNOWLEDGE BASE/.test(sent.systemInstruction.parts[0].text),'retrieved lessons must ground the AI prompt');
 assert(sent.systemInstruction.parts[0].text.includes('الثالثة متوسط'),'grounding must preserve the learner grade');
 /* 7. subject inferred from the question when the learner left it on "عام" */
 assert(sent.systemInstruction.parts[0].text.includes('Subject: التاريخ والجغرافيا'),'subject must be inferred');
 /* 8. practice is served from the exercise bank in DB mode */
 C.setMode('db');calls.length=0;
 r=await tutor('الكسور','practice');j=await r.json();assert.strictEqual(j.mode,'local');
 /* 9. status panel data */
 const st=await C.status();assert(st.loaded&&st.lessons>=1250&&st.encyclopedia>=1250);
 console.log('v2.9.48 smart teacher core tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
