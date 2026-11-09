/* SM EDUCATION v2.9.5 — المولّد الذكي (إعادة بناء): منهاج 2026-2027 + بنك التمارين + مرجع Raji3DZ + ذكاء اصطناعي اختياري. */
(function(g){'use strict';
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{version:'2.9.5',focus:'smart-generator-v2',features:(prior.features||[]).concat(['generator-ai-fill-shortage','generator-saved-ai-bank','generator-secondary-streams','generator-kinds-devoir-exam-bem-bac','generator-topic-balance-no-repeat','generator-exercise-structure-marking','generator-raji3dz-references','generator-ai-simulation-optional','generator-all-stages-subjects','generator-reference-simulation','generator-saved-papers-keep-delete'])});
 const doc=g.document;
 const $=id=>doc?doc.getElementById(id):null;
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const GRADES=['الأولى ابتدائي','الثانية ابتدائي','الثالثة ابتدائي','الرابعة ابتدائي','الخامسة ابتدائي','الأولى متوسط','الثانية متوسط','الثالثة متوسط','الرابعة متوسط','الأولى ثانوي','الثانية ثانوي','الثالثة ثانوي'];
 const KINDS={
  exercises:{t:'تمارين تدريبية',count:8,min:0,pts:0,ex:0},
  devoir:{t:'فرض محروس',count:6,min:60,pts:20,ex:3},
  exam:{t:'اختبار الفصل',count:10,min:120,pts:20,ex:4},
  bem:{t:'نموذج تدريبي لشهادة التعليم المتوسط',count:12,min:120,pts:20,ex:4,allTerms:true,only:'الرابعة متوسط'},
  bac:{t:'نموذج تدريبي للبكالوريا',count:14,min:180,pts:20,ex:4,allTerms:true,only:'الثالثة ثانوي'}
 };
 const ORD=['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن'];
 const DIFF={easy:'مبتدئ',medium:'متوسط',hard:'متقدم'};
 const DIFF_AR={easy:'سهل',medium:'متوسط',hard:'صعب',mixed:'متدرج'};
 const st={grade:'',subject:'',term:1,kind:'exercises',difficulty:'mixed',count:8,minutes:0,points:0,topics:null,stream:'',useSaved:true};
 let CUR=null,RJ=null,PATHS=null,lastLocal=null,curTopics=[],lastRefs=[],busy=false;
 const ls={get:k=>{try{return g.localStorage.getItem(k)||''}catch(e){return ''}},set:(k,v)=>{try{g.localStorage.setItem(k,v)}catch(e){}}};
 const say=m=>{if(typeof g.toast==='function')g.toast(m)};

 const records=()=>typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords)?exerciseBankRecords:[];
 const gradeNow=()=>{const c=typeof grade!=='undefined'?grade:null;return GRADES.includes(c)?c:GRADES[0]};
 const kindsFor=gr=>Object.keys(KINDS).filter(k=>!KINDS[k].only||KINDS[k].only===gr);
 const subjectsFor=gr=>[...new Set([].concat(records(),CUR||[],RJ||[]).filter(x=>x.grade===gr&&x.subject).map(x=>x.subject))].sort((a,b)=>a.localeCompare(b,'ar'));
 const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 const fmt=n=>{const r=Math.round(n*4)/4;return Number.isInteger(r)?String(r):String(r).replace(/0+$/,'')};
 const used=()=>{try{return JSON.parse(ls.get('smGenUsedIds')||'[]')}catch(e){return[]}};
 const savedBank=()=>{try{return JSON.parse(ls.get('smGenAiBank')||'[]')}catch(e){return[]}};
 const savedPapers=()=>{try{const x=JSON.parse(ls.get('smGenSavedPapers')||'[]');return Array.isArray(x)?x:[]}catch(e){return[]}};
 function persistPaper(){const m=g.SM_GENERATOR&&g.SM_GENERATOR.last;if(!m)return;const list=savedPapers();if(m.savedId&&list.some(x=>x.savedId===m.savedId)){say('هذا الموضوع محفوظ بالفعل.');return}const id='paper-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);const copy=JSON.parse(JSON.stringify(m));copy.savedId=id;copy.savedAt=new Date().toISOString();list.unshift(copy);ls.set('smGenSavedPapers',JSON.stringify(list.slice(0,100)));if(!savedPapers().some(x=>x.savedId===id)){say('تعذّر الحفظ: مساحة التخزين المحلية غير كافية. احذف بعض المواضيع القديمة ثم أعد المحاولة.');return}m.savedId=id;renderSavedPapers();showResult(m);say('تم الاحتفاظ بالموضوع على هذا الجهاز.')}
 function deletePaper(id){if(!id)return;const list=savedPapers().filter(x=>x.savedId!==id);ls.set('smGenSavedPapers',JSON.stringify(list));if(g.SM_GENERATOR&&g.SM_GENERATOR.last&&g.SM_GENERATOR.last.savedId===id)delete g.SM_GENERATOR.last.savedId;renderSavedPapers();if(g.SM_GENERATOR&&g.SM_GENERATOR.last)showResult(g.SM_GENERATOR.last);say('تم حذف الموضوع المحفوظ.')}
 function openSavedPaper(id){const m=savedPapers().find(x=>x.savedId===id);if(!m)return;showResult(m);}
 function renderSavedPapers(){const box=$('smGenSavedPapers');if(!box)return;const list=savedPapers();box.innerHTML=`<section class="gen-saved-archive"><h3>مواضيعي المحتفظ بها (${list.length})</h3>${list.length?list.map(x=>`<div class="gen-saved-row"><div><b>${esc(x.title||'موضوع تدريبي')}</b><small>${esc(x.s&&x.s.grade||'')} · ${esc(x.s&&x.s.subject||'')} · ${new Date(x.savedAt||Date.now()).toLocaleDateString('ar-DZ')}</small></div><div class="generator-actions"><button class="text-btn" onclick="SM_GENERATOR.openSaved('${esc(x.savedId)}')">عرض</button><button class="text-btn danger" onclick="SM_GENERATOR.deleteSaved('${esc(x.savedId)}')">حذف</button></div></div>`).join(''):'<p class="notice">لا توجد مواضيع محفوظة بعد. استخدم زر «الاحتفاظ بالموضوع» بعد التوليد.</p>'}</section>`;}
 function saveAi(qs,s){const b=savedBank();qs.forEach(q=>b.push({id:'ai-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),grade:s.grade,subject:s.subject,term:s.term||0,topic:q.topic||'ذكاء اصطناعي',question:q.question,solution:q.answer,solution_steps:q.steps||[],explanation:q.explanation||'',choices:q.choices||[],ai:true}));ls.set('smGenAiBank',JSON.stringify(b.slice(-400)))}
 const streamsFor=gr=>{if(!PATHS)return[];return gr==='الأولى ثانوي'?PATHS.trunks:(gr==='الثانية ثانوي'||gr==='الثالثة ثانوي')?PATHS.streams:[]};
 const remember=ids=>{const u=used().concat(ids);ls.set('smGenUsedIds',JSON.stringify(u.slice(-1500)))};

 function ensure(){
  if(!st.grade)st.grade=gradeNow();
  const subs=subjectsFor(st.grade);
  if(!subs.includes(st.subject))st.subject=subs.includes('الرياضيات')?'الرياضيات':(subs[0]||'');
  if(!kindsFor(st.grade).includes(st.kind)){st.kind='exercises';applyKind()}
 }
 function applyKind(){const k=KINDS[st.kind];st.count=k.count;st.minutes=k.min;st.points=k.pts;st.term=k.allTerms?0:(st.term||1);st.topics=null}

 /* ---------- selection ---------- */
 function poolFor(s){
  const base=records().filter(x=>x.grade===s.grade&&x.subject===s.subject).concat(s.useSaved?savedBank().filter(x=>x.grade===s.grade&&x.subject===s.subject):[]);
  let p=s.term===0?base:base.filter(x=>Number(x.term)===s.term||(x.ai&&!x.term)),note='';
  if(s.term!==0&&p.length<s.count&&base.length>p.length){p=base;note='لم يكفِ بنك هذا الفصل لعدد الأسئلة المطلوب، فاستُكمل من فصول أخرى لنفس المادة.'}
  return {p,note};
 }
 const topicOf=x=>x.topic||x.lesson||'عام';
 function generated(s,n){
  const L=g.SM_LOCAL_EXAM;if(!(L&&typeof L.practiceItems==='function')||n<1)return[];
  try{
   const t=s.term||(1+Math.floor(Math.random()*3));
   const r=L.practiceItems(s.grade,s.subject,t,n,s.difficulty);
   return ((r&&r.items)||[]).slice(0,n).map(x=>({topic:x.topic||'تمارين حسابية متجددة',question:x.question,answer:x.answer||'',explanation:x.explanation||'',steps:x.steps||x.solution_steps||[],choices:x.choices||[]}));
  }catch(e){return[]}
 }
 function pick(s){
  const {p,note}=poolFor(s);let pool=p;
  if(s.topics&&s.topics.length)pool=pool.filter(x=>s.topics.includes(topicOf(x)));
  if(DIFF[s.difficulty]){const m=pool.filter(x=>x.difficulty===DIFF[s.difficulty]);if(m.length>=Math.min(3,s.count))pool=m}
  const gen=generated(s,Math.ceil(s.count*0.4)),need=Math.max(0,s.count-gen.length);
  const u=new Set(used());
  const src=shuffle(pool.filter(x=>!u.has(x.id))).concat(shuffle(pool.filter(x=>u.has(x.id))));
  const by=new Map();src.forEach(x=>{const k=topicOf(x);if(!by.has(k))by.set(k,[]);by.get(k).push(x)});
  const keys=shuffle([...by.keys()]),out=[];
  while(out.length<need&&keys.some(k=>by.get(k).length)){for(const k of keys){const a=by.get(k);if(a.length&&out.length<need)out.push(a.shift())}}
  const items=out.map(x=>({id:x.id,ai:!!x.ai,topic:topicOf(x),question:x.question,answer:x.solution||'',explanation:x.explanation||'',steps:x.solution_steps||[],choices:x.choices||[]})).concat(gen);
  return {items,note,poolSize:pool.length};
 }

 /* ---------- structure & marking ---------- */
 function structure(items,s){
  const total=Math.max(0,s.points),n=items.length,k=KINDS[s.kind];
  const sorted=items.slice().sort((a,b)=>a.topic.localeCompare(b.topic,'ar'));
  let groups=[];
  if(!k.ex){const m=new Map();sorted.forEach(x=>{if(!m.has(x.topic))m.set(x.topic,[]);m.get(x.topic).push(x)});m.forEach((qs,t)=>groups.push({title:'تمارين حول: '+t,qs}))}
  else{const nEx=Math.max(1,Math.min(k.ex,n)),size=Math.ceil(n/nEx);for(let i=0;i<n;i+=size){const qs=sorted.slice(i,i+size);groups.push({title:'التمرين '+ORD[groups.length],qs})}}
  if(total>0&&n>0){
   let left=total;const per=Math.round(total/n*4)/4;let seen=0;
   groups.forEach(gr=>{gr.qs.forEach(q=>{seen++;q.points=seen===n?Math.max(0,Math.round(left*4)/4):Math.min(per,left);left-=q.points});gr.points=gr.qs.reduce((a,q)=>a+q.points,0)});
  }
  return groups;
 }
 function competencies(s){
  if(!CUR)return[];
  const rec=CUR.find(r=>r.grade===s.grade&&r.subject===s.subject);
  const ts=rec&&rec.platform_learning_map&&rec.platform_learning_map.terms||[];
  const set=new Set();ts.filter(t=>s.term===0||Number(t.term)===s.term).forEach(t=>(t.competency_targets||[]).forEach(c=>set.add(c)));
  return [...set].slice(0,3);
 }
 const termLabel=t=>t===0?'كل فصول السنة':'الفصل '+['','الأول','الثاني','الثالث'][t];
 function model(s,groups,source,note){
  return {s:Object.assign({},s),title:KINDS[s.kind].t+' — '+s.subject,groups,source,note,comp:competencies(s)};
 }

 /* ---------- rendering ---------- */
 function qHtml(q,i,withPts){return `<div class="gen-q"><b>${i}.</b> ${withPts&&q.points?`<span class="gen-pts">(${fmt(q.points)} ن)</span> `:''}${q.ai?'<span title="يحتاج تدقيقاً">🤖</span> ':''}${esc(q.question)}${q.choices&&q.choices.length?`<ul>${q.choices.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}</div>`}
 function paperHtml(m){
  const s=m.s;let n=0;
  return `<article class="gen-paper"><header class="gen-head"><small>الجمهورية الجزائرية الديمقراطية الشعبية — وزارة التربية الوطنية</small><h3>${esc(m.title)}</h3><p>المستوى: ${esc(s.grade)}${s.stream?' · '+esc(s.stream)+' (تصنيف مؤقت)':''} · ${termLabel(s.term)}${s.minutes?' · المدة: '+s.minutes+' دقيقة':''}${s.points?' · العلامة: '+fmt(s.points):''}</p><p class="gen-warn">نموذج تدريبي من إعداد المنصة وليس موضوعاً رسمياً.</p>${m.comp.length?`<p><b>الكفاءات المستهدفة:</b> ${m.comp.map(esc).join(' — ')}</p>`:''}</header>${m.groups.map(gr=>`<section class="gen-ex"><h4>${esc(gr.title)}${s.points?` <span class="gen-pts">(${fmt(gr.points)} ن)</span>`:''}</h4>${gr.qs.map(q=>qHtml(q,++n,!!s.points)).join('')}</section>`).join('')}</article>`;
 }
 function keyHtml(m){
  let n=0;
  return `<article class="gen-paper gen-key"><header class="gen-head"><h3>الحل النموذجي وسلم التنقيط</h3><p>${esc(m.title)} — ${esc(m.s.grade)}</p></header>${m.groups.map(gr=>`<section class="gen-ex"><h4>${esc(gr.title)}</h4>${gr.qs.map(q=>{n++;const steps=(q.steps||[]);const sp=q.points&&steps.length?q.points/steps.length:0;return `<div class="gen-q"><b>${n}.</b> ${q.points?`<span class="gen-pts">(${fmt(q.points)} ن)</span> `:''}<b>الإجابة:</b> ${esc(q.answer||'راجع خطوات الحل')}${steps.length?`<ol>${steps.map(x=>`<li>${esc(x)}${sp?` <small>(${fmt(sp)} ن)</small>`:''}</li>`).join('')}</ol>`:''}${q.explanation?`<p><small>${esc(q.explanation)}</small></p>`:''}</div>`}).join('')}</section>`).join('')}</article>`;
 }
 function showResult(m){
  const mount=$('smGeneratorResult');if(!mount)return;
  g.SM_GENERATOR.last=m;
  const cnt=m.groups.reduce((a,x)=>a+x.qs.length,0);
  mount.innerHTML=`<div class="learning-meta"><b>${esc(m.source)} · ${cnt} سؤالاً</b><span class="pill">${esc(m.s.grade)}</span></div>${m.note?`<p class="notice">${esc(m.note)}</p>`:''}${paperHtml(m)}<details class="gen-keybox"><summary><b>إظهار الحل النموذجي وسلم التنقيط</b></summary>${keyHtml(m)}</details>${m.need>0?`<div class="generator-actions"><button class="primary-btn" onclick="SM_GENERATOR.fill()">استكمال النقص (${m.need} سؤالاً) بالذكاء الاصطناعي${aiReady()?'':' 🔒'}</button></div>`:''}<div class="generator-actions"><button class="primary-btn" onclick="SM_GENERATOR.keep()">💾 الاحتفاظ بالموضوع</button>${m.savedId?`<button class="secondary-btn danger" onclick="SM_GENERATOR.deleteSaved('${esc(m.savedId)}')">حذف الموضوع المحفوظ</button>`:``}<button class="secondary-btn" onclick="SM_GENERATOR.print('student')">طباعة نسخة التلميذ</button><button class="secondary-btn" onclick="SM_GENERATOR.print('both')">طباعة مع الحل</button><button class="secondary-btn" onclick="SM_GENERATOR.generate()">موضوع جديد</button></div>`;
  renderSavedPapers();
  try{mount.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}
 }
 function printPaper(mode){
  const m=g.SM_GENERATOR.last;if(!m)return;
  const w=g.open('','_blank');if(!w){say('اسمح بفتح نافذة الطباعة من إعدادات المتصفح.');return}
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${esc(m.title)}</title><style>@page{size:A4;margin:14mm}body{font-family:"Noto Naskh Arabic","Amiri",Arial,sans-serif;line-height:1.9;font-size:15px;color:#000}.gen-head{text-align:center;border-bottom:2px solid #000;margin-bottom:10px}.gen-head h3{margin:6px 0}.gen-warn{font-size:12px}.gen-ex h4{border-bottom:1px solid #999;margin:14px 0 6px}.gen-q{margin:8px 0}.gen-key{page-break-before:always}li{margin:3px 0}</style>${paperHtml(m)}${mode==='both'?keyHtml(m):''}</html>`);
  w.document.close();w.focus();setTimeout(()=>w.print(),300);
 }

 /* ---------- Raji3DZ references ---------- */
 function refsFor(s){
  if(!RJ)return[];
  const list=RJ.filter(x=>x.grade===s.grade&&x.subject===s.subject&&x.rights_cleared!==false&&(s.term===0||Number(x.term)===s.term||!x.term));
  return list.sort((a,b)=>(b.year||0)-(a.year||0)||(b.solution?1:0)-(a.solution?1:0));
 }
 function joinPdfItems(items){
  const lines=new Map();
  items.forEach(it=>{if(!it.str||!it.transform)return;const y=Math.round(it.transform[5]/3);if(!lines.has(y))lines.set(y,[]);lines.get(y).push(it)});
  return [...lines.keys()].sort((a,b)=>b-a).map(y=>lines.get(y).sort((a,b)=>b.transform[4]-a.transform[4]).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
 }
 async function refText(it){
  if(g.SM_RAJI3DZ&&g.SM_RAJI3DZ.textByFile){const r=await g.SM_RAJI3DZ.textByFile(it.file,4,5000);return r.text}
  if(!g.pdfjsLib)throw new Error('pdfjs');
  g.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';
  const r=await g.fetch(it.file);if(!r.ok)throw new Error('fetch');
  const pdf=await g.pdfjsLib.getDocument(Object.assign({data:await r.arrayBuffer()},g.SM_PDF_OPTS||{})).promise;let out='';
  for(let n=1;n<=Math.min(4,pdf.numPages);n++){const c=await (await pdf.getPage(n)).getTextContent();out+=(g.SM_PDF?g.SM_PDF.itemsToText(c.items):joinPdfItems(c.items))+'\n';if(out.length>5000)break}
  return out.slice(0,5000);
 }

 async function autoRef(s){
  const all=refsFor(s).filter(x=>x&&x.file);
  const pool=all.filter(x=>x.solution).concat(all.filter(x=>!x.solution)).slice(0,8);
  for(let k=0;k<3&&pool.length;k++){
   const it=pool.splice(Math.floor(Math.random()*pool.length),1)[0];
   try{const t=await refText(it);if(t&&t.replace(/\s/g,'').length>200)return t}catch(e){}
  }
  return '';
 }
 /* ---------- AI simulation (optional) ---------- */
 const aiReady=()=>!!(ls.get('smSchoolGroqKey')||(typeof apiBase==='function'&&apiBase()));
 function parseAI(text,s){
  const clean=String(text||'').replace(/```json|```/g,'');const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
  if(a<0||b<=a)return null;
  let j;try{j=JSON.parse(clean.slice(a,b+1))}catch(e){return null}
  const ex=Array.isArray(j.exercises)?j.exercises:null;if(!ex||!ex.length)return null;
  const groups=ex.map((e,i)=>({title:String(e.title||'التمرين '+(ORD[i]||i+1)),qs:(Array.isArray(e.questions)?e.questions:[]).map(q=>({topic:'',question:String(q.question||q.q||''),answer:String(q.answer||''),steps:Array.isArray(q.steps)?q.steps.map(String):[],explanation:String(q.explanation||''),choices:Array.isArray(q.choices)?q.choices.map(String):[]})).filter(q=>q.question)})).filter(x=>x.qs.length);
  if(!groups.length)return null;
  const n=groups.reduce((a,x)=>a+x.qs.length,0),total=Math.max(0,s.points);
  if(total>0){let left=total,seen=0;const per=Math.round(total/n*4)/4;groups.forEach(gr=>{gr.qs.forEach(q=>{seen++;q.points=seen===n?Math.max(0,Math.round(left*4)/4):Math.min(per,left);left-=q.points});gr.points=gr.qs.reduce((a,q)=>a+q.points,0)})}
  return groups;
 }
 async function aiCall(s,n,ref){
  const topics=(s.topics&&s.topics.length?s.topics:curTopics.map(t=>t.name).filter(t=>t!=='ذكاء اصطناعي')).join('، ');
  const k=KINDS[s.kind],comp=competencies(s).join(' — ');
  const message=`أنشئ ${k.t} في مادة ${s.subject} لتلاميذ ${s.grade}${s.stream?' ('+s.stream+'، تصنيف مؤقت)':''} وفق المنهاج الجزائري (السنة الدراسية 2026-2027)، ${termLabel(s.term)}.\n`+
   `المحاور المسموح بها فقط: ${topics||'حسب برنامج الفصل'}.\n${comp?'الكفاءات المستهدفة: '+comp+'.\n':''}`+
   `عدد الأسئلة الإجمالي: ${n}${k.ex&&n>=k.ex?'، موزعة على '+k.ex+' تمارين':''}. الصعوبة: ${DIFF_AR[s.difficulty]}.\n`+
   (ref?`نص من موضوع سابق للاستئناس بالأسلوب والبنية ومستوى الصعوبة فقط (لا تنقل جمله ولا أعداده ولا معطياته):\n"""${ref}"""\n`:'')+
   `التزم بما يدرسه تلميذ هذا المستوى في هذا الفصل ولا تتجاوزه. اختر معطيات جديدة وتأكد من صحة كل الحسابات في الحل. لا تدّعِ أن الموضوع رسمي.\n`+
   `أخرج JSON واحداً فقط بلا أي نص آخر بالشكل: {"exercises":[{"title":"التمرين الأول","questions":[{"question":"...","answer":"الجواب النهائي","steps":["خطوة 1","خطوة 2"],"explanation":"..."}]}]}`;
  const base=typeof apiBase==='function'?apiBase():'';
  const r=await g.fetch(`${base}/api/v1/ai/tutor`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'practice',message,language:'ar',grade:s.grade,subject:s.subject,learning_context:''})});
  const d=await r.json();if(!r.ok)throw new Error(d&&d.detail||'ai');
  const groups=parseAI(d.answer||d.response||'',Object.assign({},s,{points:s.points}));
  return {groups,raw:d.answer||d.response||''};
 }
 const noAi='<p class="notice">التوليد بالذكاء الاصطناعي يحتاج مفتاح Groq (من لوحة المعلّم الذكي) أو خادماً مفعّلاً.</p>';
 async function aiGenerate(refIdx){
  if(busy)return;const mount=$('smGeneratorResult');if(!mount)return;
  if(!aiReady()){mount.innerHTML=noAi;try{if(typeof g.toast==='function')g.toast('التوليد بالذكاء الاصطناعي يحتاج مفتاح Groq من لوحة المعلّم الذكي أو خادماً مفعّلاً.')}catch(e){}try{mount.scrollIntoView({behavior:'smooth'})}catch(e){}return}
  busy=true;const s=Object.assign({},st);
  mount.innerHTML='<p class="notice">جارٍ إعداد الموضوع بالذكاء الاصطناعي…</p>';
  let ref='',refNote='';
  try{
   if(refIdx==null){try{ref=await autoRef(s)}catch(e){}}else if(lastRefs[refIdx]){try{ref=await refText(lastRefs[refIdx])}catch(e){refNote='تعذّرت قراءة نص ملف المرجع (قد يكون ممسوحاً ضوئياً أو بلا اتصال)، فتم التوليد دون محاكاة نصه.'}}
   const {groups,raw}=await aiCall(s,s.count,ref);
   if(!groups){mount.innerHTML=`<div class="learning-meta"><b>ناتج الذكاء الاصطناعي (نص خام — يحتاج مراجعة)</b></div><div class="gen-paper" style="white-space:pre-wrap">${esc(raw)}</div>`;return}
   groups.forEach(gr=>gr.qs.forEach(q=>{q.ai=true;q.topic='ذكاء اصطناعي'}));
   saveAi(groups.flatMap(gr=>gr.qs),s);
   showResult(model(s,groups,'ذكاء اصطناعي'+(ref?' بمحاكاة نموذج Raji3DZ':'')+' — يلزم تدقيق المعلم',refNote));
  }catch(e){mount.innerHTML=`<p class="notice">تعذّر التوليد بالذكاء الاصطناعي: ${esc(e&&e.message||'خطأ')}. جرّب «توليد من المنصة».</p>`}
  finally{busy=false}
 }
 async function aiFill(){
  if(busy||!lastLocal)return;const mount=$('smGeneratorResult');if(!mount)return;
  if(!aiReady()){mount.insertAdjacentHTML('afterbegin',noAi);return}
  busy=true;const s=Object.assign({},lastLocal.s),need=Math.max(1,s.count-lastLocal.items.length);
  mount.insertAdjacentHTML('afterbegin','<p class="notice">جارٍ استكمال النقص بالذكاء الاصطناعي…</p>');
  try{
   const {groups}=await aiCall(Object.assign({},s,{points:0}),need,await autoRef(s).catch(()=>''));
   if(!groups)throw new Error('تعذّر فهم ناتج الذكاء الاصطناعي');
   const extra=groups.flatMap(gr=>gr.qs).slice(0,need).map(q=>({id:null,ai:true,topic:'ذكاء اصطناعي',question:q.question,answer:q.answer,steps:q.steps,explanation:q.explanation,choices:q.choices}));
   saveAi(extra,s);
   const items=lastLocal.items.concat(extra);lastLocal={s,items};
   showResult(model(s,structure(items,s),'بنك المنصة + استكمال بالذكاء الاصطناعي (الأسئلة 🤖 تحتاج تدقيقاً)',''));
  }catch(e){mount.insertAdjacentHTML('afterbegin',`<p class="notice">تعذّر الاستكمال: ${esc(e&&e.message||'خطأ')}</p>`)}
  finally{busy=false}
 }

 /* ---------- generate (local) ---------- */
 function generate(){
  ensure();const mount=$('smGeneratorResult');if(!mount)return;
  if(!st.subject){mount.innerHTML='<p class="notice">لا توجد مواد مسجلة لهذه السنة.</p>';return}
  const {items,note,poolSize}=pick(st);
  if(!items.length){mount.innerHTML='<p class="notice">لا تتوفر أسئلة لهذه المادة/الفصل/المحاور في قاعدة البيانات. غيّر الاختيار، أو جرّب التوليد بالذكاء الاصطناعي، ولن يُختلق محتوى بدلاً من ذلك.</p>';return}
  remember(items.map(x=>x.id).filter(Boolean));
  lastLocal={s:Object.assign({},st),items};
  const extra=items.length<st.count?`توفّر ${items.length} سؤالاً فقط من أصل ${st.count} مطلوب (حجم البنك المتاح: ${poolSize}).`:'';
  const mdl=model(st,structure(items,st),'بنك المنصة والمولّدات الحسابية',[note,extra].filter(Boolean).join(' '));mdl.need=Math.max(0,st.count-items.length);showResult(mdl);
 }

 /* ---------- form ---------- */
 function opts(list,cur){return list.map(x=>{const v=Array.isArray(x)?x[0]:x,t=Array.isArray(x)?x[1]:x;return `<option value="${esc(v)}"${String(v)===String(cur)?' selected':''}>${esc(t)}</option>`}).join('')}
 function refresh(){
  const box=$('smGenForm');if(!box)return;
  ensure();
  const {p}=poolFor(Object.assign({},st,{count:0}));
  const m=new Map();p.forEach(x=>m.set(topicOf(x),(m.get(topicOf(x))||0)+1));
  curTopics=[...m.entries()].map(([name,n])=>({name,n}));
  const sel=st.topics||curTopics.map(t=>t.name);
  lastRefs=refsFor(st);
  const k=KINDS[st.kind];
  box.innerHTML=`<div class="generator-grid">
   <label>نوع الموضوع<select onchange="SM_GENERATOR.set('kind',this.value)">${opts(kindsFor(st.grade).map(x=>[x,KINDS[x].t]),st.kind)}</select></label>
   <label>الطور والسنة<select onchange="SM_GENERATOR.set('grade',this.value)">${opts(GRADES,st.grade)}</select></label>
   <label>المادة<select onchange="SM_GENERATOR.set('subject',this.value)">${opts(subjectsFor(st.grade),st.subject)}</select></label>
   ${streamsFor(st.grade).length?`<label>${st.grade==='الأولى ثانوي'?'الجذع المشترك':'الشعبة'}<select onchange="SM_GENERATOR.set('stream',this.value)">${opts([['','— غير محددة —']].concat(streamsFor(st.grade).map(x=>[x,x])),st.stream)}</select></label>`:''}
   <label>الفصل<select ${k.allTerms?'disabled':''} onchange="SM_GENERATOR.set('term',this.value)">${k.allTerms?opts([[0,'كل فصول السنة']],0):opts([[1,'الأول'],[2,'الثاني'],[3,'الثالث']],st.term)}</select></label>
   <label>الصعوبة<select onchange="SM_GENERATOR.set('difficulty',this.value)">${opts([['mixed','متدرج'],['easy','سهل'],['medium','متوسط'],['hard','صعب']],st.difficulty)}</select></label>
   <label>عدد الأسئلة<select onchange="SM_GENERATOR.set('count',this.value)">${opts([3,5,6,8,10,12,14,16,20].map(x=>[x,x]),st.count)}</select></label>
   <label>المدة (دقيقة، 0 = بلا)<input type="number" min="0" max="300" value="${st.minutes}" onchange="SM_GENERATOR.set('minutes',this.value)"></label>
   <label>العلامة (0 = بلا تنقيط)<input type="number" min="0" max="100" value="${st.points}" onchange="SM_GENERATOR.set('points',this.value)"></label>
  </div>
  <div class="gen-topics"><b>المحاور (${curTopics.length})</b>${curTopics.length?curTopics.map((t,i)=>`<label class="gen-chip"><input type="checkbox" ${sel.includes(t.name)?'checked':''} onchange="SM_GENERATOR.topic(${i},this.checked)"> ${esc(t.name)} <small>${t.n}</small></label>`).join(''):'<small>لا توجد محاور مسجلة لهذا الاختيار.</small>'}</div>
  <div class="gen-saved"><label class="gen-chip"><input type="checkbox" ${st.useSaved?'checked':''} onchange="SM_GENERATOR.set('useSaved',this.checked)"> استخدام أسئلتي المحفوظة من الذكاء الاصطناعي <small>${savedBank().filter(x=>x.grade===st.grade&&x.subject===st.subject).length}</small></label><button class="text-btn" onclick="SM_GENERATOR.clearSaved()">مسح المحفوظ</button></div>
  <div class="generator-actions"><button class="primary-btn" onclick="SM_GENERATOR.generate()">توليد من المنصة</button><button class="secondary-btn" onclick="SM_GENERATOR.ai()">توليد بالذكاء الاصطناعي${aiReady()?'':' 🔒'}</button></div>
  <details class="gen-refs" ${lastRefs.length?'open':''}><summary><b>مراجع Raji3DZ للمحاكاة (${RJ?lastRefs.length:'…'})</b></summary>${!RJ?'<small>جارٍ التحميل…</small>':lastRefs.length?lastRefs.slice(0,8).map((it,i)=>`<div class="gen-ref"><span>${esc(it.title)}${it.year?' · '+it.year:''}${it.solution?' · بحل':''}</span><span><button class="text-btn" onclick="SM_GENERATOR.openRef(${i})">فتح</button><button class="text-btn" onclick="SM_GENERATOR.ai(${i})">محاكاة بالذكاء الاصطناعي</button></span></div>`).join(''):'<small>لا توجد ملفات مرجعية مزامَنة لهذا الاختيار بعد.</small>'}<div class="generator-actions"><button class="secondary-btn" onclick="SM_GENERATOR.raji()">فتح مكتبة Raji3DZ كاملة</button></div></details>`;
 }
 function set(k,v){
  if(k==='kind'){st.kind=v;applyKind()}
  else if(k==='grade'){st.grade=v;st.subject='';st.topics=null;st.stream='';if(!kindsFor(v).includes(st.kind)){st.kind='exercises';applyKind()}}
  else if(k==='subject'){st.subject=v;st.topics=null}
  else if(k==='term'){st.term=Number(v);st.topics=null}
  else if(['count','minutes','points'].includes(k))st[k]=Math.max(0,Number(v)||0);
  else st[k]=v;
  if(k==='useSaved')st.topics=null;
  refresh();
 }
 function topic(i,on){
  const all=curTopics.map(t=>t.name),cur=new Set(st.topics||all),name=curTopics[i]&&curTopics[i].name;
  if(!name)return;on?cur.add(name):cur.delete(name);
  st.topics=cur.size===all.length?null:[...cur];
 }
 function clearSaved(){if(g.confirm&&!g.confirm('حذف كل الأسئلة المحفوظة من الذكاء الاصطناعي على هذا الجهاز؟'))return;ls.set('smGenAiBank','[]');st.topics=null;refresh()}
 function openRef(i){const it=lastRefs[i];if(!it||!it.file)return;if(g.SM_RAJI3DZ&&g.SM_RAJI3DZ.openByFile)return g.SM_RAJI3DZ.openByFile(it.file);g.open(it.file,'_blank')}
 function raji(){if(typeof g.go==='function'){g.go('teacher');setTimeout(()=>{const p=$('rjLib');if(p&&p.scrollIntoView)p.scrollIntoView({behavior:'smooth'})},250)}}

 function injectStyle(){
  if(!doc||$('smGenStyle'))return;
  const s=doc.createElement('style');s.id='smGenStyle';
  s.textContent='.sm-generator .generator-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.sm-generator label{display:flex;flex-direction:column;gap:4px;font-size:13px}.sm-generator select,.sm-generator input[type=number]{min-height:44px}.gen-topics{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.gen-topics>b{width:100%}.gen-chip{flex-direction:row!important;align-items:center;gap:6px!important;padding:8px 12px;border:1px solid var(--line,#ccd);border-radius:999px;min-height:40px}.gen-refs{margin-top:12px}.gen-ref{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--line,#dde);font-size:13px}.gen-paper{padding:14px;border:1px solid var(--line,#dde);border-radius:14px;margin:10px 0;line-height:1.9}.gen-head{text-align:center;border-bottom:2px solid currentColor;margin-bottom:8px}.gen-ex h4{margin:14px 0 6px}.gen-pts{font-size:12px;opacity:.75}.gen-warn{font-size:12px;opacity:.8}.gen-q{margin:8px 0}.gen-saved-archive{margin-top:18px;padding:14px;border:1px solid var(--line,#ccd);border-radius:14px}.gen-saved-archive h3{margin:0 0 10px}.gen-saved-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line,#dde)}.gen-saved-row:last-child{border-bottom:0}.gen-saved-row small{display:block;opacity:.75;margin-top:4px}.danger{color:#b42318!important}';
  doc.head.appendChild(s);
 }
 function loadData(){
  if(!CUR)g.fetch('./data/curriculum-2026-2027.json').then(r=>r.json()).then(d=>{CUR=d.records||[];refresh()}).catch(()=>{CUR=[]});
  if(!PATHS)g.fetch('./data/secondary-pathways-2026-2027.json').then(r=>r.json()).then(d=>{PATHS={trunks:(d.first_year_common_trunks||[]).map(x=>x.name_ar),streams:(d.second_third_year_streams||[]).map(x=>x.name_ar)};refresh()}).catch(()=>{PATHS={trunks:[],streams:[]}});
  if(!RJ)g.fetch('./data/raji3dz-repository-index.json').then(r=>r.json()).then(d=>{RJ=d.items||[];refresh()}).catch(()=>{RJ=[];refresh()});
 }
 function page(){
  injectStyle();loadData();setTimeout(()=>{refresh();renderSavedPapers()},0);
  return `<section class="panel sm-generator"><div class="generator-heading"><div class="generator-icon">✨</div><div><h2>المولّد الذكي</h2><p>تمارين وفروض واختبارات مع الحلول وسلم التنقيط، وفق المنهاج الجزائري 2026-2027.</p></div></div><div id="smGenForm"></div><div class="notice" style="margin-top:12px">المحتوى تدريبي من بنك المنصة، ويُنسَّق على شكل موضوع. عند نقص بنك مادة يظهر ذلك صراحة ولا يُختلق محتوى. مواضيع الذكاء الاصطناعي تحتاج تدقيق المعلم.</div><div id="smGeneratorResult" class="generator-result" aria-live="polite"></div><div id="smGenSavedPapers" class="gen-saved-archive-wrap"></div></section>`;
 }
 g.SM_GENERATOR={set,topic,generate,ai:aiGenerate,fill:aiFill,clearSaved,print:printPaper,openRef,raji,gradeChanged:()=>refresh(),keep:persistPaper,deleteSaved:deletePaper,openSaved:openSavedPaper,last:null};
 g.SM_GEN2={saveAi,savedBank,aiCall,setPaths:p=>{PATHS=p},streamsFor,setLast:x=>{lastLocal=x},st,pick,structure,poolFor,parseAI,joinPdfItems,setData:(c,r)=>{CUR=c;RJ=r},refsFor,model,paperHtml,keyHtml,ensure,applyKind};
 g.smGeneratorPage=page;
})(typeof window!=='undefined'?window:globalThis);
