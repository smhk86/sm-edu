/* SM EDUCATION v2.9.7 — قاعدة معارف المساعد الذكي (منهاج جزائري).
   تبني فهرساً محلياً من: بنك التمارين (شروح وأمثلة محلولة)، الدروس التكميلية، خريطة المنهاج، ومقاطع اختيارية من
   data/tutor-kb.json (تُولَّد من ملفات مستودعك عبر tools/build_tutor_kb.py).
   تُستعمل لأمرين: 1) إرفاق مراجع بالسؤال قبل إرساله للذكاء الاصطناعي (RAG). 2) إجابة محلية أغنى عند انقطاع الاتصال. */
(function(g){'use strict';
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{version:'2.9.7',focus:'tutor-knowledge-base',features:(prior.features||[]).concat(['tutor-kb-bm25-search','tutor-rag-context','tutor-offline-rich-answers','tutor-kb-builder-tool'])});

 const STOP=new Set(['ما','ماذا','هو','هي','هذا','هذه','في','من','على','الي','إلى','عن','كيف','لماذا','اشرح','شرح','لي','لنا','درس','سؤال','هل','اعطني','أعطني','اريد','أريد','بين','مع','او','أو','ثم','كل','هناك','يمكن','وضح','أذكر','اذكر','عرف','عرّف']);
 const norm=s=>String(s==null?'':s).normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase();
 const STOPN=new Set([...STOP].map(norm));
 function tokens(s){
  return norm(s).split(/[^\p{L}\p{N}]+/u).map(w=>w.replace(/^(وال|بال|كال|فال|لل|ال)/,'')).filter(w=>w.length>=2&&!STOPN.has(w));
 }
 const levelOf=gr=>/ابتدائي/.test(gr||'')?'primary':/متوسط/.test(gr||'')?'middle':/ثانوي/.test(gr||'')?'secondary':'';
 const ls={get:k=>{try{return g.localStorage.getItem(k)||''}catch(e){return ''}}};

 /* ---------- الفهرس ---------- */
 let DOCS=[],POST=new Map(),VOCAB=[],AVG=1,READY=false,BUILDING=null,EXTRA=null,CUR=null,RJ=null;
 const stats={bank:0,lessons:0,curriculum:0,external:0};

 function add(d){d.tk=tokens(d.title).concat(tokens(d.title),tokens(d.title),tokens(d.text));d.len=d.tk.length||1;DOCS.push(d)}
 function build(){
  DOCS=[];stats.bank=stats.lessons=stats.curriculum=stats.external=0;
  const recs=typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords)?exerciseBankRecords:[];
  const by=new Map();
  recs.forEach(r=>{const k=[r.grade,r.subject,r.lesson||r.topic].join('|');if(!by.has(k))by.set(k,[]);by.get(k).push(r)});
  by.forEach(rs=>{
   const r0=rs[0],exps=[...new Set(rs.map(r=>r.explanation).filter(Boolean))].slice(0,3);
   const exr=rs.find(r=>(r.solution_steps||[]).length)||rs[0];
   add({kind:'lesson-bank',grade:r0.grade,subject:r0.subject,term:Number(r0.term)||0,title:(r0.lesson||r0.topic||'')+(r0.topic&&r0.lesson&&r0.topic!==r0.lesson?' — '+r0.topic:''),lesson:r0.lesson||r0.topic||'',text:exps.join(' '),ex:{q:exr.question,sol:exr.solution,steps:exr.solution_steps||[],choices:exr.choices||[]},src:'بنك التمارين'});
   stats.bank++;
  });
  let sl=[];try{sl=typeof starterLessons!=='undefined'&&Array.isArray(starterLessons)?starterLessons:[]}catch(e){}
  sl.forEach(x=>{
   const ar=k=>x[k]&&(x[k].ar||'')||'';
   if(!ar('title'))return;
   add({kind:'lesson-extra',grade:x.gr||'',level:x.g||levelOf(x.gr),subject:x.s,title:ar('title'),lesson:ar('title'),text:[ar('goal'),ar('body'),ar('task')?'تطبيق: '+ar('task')+(ar('answer')?' الحل: '+ar('answer'):''):''].filter(Boolean).join(' '),src:'دروس تكميلية'});
   stats.lessons++;
  });
  (CUR||[]).forEach(r=>{
   const ts=r.platform_learning_map&&r.platform_learning_map.terms||[];
   ts.forEach(t=>{
    const topics=(t.platform_topics||[]).join('، '),lessons=(t.platform_lessons||[]).join('، '),comp=(t.competency_targets||[]).join('؛ ');
    if(!topics&&!lessons)return;
    add({kind:'scope',grade:r.grade,subject:r.subject,term:Number(t.term)||0,title:'برنامج '+r.subject+' '+r.grade+' الفصل '+t.term,lesson:'',text:'المحاور: '+topics+'. الدروس: '+lessons+'.'+(comp?' الكفاءات: '+comp:''),scope:{topics:t.platform_topics||[],lessons:t.platform_lessons||[],comp:t.competency_targets||[]},src:'خريطة المنهاج'});
    stats.curriculum++;
   });
  });
  (EXTRA||[]).forEach(c=>{
   if(!c||!c.text)return;
   add({kind:'external',grade:c.grade||'',subject:c.subject||'',term:Number(c.term)||0,title:c.title||'',lesson:'',text:c.text,src:c.source||'مستودع',ref:c.ref||'',solution:!!c.solution});
   stats.external++;
  });
  POST=new Map();let tot=0;
  DOCS.forEach((d,i)=>{
   tot+=d.len;const tf=new Map();d.tk.forEach(t=>tf.set(t,(tf.get(t)||0)+1));d.tf=tf;
   tf.forEach((c,t)=>{if(!POST.has(t))POST.set(t,[]);POST.get(t).push(i)});
  });
  AVG=DOCS.length?tot/DOCS.length:1;VOCAB=[...POST.keys()];READY=true;
 }
 function loadAll(){
  if(BUILDING)return BUILDING;
  const get=u=>g.fetch(u).then(r=>r.ok?r.json():null).catch(()=>null);
  BUILDING=Promise.all([
   (async()=>{if(typeof exerciseBankRecords!=='undefined'&&exerciseBankRecords.length)return;const d=await get('./data/exercise-bank-2026-2027.json');if(d&&Array.isArray(d.records)&&typeof exerciseBankRecords!=='undefined')exerciseBankRecords=d.records})(),
   get('./data/curriculum-2026-2027.json').then(d=>{CUR=d&&d.records||[]}),
   get('./data/tutor-kb.json').then(d=>{EXTRA=d&&Array.isArray(d.chunks)?d.chunks:[]}),
   get('./data/raji3dz-repository-index.json').then(d=>{RJ=d&&d.items||[]})
  ]).then(()=>{build()}).catch(()=>{build()});
  return BUILDING;
 }
 const expandCache=new Map();
 function expand(t){
  if(POST.has(t))return [t];
  if(expandCache.has(t))return expandCache.get(t);
  let r=[];if(t.length>=4){const p=t.slice(0,4);r=VOCAB.filter(w=>w.length>=4&&w.slice(0,4)===p).slice(0,6)}
  expandCache.set(t,r);return r;
 }

 /* ---------- البحث (BM25) ---------- */
 function search(query,opt){
  opt=opt||{};if(!READY)build();
  const qt=[...new Set(tokens(query))];if(!qt.length)return[];
  const gr=opt.grade||'',lv=levelOf(gr),sub=opt.subject&&opt.subject!=='عام'?opt.subject:'';
  const N=DOCS.length,k1=1.4,b=0.75,score=new Map();
  qt.forEach(q=>{
   expand(q).forEach((t,ei)=>{
    const post=POST.get(t);if(!post)return;
    const idf=Math.log(1+(N-post.length+0.5)/(post.length+0.5)),w=ei===0&&t===q?1:0.5;
    post.forEach(i=>{const d=DOCS[i],f=d.tf.get(t)||0;score.set(i,(score.get(i)||0)+w*idf*(f*(k1+1))/(f+k1*(1-b+b*d.len/AVG)))});
   });
  });
  const out=[];
  score.forEach((s,i)=>{
   const d=DOCS[i];
   if(sub&&d.subject&&d.subject!==sub)return;
   const dl=d.level||levelOf(d.grade);
   let f=1;
   if(d.grade){f=d.grade===gr?1:(lv&&dl===lv?0.6:0.2)}else if(dl&&lv&&dl!==lv)f=0.3;
   if(opt.term&&d.term&&d.term!==opt.term)f*=0.85;
   if(d.kind==='scope')f*=0.6;
   out.push({d,s:s*f});
  });
  out.sort((a,b)=>b.s-a.s);
  const seen=new Set(),res=[];
  for(const h of out){const key=norm(h.d.title)+'|'+norm(h.d.text).slice(0,80);if(seen.has(key))continue;seen.add(key);res.push(h);if(res.length>=(opt.k||5))break}
  return res;
 }
 function scopeFor(grade,subject){
  return DOCS.filter(d=>d.kind==='scope'&&d.grade===grade&&(!subject||subject==='عام'||d.subject===subject));
 }
 function examRefs(grade,subject,n){
  if(!RJ||!subject||subject==='عام')return[];
  return RJ.filter(x=>x.grade===grade&&x.subject===subject&&x.rights_cleared!==false).sort((a,b)=>(b.year||0)-(a.year||0)).slice(0,n||3);
 }
 const clip=(s,n)=>{s=String(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n)+'…':s};

 /* ---------- RAG ---------- */
 function contextFor(msg,grade,subject){
  const hits=search(msg,{grade,subject,k:4}).filter(h=>h.d.kind!=='scope'||h.s>0);
  if(!hits.length)return {text:'',titles:[]};
  const lines=hits.map((h,i)=>{
   const d=h.d;
   return `(${i+1}) ${d.title} [${d.subject||''} ${d.grade||''}${d.term?' ف'+d.term:''}]: ${clip(d.text,520)}${d.ex?` مثال: ${clip(d.ex.q,160)} ← ${clip(d.ex.sol,120)}`:''}`;
  });
  return {text:lines.join('\n'),titles:hits.filter(h=>h.d.kind!=='scope').map(h=>h.d.title).filter(Boolean)};
 }

 /* ---------- اعتراض استدعاءات المساعد ---------- */
 const prevFetch=g.fetch.bind(g);
 g.fetch=async function(input,init){
  try{
   const url=typeof input==='string'?input:(input&&input.url)||'';
   if(/\/api\/v1\/ai\/tutor$/.test(url.split('?')[0])&&init&&typeof init.body==='string'){
    const p=JSON.parse(init.body);
    if(['lesson','practice','evaluate'].includes(p.task)&&p.message&&!p.__kb){
     await loadAll();
     const ctx=contextFor(p.message,p.grade,p.subject);
     if(ctx.text){
      const p2=Object.assign({},p,{__kb:1,message:p.message+'\n\n[مراجع من قاعدة معارف المنصة للمنهاج الجزائري — استأنس بها لضبط المستوى والمصطلحات، ولا تنقلها حرفياً، ولا تعتمد معلومة منها إن خالفت الدقة العلمية أو مستوى التلميذ]\n'+ctx.text});
      const res=await prevFetch(input,Object.assign({},init,{body:JSON.stringify(p2)}));
      if(res.ok&&ctx.titles.length){
       try{
        const d=await res.clone().json();
        if(d&&typeof d.answer==='string'){
         d.answer+='\n\n📚 استأنسنا بدروس من قاعدة المنصة: '+[...new Set(ctx.titles)].slice(0,3).join('، ')+'.';
         return new Response(JSON.stringify(d),{status:res.status,headers:{'Content-Type':'application/json'}});
        }
       }catch(e){}
      }
      return res;
     }
    }
   }
  }catch(e){}
  return prevFetch(input,init);
 };

 /* ---------- إجابة محلية أغنى ---------- */
 const origOffline=typeof g.offlineTutorReply==='function'?g.offlineTutorReply:null;
 async function offlineReply(msg,subject,task){
  const L=typeof lang!=='undefined'?lang:'ar';
  if(L!=='ar'&&origOffline)return origOffline(msg,subject,task);
  try{
   await loadAll();
   const gr=typeof grade!=='undefined'?grade:'';
   const hits=search(msg,{grade:gr,subject,k:6});
   const lessons=hits.filter(h=>h.d.kind!=='scope');
   const head='⚠️ المساعد غير متصل بالذكاء الاصطناعي، فهذه إجابة من قاعدة معارف المنصة (مادة تدريبية وليست مرجعاً رسمياً).';
   if(!lessons.length){
    if(origOffline){const o=await origOffline(msg,subject,task);if(o)return o}
    const sc=scopeFor(gr,subject)[0];
    return head+'\n\nلم أجد درساً مطابقاً لسؤالك.'+(sc?'\nمحاور هذه المادة في مستواك: '+sc.scope.topics.slice(0,8).join('، ')+'.':'')+'\nجرّب صياغة أقصر باسم الدرس.';
   }
   const top=lessons[0].d;
   if(task==='practice'&&origOffline){const o=await origOffline(msg,subject,task);if(o)return o}
   let out=head+`\n\n📚 ${top.title}${top.subject?' — '+top.subject:''}${top.grade?' · '+top.grade:''}\n`;
   if(top.text)out+='\n'+clip(top.text,900)+'\n';
   if(top.ex){
    out+=`\n✏️ مثال: ${top.ex.q}`;
    if(top.ex.choices&&top.ex.choices.length)out+='\n   '+top.ex.choices.map((c,j)=>['أ','ب','ج','د'][j]+') '+c).join('   ');
    out+=`\nالحل: ${top.ex.sol}`;
    if(top.ex.steps&&top.ex.steps.length)out+='\n'+top.ex.steps.map((x,i)=>`${i+1}. ${x}`).join('\n');
    out+='\n';
   }
   const more=lessons.slice(1,4).filter(h=>h.d.title!==top.title);
   if(more.length)out+='\n🔗 دروس قريبة: '+more.map(h=>h.d.title).join('، ')+'\n';
   const ext=lessons.find(h=>h.d.kind==='external');
   if(ext)out+='\n📄 مقطع من '+ext.d.src+(ext.d.title?' ('+ext.d.title+')':'')+': '+clip(ext.d.text,400)+'\n';
   const sc=scopeFor(top.grade||gr,top.subject||subject).find(d=>!top.term||d.term===top.term)||scopeFor(top.grade||gr,top.subject||subject)[0];
   if(sc&&sc.scope.comp.length)out+='\n🎯 الكفاءة المستهدفة: '+clip(sc.scope.comp[0],200)+'\n';
   const refs=examRefs(top.grade||gr,top.subject||subject,3);
   if(refs.length)out+='\n📑 نماذج مرجعية للتدرب (Raji3DZ): '+refs.map(x=>x.title).join(' | ')+'\n';
   if(task==='evaluate')out+='\nملاحظة: تصحيح الإجابات النصية يحتاج الاتصال بالذكاء الاصطناعي.';
   return out.trim();
  }catch(e){return origOffline?origOffline(msg,subject,task):null}
 }
 g.offlineTutorReply=offlineReply;

 g.SM_TUTOR_KB={ready:()=>READY,load:loadAll,search,contextFor,scopeFor,examRefs,tokens,norm,stats:()=>Object.assign({docs:DOCS.length},stats),setData:(c,r,e)=>{CUR=c;RJ=r;EXTRA=e||[];build()}};
 // ابدأ التحميل مبكراً دون تعطيل الواجهة
 if(g.document)g.setTimeout(()=>{loadAll()},2500);
})(typeof window!=='undefined'?window:globalThis);
