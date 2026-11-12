/* SM EDUCATION v2.9.40 — Textbook knowledge base for the Smart Teacher.
 * Every textbook the learner downloaded or imported (stored locally by smart-teacher-books.js) becomes ONE searchable
 * knowledge base: a page-level BM25 index built on the device and never uploaded.
 *  1) AI answers receive only the best matching pages (title + page number), and only when the learner enabled it;
 *  2) offline answers show the matching book pages (nothing leaves the device);
 *  3) a self-test proves a saved book can really be found again, and a readiness check shows why a download would fail. */
(function(g){'use strict';
 const KEY='smTextbookKbAuto',MAX_CTX=9000,MAX_SNIP=650,TOP=5;
 const clean=v=>String(v==null?'':v);
 const esc=s=>clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
 const lsGet=k=>{try{return g.localStorage.getItem(k)}catch(e){return null}};
 const lsSet=(k,v)=>{try{v?g.localStorage.setItem(k,v):g.localStorage.removeItem(k)}catch(e){}};
 const curGrade=()=>typeof grade!=='undefined'?grade:'';
 const byId=id=>g.document&&g.document.getElementById?g.document.getElementById(id):null;
 /* ---- Arabic-aware tokenizer (diacritics, alef/ya/ta-marbuta variants, Arabic-Indic digits, light stemming) ---- */
 function norm(s){return clean(s).normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g,'').replace(/[ٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).toLowerCase()}
 const STOP=new Set(['في','من','على','الي','عن','ما','ماذا','هو','هي','هل','ان','او','ثم','كيف','لماذا','هذا','هذه','ذلك','التي','الذي','مع','كل','قد','لا','لم','كان','يكون','اشرح','لي','عرف','اذكر','le','la','les','de','des','du','un','une','et','est','en','que','qui','the','is','of','and','to'].map(norm));
 function stem(w){if(/^[\u0600-\u06FF]+$/.test(w)){w=w.replace(/^(وال|فال|بال|كال|لل|ال)/,'');if(w.length>4)w=w.replace(/(ات|ون|ين|ان|ها|هم)$/,'');if(w.length>3)w=w.replace(/ه$/,'')}return w}
 function tokens(s){return norm(s).split(/[^\p{L}\p{N}]+/u).filter(w=>w&&!STOP.has(w)).map(stem).filter(t=>!STOP.has(t)&&(t.length>=2||/^\d$/.test(t)))}
 /* ---- index ---- */
 let idx=null,building=null;
 function pagesOf(b){
  if(Array.isArray(b.pageTexts)&&b.pageTexts.length)return b.pageTexts;
  const t=clean(b.text);if(!t)return [];
  const parts=t.split(/(?:^|\n)صفحة (\d+): /);const out=[];
  for(let i=1;i<parts.length;i+=2)out.push({page:Number(parts[i]),text:parts[i+1]||''});
  return out.length?out:[{page:1,text:t}];
 }
 async function build(){
  const rows=(g.SM_TEACHER_BOOKS&&g.SM_TEACHER_BOOKS.listSaved)?await g.SM_TEACHER_BOOKS.listSaved():[];
  const docs=[],post=new Map();let total=0;
  rows.forEach(b=>{pagesOf(b).forEach(p=>{
   const text=clean(p.text);if(text.replace(/\s/g,'').length<20)return;
   const toks=tokens(text),tf=new Map();toks.forEach(t=>tf.set(t,(tf.get(t)||0)+1));
   const di=docs.length;docs.push({b,page:p.page,text,len:toks.length||1});total+=toks.length||1;
   tf.forEach((c,t)=>{let a=post.get(t);if(!a){a=[];post.set(t,a)}a.push(di,c)});
  })});
  idx={docs,post,avg:docs.length?total/docs.length:1,books:rows};
  return idx;
 }
 function ensure(){if(idx)return Promise.resolve(idx);if(building)return building;building=build().finally(()=>{building=null});return building}
 function invalidate(){idx=null;building=null;setTimeout(()=>{ensure().then(renderStats).catch(()=>{})},0)}
 /* ---- search ---- */
 function snippet(text,termSet){
  const words=clean(text).split(/\s+/).filter(Boolean);
  const mark=words.map(w=>termSet.has(stem(norm(w).replace(/[^\p{L}\p{N}]/gu,''))) ? 1:0);
  const W=Math.min(90,words.length);let best=0,bestScore=-1,cur=0;
  for(let i=0;i<words.length;i++){cur+=mark[i];if(i>=W)cur-=mark[i-W];if(i>=W-1||i===words.length-1){if(cur>bestScore){bestScore=cur;best=Math.max(0,i-W+1)}}}
  let s=words.slice(best,best+W).join(' ');if(s.length>MAX_SNIP)s=s.slice(0,MAX_SNIP).replace(/\s+\S*$/,'');
  return (best>0?'… ':'')+s+(best+W<words.length?' …':'');
 }
 function run(I,q,o){
  o=o||{};const terms=[...new Set(tokens(q))];if(!terms.length||!I||!I.docs.length)return [];
  const gr=o.grade!==undefined?o.grade:curGrade(),N=I.docs.length,sc=new Map(),hit=new Map();
  terms.forEach(t=>{const a=I.post.get(t);if(!a)return;const n=a.length/2,idf=Math.log(1+(N-n+.5)/(n+.5));
   for(let i=0;i<a.length;i+=2){const d=I.docs[a[i]];if(gr&&d.b.grade!==gr)continue;if(o.bookId&&d.b.id!==o.bookId)continue;
    const tf=a[i+1],s=idf*tf*2.2/(tf+1.2*(.25+.75*d.len/I.avg));sc.set(a[i],(sc.get(a[i])||0)+s);hit.set(a[i],(hit.get(a[i])||0)+1)}});
  const need=terms.length>=3?Math.ceil(terms.length/2):1,out=[];
  sc.forEach((s,di)=>{if(hit.get(di)<need)return;const d=I.docs[di];let m=1;
   if(o.subject&&o.subject!=='عام'&&d.b.subject===o.subject)m*=1.3;
   if(o.preferBookId&&d.b.id===o.preferBookId)m*=1.5;
   out.push({di,score:s*m})});
  out.sort((a,b)=>b.score-a.score);
  const ts=new Set(terms);
  return out.slice(0,Math.max(1,Math.min(Number(o.limit)||TOP,20))).map(x=>{const d=I.docs[x.di];
   return{bookId:d.b.id,book:d.b.title,grade:d.b.grade,subject:d.b.subject,page:d.page,score:Math.round(x.score*100)/100,snippet:snippet(d.text,ts)}});
 }
 async function search(q,o){return run(await ensure(),q,o)}
 function searchSync(q,o){return idx?run(idx,q,o):[]}
 /* ---- AI context (consent-gated) ---- */
 let lastUsed=[];
 function enabled(){const cb=byId('smTbAiConsent');return lsGet(KEY)==='1'||!!(cb&&cb.checked)}
 function setAuto(v){lsSet(KEY,v?'1':null);const cb=byId('smTbAiConsent');if(cb)cb.checked=!!v;const a=byId('smKbAuto');if(a)a.checked=!!v;renderStats();return enabled()}
 function format(hits,cap){let out='';const used=[];for(const h of hits){const block=`[«${h.book}» — ${h.subject} — صفحة ${h.page}]\n${h.snippet}\n\n`;if((out+block).length>cap)break;out+=block;used.push(h)}return{text:out,used}}
 async function context(query,o){
  o=o||{};lastUsed=[];if(!enabled())return '';
  if(!tokens(query).length)return '';
  const hits=await search(query,{subject:o.subject,preferBookId:g.smTeacherSelectedBookId||'',limit:TOP});
  const f=format(hits,MAX_CTX);if(!f.text)return '';
  lastUsed=f.used;
  return `[مقتطفات من كتب مدرسية أضافها المستخدم؛ كل مقتطف مسبوق باسم الكتاب والمادة ورقم الصفحة]\n${f.text}[نهاية المقتطفات؛ استشهد باسم الكتاب ورقم الصفحة كما هما، وإن لم تحوِ المقتطفات الجواب فقل ذلك صراحة]`;
 }
 function lastSourcesLine(){
  if(!lastUsed.length)return '';const m=new Map();lastUsed.forEach(h=>{const a=m.get(h.book)||[];if(!a.includes(h.page))a.push(h.page);m.set(h.book,a)});
  return '📚 المصادر من كتبك: '+[...m].map(([b,p])=>`«${b}» ص ${p.join('، ')}`).join(' · ');
 }
 function syncContext(p){
  if(!enabled()||!idx||!p)return '';
  const q=[p.query,p.lesson,p.concept,p.topic].filter(Boolean).join(' ');if(!tokens(q).length)return '';
  const f=format(run(idx,q,{grade:p.grade||curGrade(),subject:p.subject,limit:3}),2500);
  return f.text?'\n\nمقتطفات من كتب المستخدم المدرسية (اذكر الكتاب والصفحة عند الاستشهاد):\n'+f.text:'';
 }
 /* ---- offline answers + prompt builders ---- */
 function offlineBlock(hits){return '📚 من كتبك المدرسية المفهرسة (بحث محلي لا يغادر الجهاز):\n'+hits.map(h=>`• «${h.book}» — ص ${h.page}: ${h.snippet.slice(0,380)}`).join('\n')}
 function wrapGlobals(){
  const old=g.offlineTutorReply;
  if(typeof old==='function'&&!old._kb){
   const f=async function(msg,subject){let base=null;try{base=await old.apply(this,arguments)}catch(e){}
    try{const hits=await search(msg,{subject,limit:3});if(hits.length)return (base?base+'\n\n':'')+offlineBlock(hits)}catch(e){}
    return base};
   f._kb=true;g.offlineTutorReply=f;
  }
  ['smTeacherBuildReviewContext','smTeacherBuildExamPrompt','smTeacherDeepContentContext'].forEach(n=>{
   const o=g[n];if(typeof o==='function'&&!o._kb){const w=function(p){return o.apply(this,arguments)+syncContext(p)};w._kb=true;g[n]=w}
  });
 }
 /* ---- stats, self-test, readiness ---- */
 async function stats(){
  const I=await ensure(),gr=curGrade(),rows=I.books;
  const mine=rows.filter(b=>!gr||b.grade===gr);
  return{books:rows.length,booksForGrade:mine.length,pages:I.docs.length,chars:rows.reduce((n,b)=>n+(Number(b.chars)||0),0),terms:I.post.size,auto:enabled()};
 }
 async function selfTest(){
  const I=await ensure(),rep=[];
  for(const b of I.books){
   const pages=pagesOf(b).filter(p=>clean(p.text).replace(/\s/g,'').length>=20);
   if(!pages.length){rep.push({id:b.id,title:b.title,ok:false,reason:'no-text'});continue}
   const p=pages[Math.floor(pages.length/2)];
   const toks=[...new Set(tokens(p.text))].filter(t=>t.length>=4&&I.post.has(t)).sort((a,c)=>I.post.get(a).length-I.post.get(c).length).slice(0,3);
   if(!toks.length){rep.push({id:b.id,title:b.title,ok:false,reason:'no-terms'});continue}
   const hits=run(I,toks.join(' '),{grade:'',bookId:b.id,limit:3});
   rep.push({id:b.id,title:b.title,pages:pagesOf(b).length,probePage:p.page,ok:hits.some(h=>h.page===p.page),found:hits.map(h=>h.page)});
  }
  return rep;
 }
 async function readiness(){
  const items=[],D=g.SM_TEXTBOOK_DL;
  if(!D||!D.status){items.push({ok:false,t:'وحدة التحميل غير محمّلة؛ حدّث الصفحة.'});return items}
  const s=await D.status();
  items.push(s.catalogue?{ok:true,t:`قائمة الكتب: ${s.catalogue} كتاباً (${s.forGrade} لهذا المستوى).`}:{ok:false,t:'قائمة الكتب فارغة؛ أضف كتباً بأداة Termux (tools/textbook_catalogue.js) ثم انشر الملف.'});
  items.push(s.hosts.length?{ok:s.hostsOk>0,t:`مصادر التحميل المسموحة: ${s.hosts.join('، ')} — ${s.hostsOk} كتاب برابط مطابق.`}:{ok:false,t:'لا مصدر تحميل مفعّل في config.js (textbookHosts).'});
  items.push(s.permission?{ok:true,t:'أكدتَ أن مصدر الكتب يسمح بالتحميل.'}:{ok:false,t:'لم تؤكد بعد أن المصدر يسمح بالتحميل (المربع في قسم «تحميل مباشر»).'});
  items.push(s.native?{ok:true,t:'تطبيق Android: الطلب يمر عبر CapacitorHttp دون قيود CORS.'}:{ok:null,t:'أنت في متصفح: قد يمنع CORS التحميل المباشر؛ التطبيق على Android لا يتأثر.'});
  const st=await stats();
  items.push(st.books?{ok:true,t:`قاعدة المعرفة: ${st.books} كتاباً، ${st.pages.toLocaleString('ar-DZ')} صفحة مفهرسة، ${st.terms.toLocaleString('ar-DZ')} مصطلحاً.`}:{ok:false,t:'لا كتب مفهرسة بعد؛ حمّل أو استورد كتاباً واحداً على الأقل.'});
  items.push(enabled()?{ok:true,t:'استعمال الكتب في أجوبة الذكاء الاصطناعي: مفعّل.'}:{ok:null,t:'استعمال الكتب في أجوبة الذكاء الاصطناعي: متوقف (الأجوبة دون اتصال تستعمل كتبك دائماً).'});
  const groq=!!(g.SM_GROQ&&g.SM_GROQ.enabled&&g.SM_GROQ.enabled());
  items.push(groq?{ok:true,t:'Groq مفعّل: يصل المقتطف المطابق إلى المعلم الذكي.'}:{ok:null,t:'Groq غير مفعّل: لن تُرسل مقتطفات إلى الذكاء الاصطناعي، لكن البحث المحلي يعمل.'});
  return items;
 }
 const mark=ok=>ok===true?'✅':ok===false?'❌':'⚠️';
 async function runChecks(){
  const el=byId('smKbReport');if(!el)return;el.innerHTML='<p>جارٍ الفحص…</p>';
  try{
   const r=await readiness(),t=await selfTest();
   el.innerHTML='<ul class="sm-kb-list">'+r.map(x=>`<li>${mark(x.ok)} ${esc(x.t)}</li>`).join('')+'</ul>'+
    (t.length?'<b>اختبار الاسترجاع (البحث عن كلمات نادرة من صفحة وسطى لكل كتاب)</b><ul class="sm-kb-list">'+t.map(x=>`<li>${x.ok?'✅':'❌'} ${esc(x.title)}${x.ok?` — وُجدت الصفحة ${x.probePage}`:x.reason==='no-text'?' — لا نص قابل للبحث (كتاب مصوّر؟ يحتاج OCR)':' — لم تُسترجع صفحة الاختبار'}</li>`).join('')+'</ul>':'');
  }catch(e){el.innerHTML='<p class="notice">تعذر الفحص: '+esc(e.message||e)+'</p>'}
 }
 async function probeUI(){
  const el=byId('smKbReport'),sel=byId('smKbProbe'),D=g.SM_TEXTBOOK_DL;if(!el||!D||!D.probe)return;
  if(!sel||!sel.value){el.innerHTML='<p class="notice">اختر كتاباً من القائمة أولاً (تظهر بعد إضافة كتب إلى القائمة).</p>';return}
  el.innerHTML='<p>جارٍ اختبار الاتصال (يُطلب أول كيلوبايت فقط)…</p>';
  const r=await D.probe(sel.value);
  el.innerHTML=`<ul class="sm-kb-list"><li>${r.ok?'✅':'❌'} ${esc(r.message)}</li>${r.status?`<li>رمز الاستجابة: ${r.status}${r.size?` · الحجم المعلن: ${(r.size/1048576).toFixed(1)} MB`:''}</li>`:''}</ul>`;
 }
 /* ---- UI ---- */
 async function renderStats(){
  const el=byId('smKbStats');if(!el)return;
  try{const s=await stats();
   el.innerHTML=`<div class="stats-grid"><div><b>${s.books}</b><small>كتاباً مفهرساً</small></div><div><b>${s.pages.toLocaleString('ar-DZ')}</b><small>صفحة قابلة للبحث</small></div><div><b>${s.booksForGrade}</b><small>كتاباً لهذا المستوى</small></div></div>`;
   const a=byId('smKbAuto');if(a)a.checked=s.auto;
   const sel=byId('smKbProbe'),D=g.SM_TEXTBOOK_DL;
   if(sel&&D&&D.list){await D.load();sel.innerHTML=D.list().map(b=>`<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('')}
  }catch(e){el.textContent=''}
 }
 function section(){return `<section class="panel sm-kb-panel" id="smKbPanel"><h3>🧠 قاعدة معرفة الكتب</h3><p>كل كتاب تحمّله أو تستورده يدخل تلقائياً في قاعدة بحث محلية واحدة. يستعين بها الأستاذ الذكي عند الإجابة ويذكر اسم الكتاب ورقم الصفحة.</p><div id="smKbStats"></div><label class="sm-kb-auto"><input type="checkbox" id="smKbAuto" onchange="SM_TEXTBOOK_KB.setAuto(this.checked)"> استعمال كتبي تلقائياً في أجوبة الذكاء الاصطناعي (يُرسَل المقتطف المطابق فقط، لا الكتاب كاملاً)</label><div class="sm-kb-actions"><button type="button" class="primary-btn" onclick="SM_TEXTBOOK_KB.runChecks()">✅ فحص الجاهزية والاسترجاع</button><select id="smKbProbe" aria-label="كتاب لاختبار الاتصال"></select><button type="button" class="secondary-btn" onclick="SM_TEXTBOOK_KB.probeUI()">اختبار الاتصال</button></div><div id="smKbReport" aria-live="polite"></div></section>`}
 const B=g.SM_TEACHER_BOOKS;
 if(B&&typeof B.panelHtml==='function'){
  const oldPanel=B.panelHtml;
  B.panelHtml=function(){const html=oldPanel.apply(this,arguments);setTimeout(renderStats,0);return html+section()};
  B.context=context;
  const oldImport=B.importBlob;
  if(typeof oldImport==='function')B.importBlob=async function(){const r=await oldImport.apply(this,arguments);invalidate();return r};
  const oldRemove=B.remove;
  if(typeof oldRemove==='function')B.remove=async function(){const r=await oldRemove.apply(this,arguments);invalidate();return r};
 }
 if(g.addEventListener)g.addEventListener('sm-books-changed',invalidate);
 if(g.document){
  if(g.document.readyState==='complete')wrapGlobals();else if(g.addEventListener)g.addEventListener('load',()=>{wrapGlobals();ensure().catch(()=>{})});
  if(g.document.head&&!byId('smTextbookKbCss')){const s=g.document.createElement('style');s.id='smTextbookKbCss';s.textContent='.sm-kb-panel{margin-top:14px}.sm-kb-auto{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:10px 0}.sm-kb-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sm-kb-actions select{min-width:0;flex:1}.sm-kb-list{list-style:none;padding:0;margin:8px 0;display:grid;gap:6px;font-size:13px;line-height:1.7}';g.document.head.appendChild(s)}
 }
 g.SM_TEXTBOOK_KB={search,searchSync,context,enabled,setAuto,stats,selfTest,readiness,runChecks,probeUI,invalidate,ensure,lastSourcesLine,render:renderStats,_t:{tokens,norm,run,syncContext,wrapGlobals,format}};
 g.SM_EDUCATION_RELEASE=g.SM_EDUCATION_RELEASE||{};g.SM_EDUCATION_RELEASE.features=Object.assign({},g.SM_EDUCATION_RELEASE.features||{},{textbookKnowledgeBase:true});
})(window);
