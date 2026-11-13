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
 assert(I.docs.length>=I.counts.deep,'index must hold packs and stand-alone exercises');
 /* 1. a lesson that exists is found across subjects, confidently */
 let h=await C.search('الثورة التحريرية');
 assert(h.length&&/الثورة التحريرية/.test(h[0].d.lesson),'resistance-era lesson in the base must rank first: '+(h[0]&&h[0].d.lesson));
 assert(C.confident(h,'الثورة التحريرية'));
 /* 2. DB first: answered locally, no network call */
 calls.length=0;localStorage.setItem('smSchoolGeminiKeys',JSON.stringify(['a'.repeat(30)]));
 let r=await tutor('اشرح لي الثورة التحريرية');
 let j=await r.json();
 assert.strictEqual(j.mode,'local');assert(/الثورة التحريرية/.test(j.answer)&&/المصدر/.test(j.answer));
 assert.strictEqual(calls.filter(c=>c.url.includes('generativelanguage')).length,0,'DB-first must not call Gemini when the base answers');
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
 /* 7. subject inferred from the question when the learner left it on "عام" */
 assert(sent.systemInstruction.parts[0].text.includes('Subject: التاريخ والجغرافيا'),'subject must be inferred');
 /* 8. practice is served from the exercise bank in DB mode */
 C.setMode('db');calls.length=0;
 r=await tutor('الكسور','practice');j=await r.json();assert.strictEqual(j.mode,'local');
 /* 9. status panel data */
 const st=await C.status();assert(st.loaded&&st.lessons>=1250);
 console.log('v2.9.40 smart teacher core tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
