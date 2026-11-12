'use strict';
/* Smart Teacher core: DB-first answers, honest "not in the base", visible Groq errors, grounding + conversation history. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const mem=new Map();
global.window=global;global.lang='ar';global.grade='الثالثة متوسط';global.toast=()=>{};
global.localStorage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
global.document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},body:null};
global.addEventListener=()=>{};
global.smFetchJSON=u=>Promise.resolve(JSON.parse(fs.readFileSync(path.join(root,'web',u.replace(/^\.\//,'')),'utf8')));
const calls=[];let groqStatus=200,groqBody={choices:[{message:{content:'جواب Groq'}}]};
global.fetch=async(url,init)=>{calls.push({url:String(url),body:init&&init.body?JSON.parse(init.body):null});
 if(String(url).includes('api.groq.com'))return new Response(JSON.stringify(groqStatus===200?groqBody:{error:{message:'bad key'}}),{status:groqStatus,headers:{'Content-Type':'application/json'}});
 return new Response('{}',{status:404})};
global.offlineTutorReply=async(m,s,t)=>t==='practice'?'📝 تمارين\n1) س؟ — ج':'old';
const load=f=>eval(fs.readFileSync(path.join(root,'web',f),'utf8'));
load('groq-direct.js');load('smart-teacher-core.js');
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
 calls.length=0;localStorage.setItem('smSchoolGroqKey','gsk_'+'a'.repeat(30));
 let r=await tutor('اشرح لي الثورة التحريرية');
 let j=await r.json();
 assert.strictEqual(j.mode,'local');assert(/الثورة التحريرية/.test(j.answer)&&/المصدر/.test(j.answer));
 assert.strictEqual(calls.filter(c=>c.url.includes('groq')).length,0,'DB-first must not call Groq when the base answers');
 /* 3. a topic absent from the base is NOT answered with unrelated content; it goes to the AI with history/grounding */
 groqStatus=200;calls.length=0;
 r=await tutor('المقاومة الجزائرية');j=await r.json();
 assert.strictEqual(j.mode,'groq','unknown topic should reach Groq when a key exists');
 let sent=calls.find(c=>c.url.includes('groq')).body;
 assert(sent.messages[0].content.includes('conversational teacher'));
 assert(sent.messages.some(m=>m.role==='user'&&m.content.includes('اشرح لي الثورة التحريرية')),'previous turn must be sent as conversation history');
 /* 4. Groq failure is visible in the fallback answer, not silent */
 groqStatus=401;
 r=await tutor('المقاومة الجزائرية');assert(!r.ok);
 const off=await global.offlineTutorReply('المقاومة الجزائرية','عام','lesson');
 assert(/تعذّر الحصول على جواب الذكاء الاصطناعي/.test(off),'real Groq error must be shown');
 assert(/لا يوجد في قاعدة المنصة المحلية/.test(off),'honest not-in-base message expected');
 assert(!/مرحباً|وضع المنصة \(دون إنترنت\)/.test(off));
 /* 5. no key + unknown topic: honest answer, closest lessons, never a fabricated lesson */
 localStorage.removeItem('smSchoolGroqKey');
 const off2=await global.offlineTutorReply('المقاومة الجزائرية','عام','lesson');
 assert(/Groq غير مفعّل/.test(off2));
 /* 6. grounding block reaches the system prompt when the AI is first */
 C.setMode('ai');localStorage.setItem('smSchoolGroqKey','gsk_'+'a'.repeat(30));groqStatus=200;calls.length=0;
 await tutor('ما هي قراءة الخريطة');
 sent=calls.find(c=>c.url.includes('groq')).body;
 assert(/PLATFORM KNOWLEDGE BASE/.test(sent.messages[0].content),'retrieved lessons must ground the AI prompt');
 /* 7. subject inferred from the question when the learner left it on "عام" */
 assert(sent.messages[0].content.includes('Subject: التاريخ والجغرافيا'),'subject must be inferred');
 /* 8. practice is served from the exercise bank in DB mode */
 C.setMode('db');calls.length=0;
 r=await tutor('الكسور','practice');j=await r.json();assert.strictEqual(j.mode,'local');
 /* 9. status panel data */
 const st=await C.status();assert(st.loaded&&st.lessons>=1250);
 console.log('v2.9.40 smart teacher core tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
