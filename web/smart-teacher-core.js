/* SM EDUCATION — Smart Teacher core (radical rework of the tutor chat).
 * 1) ONE local knowledge index over every platform source (deep lesson packs, encyclopedia, exercise bank) searched
 *    across ALL subjects and nearby grades — the learner no longer has to pick the "right" subject first;
 * 2) the retrieved lessons ground the Gemini answer (kb_context) and the last turns are sent too (real conversation);
 * 3) a Gemini failure is shown IN the chat with its real reason, followed by the best local answer — never a silent fallback;
 * 4) the local answer is a real lesson (explanation, rule, worked example, mind-map, remedial tasks), or an honest
 *    "not in the base" with the closest lessons found in any grade/subject.
 * Derived platform content is a study aid, not an official ministry text. */
(function(g){'use strict';
 const clean=v=>String(v==null?'':v);
 const esc=s=>clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const curGrade=()=>typeof grade!=='undefined'?grade:'';
 const curLang=()=>typeof lang!=='undefined'?lang:'ar';
 const aiEnabled=()=>{try{if(g.SM_AI&&typeof g.SM_AI.enabled==='function')return !!g.SM_AI.enabled()}catch(e){}return !!lsGet('smSchoolGeminiKeys')};
 const lsGet=k=>{try{return g.localStorage.getItem(k)||''}catch(e){return ''}};
 /* ---------- Arabic-aware tokenizer ---------- */
 function norm(s){return clean(s).normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).toLowerCase()}
 const STOP=new Set(['في','من','على','الي','عن','ما','ماذا','هو','هي','هل','ان','او','ثم','كيف','لماذا','هذا','هذه','ذلك','التي','الذي','مع','كل','قد','لا','لم','كان','يكون','اشرح','شرح','لي','عرف','اذكر','درس','حول','عن','le','la','les','de','des','du','un','une','et','what','is','the','of','and','explain']);
 function stem(w){if(/^[\u0600-\u06FF]+$/.test(w)){w=w.replace(/^(وال|فال|بال|كال|لل|ال)/,'');if(w.length>4)w=w.replace(/(ات|ون|ين|ان|ها|هم)$/,'');if(w.length>3)w=w.replace(/ه$/,'')}return w}
 function tokens(s){return norm(s).split(/[^\p{L}\p{N}]+/u).filter(w=>w&&!STOP.has(w)).map(stem).filter(t=>!STOP.has(t)&&(t.length>=2||/^\d$/.test(t)))}
 /* ---------- index ---------- */
 const FILES={deep:'./data/teacher-deep-content-2026-2027.json',bank:'./data/exercise-bank-2026-2027.json',ency:'./data/teacher-encyclopedia-2026-2027.json'};
 const load=u=>typeof g.smFetchJSON==='function'?g.smFetchJSON(u):g.fetch(u).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
 let IDX=null,building=null,buildError='';
 function addDoc(I,d){const tf=new Map();
  const add=(txt,wt)=>tokens(txt).forEach(t=>tf.set(t,(tf.get(t)||0)+wt));
  add(d.lesson,5);add(d.topic,3);add(d.subject,1);add(d.body,1);
  let len=0;tf.forEach(v=>{len+=v});d.len=len||1;I.total+=d.len;
  const di=I.docs.length;I.docs.push(d);
  tf.forEach((c,t)=>{let a=I.post.get(t);if(!a){a=[];I.post.set(t,a)}a.push(di,c)});
 }
 async function build(){
  const I={docs:[],post:new Map(),total:0,avg:1,counts:{deep:0,ency:0,bank:0},byKey:new Map()};
  const [deep,bank]=await Promise.all([load(FILES.deep).catch(e=>{buildError=String(e&&e.message||e);return null}),load(FILES.bank).catch(()=>null)]);
  const byLesson=new Map();
  if(deep&&Array.isArray(deep.records))deep.records.forEach(r=>{
   const le=r.lesson_explanation||{},ru=r.rules_and_laws||{},ex=(r.new_worked_examples||[])[0]||{},mm=r.mind_map||{};
   const body=[le.intro,(le.core_explanation||[]).join(' '),(le.teaching_sequence||[]).join(' '),ru.rule,ru.new_example,ex.question,ex.answer,(mm.branches||[]).map(b=>(b.items||[]).join(' ')).join(' ')].join(' ');
   const d={kind:'pack',id:r.lesson_id,grade:r.grade,stage:r.stage,subject:r.subject,term:r.term,topic:r.topic,lesson:r.lesson,body,rec:r,ex:[]};
   addDoc(I,d);I.counts.deep++;byLesson.set(r.grade+'|'+r.subject+'|'+r.lesson,d);
  });
  /* exercises enrich each lesson pack (and become stand-alone docs when no pack exists for the lesson) */
  const rows=bank&&Array.isArray(bank.records)?bank.records:[];
  rows.forEach(r=>{const k=r.grade+'|'+r.subject+'|'+r.lesson,host=byLesson.get(k);
   if(host){if(host.ex.length<6)host.ex.push(r);I.counts.bank++;return}
   const d={kind:'exercise',id:r.id,grade:r.grade,stage:r.stage,subject:r.subject,term:r.term,topic:r.topic,lesson:r.lesson,body:[r.question,r.solution,r.explanation,(r.solution_steps||[]).join(' ')].join(' '),rec:r,ex:[r]};
   byLesson.set(k,d);addDoc(I,d);I.counts.bank++;
  });
  I.avg=I.docs.length?I.total/I.docs.length:1;
  return I;
 }
 function ensure(){if(IDX)return Promise.resolve(IDX);if(building)return building;building=build().then(I=>{IDX=I;return I}).finally(()=>{building=null});return building}
 /* ---------- search (BM25-like, all subjects, grade-aware) ---------- */
 function run(I,q,o){
  o=o||{};const terms=[...new Set(tokens(q))];if(!terms.length||!I||!I.docs.length)return [];
  const N=I.docs.length,sc=new Map(),hit=new Map();
  terms.forEach(t=>{const a=I.post.get(t);if(!a)return;const n=a.length/2,idf=Math.log(1+(N-n+.5)/(n+.5));
   for(let i=0;i<a.length;i+=2){const d=I.docs[a[i]],tf=a[i+1],s=idf*tf*2.2/(tf+1.2*(.25+.75*d.len/I.avg));sc.set(a[i],(sc.get(a[i])||0)+s);hit.set(a[i],(hit.get(a[i])||0)+1)}});
  const need=terms.length>=3?Math.ceil(terms.length/2):1,gr=o.grade===undefined?curGrade():o.grade,out=[];
  sc.forEach((s,di)=>{if(hit.get(di)<need)return;const d=I.docs[di];let m=1;
   if(gr&&d.grade===gr)m*=1.6;
   if(o.subject&&o.subject!=='عام'&&d.subject===o.subject)m*=1.7;
   if(d.kind==='pack')m*=1.15;
   out.push({d,score:s*m,cover:hit.get(di)/terms.length})});
  out.sort((a,b)=>b.score-a.score);
  return out.slice(0,Math.max(1,Math.min(Number(o.limit)||5,12)));
 }
 const search=(q,o)=>ensure().then(I=>run(I,q,o));
 /* ---------- confidence: is the best hit really about the question? ---------- */
 function confident(hits,q){
  if(!hits.length)return false;const terms=[...new Set(tokens(q))],top=hits[0];
  if(!terms.length)return false;
  const title=new Set(tokens(top.d.lesson+' '+top.d.topic));
  const titleHit=terms.filter(t=>title.has(t)).length;
  return top.cover>=0.6&&(titleHit>=1||top.cover>=0.99&&terms.length>=2);
 }
 /* ---------- local answer composer ---------- */
 const L=(ar,fr,en)=>{const l=curLang();return l==='ar'?ar:l==='fr'?fr:en};
 const list=a=>(a||[]).filter(Boolean).map(x=>'• '+x).join('\n');
 /* the generated packs repeat templated filler around a few real facts: keep each real sentence once, drop the filler */
 const FILLER=/^(نقرأ السؤال|سؤال تطبيقي|إجابة نموذجية|مثال توضيحي|أعد صياغة القاعدة|اطلب من المتعلم|قارن بين مثال|استعمل كلمات الدرس|يركز هذا الدرس|اتبع الخطوات|طبّق فكرة الدرس|نحدد المطلوب|الفكرة الأساسية ←|اشرح بكلماتك|أنشئ وضعية)/;
 function facts(r){const le=r.lesson_explanation||{},ru=r.rules_and_laws||{},ex=(r.new_worked_examples||[])[0]||{};
  const seen=new Set(),out=[];
  [].concat(le.core_explanation||[],[ru.rule],(le.teaching_sequence||[]),[ru.new_example,ex.answer]).forEach(x=>{x=clean(x).trim();if(!x||FILLER.test(x))return;
   const k=norm(x).replace(/[^\p{L}\p{N}]+/gu,' ').trim();if(!k||seen.has(k)||[...seen].some(y=>y.includes(k)||k.includes(y)))return;seen.add(k);out.push(x)});
  return out}
 function packAnswer(d){
  const r=d.rec,F=facts(r),ex=d.ex&&d.ex[0];
  const out=[`**${d.lesson}**  ·  ${d.subject}  ·  ${d.grade}`];
  if(F.length)out.push('','## '+L('ما تحتويه القاعدة عن هذا الدرس','Ce que contient la base','What the base contains'),list(F));
  else out.push('',L('لا تحتوي القاعدة على شرح لهذا الدرس، بل على تمارين فقط.','La base ne contient que des exercices.','The base only has exercises for this lesson.'));
  if(ex)out.push('','## '+L('جرّب بنفسك','Essayez','Try it'),ex.question+(ex.choices&&ex.choices.length?'\n'+ex.choices.map((c,i)=>'• '+String.fromCharCode(65+i)+'. '+c).join('\n'):''),'**'+L('الجواب','Réponse','Answer')+':** '+ex.solution+(ex.explanation&&norm(ex.explanation)!==norm(ex.solution)?' — '+ex.explanation:''));
  if(F.length<3)out.push('','⚠️ '+L('المتوفر في القاعدة عن هذا الدرس محدود جداً. لشرح أوسع اضغط «تعمّق بالذكاء الاصطناعي» أو أضف كتاب المادة إلى التطبيق.','Contenu très limité pour cette leçon.','Very little content for this lesson in the base.'));
  out.push('','*'+L('المصدر: قاعدة بيانات المنصة — مادة مشتقة للدراسة وليست نصاً وزارياً معتمداً.','Source : base de la plateforme (non officiel).','Source: platform knowledge base (not an official text).')+'*');
  return out.join('\n');
 }
 function exerciseAnswer(d){const e=d.rec;return [`**${d.lesson}**  ·  ${d.subject}  ·  ${d.grade}`,'',e.question+(e.choices&&e.choices.length?'\n'+e.choices.map((c,i)=>'• '+String.fromCharCode(65+i)+'. '+c).join('\n'):''),'','**'+L('الجواب','Réponse','Answer')+':** '+e.solution,e.explanation||'',(e.solution_steps||[]).map((x,i)=>(i+1)+'. '+x).join('\n'),'','*'+L('المصدر: بنك تمارين المنصة.','Source : banque d’exercices.','Source: exercise bank.')+'*'].filter((x,i)=>x!==''||i<3).join('\n')}
 const compose=d=>d.kind==='pack'?packAnswer(d):exerciseAnswer(d);
 const place=d=>`${d.grade} — ${d.subject} — ${d.lesson}`;
 function localAnswer(msg,hits,opts){
  opts=opts||{};const gr=curGrade();
  if(hits.length&&confident(hits,msg)){
   const top=hits[0].d,others=hits.slice(1,4).map(h=>place(h.d));
   const note=gr&&top.grade!==gr?'ℹ️ '+L(`هذا الدرس مسجّل في مستوى «${top.grade}» (مستواك الحالي «${gr}»).`,`Cette leçon est classée en « ${top.grade} ».`,`This lesson is filed under “${top.grade}”.`)+'\n\n':'';
   return note+compose(top)+(others.length?'\n\n➕ '+L('دروس قريبة','Leçons proches','Related lessons')+':\n'+list(others):'');
  }
  const near=hits.slice(0,5).map(h=>place(h.d));
  const parts=[L('لا يوجد في قاعدة المنصة المحلية درس يتناول هذا السؤال بدقة.','Aucune leçon de la base locale ne traite précisément cette question.','The local base has no lesson that precisely covers this question.')];
  if(near.length)parts.push('','**'+L('أقرب ما وجدتُه (قد لا يكون هو المقصود)','Le plus proche','Closest found (may not be what you mean)')+':**',list(near));
  parts.push('',L('للحصول على شرح حرّ لأي موضوع: فعّل مفتاح Gemini (لوحة «إعدادات المساعد»)، أو حمّل كتاب المادة داخل التطبيق ليبحث فيه المعلم ويستشهد برقم الصفحة.','Pour une explication libre : activez la clé Gemini ou ajoutez le manuel de la matière.','For a free explanation: enable the Gemini key or add the subject textbook.'));
  return parts.join('\n');
 }
 /* ---------- grounded context for the AI ---------- */
 function kbContextSync(msg){
  if(!IDX)return '';const hits=run(IDX,msg,{limit:4});if(!hits.length||!confident(hits,msg))return '';
  return hits.slice(0,3).map(h=>{const d=h.d,r=d.rec;
   if(d.kind==='pack'){const le=r.lesson_explanation||{},ru=r.rules_and_laws||{};
    return `[${place(d)}]\n${(le.core_explanation||[]).slice(0,3).join(' ')}\nالقاعدة: ${ru.rule||''}\nالخطوات: ${(le.teaching_sequence||[]).slice(0,4).join(' ← ')}`}
   return `[${place(d)}]\n${r.question} — ${r.solution}. ${r.explanation||''}`}).join('\n\n').slice(0,4500);
 }
 const prev=g.offlineTutorReply;
 /* ---------- answer mode: 'db' = platform knowledge base first (default), 'ai' = Gemini first ---------- */
 const MODE_KEY='smTeacherMode';
 let forceAI=false;const getMode=()=>lsGet(MODE_KEY)==='ai'?'ai':'db';
 const setMode=v=>{try{g.localStorage.setItem(MODE_KEY,v==='ai'?'ai':'db')}catch(e){}};
 const jsonRes=(obj,status)=>new Response(JSON.stringify(obj),{status:status||200,headers:{'Content-Type':'application/json'}});
 /* ---------- conversation memory (last turns, in memory only) ---------- */
 const HIST=[];const MAXH=8;
 const pushH=(role,text)=>{text=clean(text).trim();if(!text)return;HIST.push({role,content:text.slice(0,1500)});while(HIST.length>MAXH)HIST.shift()};
 function resetHistory(){HIST.length=0}
 /* ---------- last AI error (shown in chat on fallback) ---------- */
 let lastErr=null;
 /* ---------- subject inference ---------- */
 function inferSubject(msg,hits){
  if(!hits||!hits.length||!confident(hits,msg))return '';
  const c=new Map();hits.slice(0,3).forEach(h=>c.set(h.d.subject,(c.get(h.d.subject)||0)+h.score));
  return [...c].sort((a,b)=>b[1]-a[1])[0][0];
 }
 /* ---------- fetch wrapper: ground + remember + capture errors ---------- */
 const TUTOR=/\/api\/v1\/ai\/(tutor|chat)$/;
 const _fetch=g.fetch?g.fetch.bind(g):null;
 if(_fetch)g.fetch=async function(input,init){
  let url='';try{url=typeof input==='string'?input:(input&&input.url)||''}catch(e){}
  if(!TUTOR.test(url.split('?')[0])||!init||!init.body)return _fetch(input,init);
  let payload=null;try{payload=JSON.parse(init.body)}catch(e){return _fetch(input,init)}
  const plain=payload.strict_json!==true&&!(Array.isArray(payload.vision_images)&&payload.vision_images.length);
  if(plain){
   try{await ensure()}catch(e){}
   const q=clean(payload.message);const hits=IDX?run(IDX,q,{limit:4,subject:payload.subject}):[];
   if(payload.subject==='عام'||!payload.subject){const s=inferSubject(q,hits);if(s)payload.subject=s}
   if(getMode()==='db'&&!forceAI&&IDX){
    if(payload.task==='lesson'&&hits.length&&confident(hits,q)){const txt=localAnswer(q,hits,{});pushH('user',q);pushH('assistant',txt);lastErr=null;return jsonRes({mode:'local',task:'lesson',answer:txt,remaining:null})}
    if(payload.task==='practice'&&typeof prev==='function'){let t='';try{t=await prev(q,payload.subject,'practice')}catch(e){}
     if(t&&!/لا توجد تمارين|Aucun exercice|No exercises/.test(t)){lastErr=null;return jsonRes({mode:'local',task:'practice',answer:t,remaining:null})}}
   }
   forceAI=false;
   const kb=kbContextSync(q);if(kb)payload.kb_context=kb;
   if(HIST.length)payload.history=HIST.slice();
   init=Object.assign({},init,{body:JSON.stringify(payload)});
  }
  const res=await _fetch(input,init);
  try{
   if(plain&&payload.message){
    if(res.ok){const j=await res.clone().json().catch(()=>null);lastErr=null;if(j&&j.answer){pushH('user',payload.message);pushH('assistant',j.answer)}}
    else{const j=await res.clone().json().catch(()=>null);lastErr={at:Date.now(),status:res.status,detail:(j&&j.detail)||('HTTP '+res.status)}}
   }
  }catch(e){}
  return res;
 };
 /* ---------- offline/local reply (replaces the old one for lessons; keeps practice/evaluate behaviour) ---------- */
 async function reply(msg,subject,task,student){
  if(task==='practice'||task==='evaluate'){if(typeof prev==='function'){try{return await prev.apply(this,arguments)}catch(e){}}}
  let I=null;try{I=await ensure()}catch(e){}
  const hits=I?run(I,msg,{limit:5,subject}):[];
  const aiOn=aiEnabled();
  let head;
  if(aiOn&&lastErr&&Date.now()-lastErr.at<60000)head='⚠️ '+L('تعذّر الحصول على جواب الذكاء الاصطناعي: ','Réponse IA indisponible : ','AI answer unavailable: ')+lastErr.detail+'\n🟡 '+L('هذا جواب من قاعدة المنصة المحلية:','Réponse de la base locale :','Local base answer:');
  else head=aiOn?'🟡 '+L('الذكاء الاصطناعي لم يردّ؛ هذا جواب من قاعدة المنصة المحلية:','IA sans réponse ; réponse locale :','AI did not answer; local answer:'):'🟢 '+L('وضع القاعدة المحلية (Gemini غير مفعّل):','Base locale (Gemini inactif) :','Local base mode (Gemini off):');
  const body=I?localAnswer(msg,hits,{subject}):'⚠️ '+L('تعذّر تحميل قاعدة المعرفة المحلية'+(buildError?': '+buildError:'')+'. حدّث الصفحة.','Base locale indisponible.','Local knowledge base unavailable.');
  const out=head+'\n\n'+body;pushH('user',msg);pushH('assistant',body);return out;
 }
 g.offlineTutorReply=reply;
 /* ---------- status + settings panel ---------- */
 async function status(){
  const s={gemini:aiEnabled(),lastError:lastErr?lastErr.detail:'',history:HIST.length,loaded:!!IDX,error:buildError};
  try{const I=await ensure();s.loaded=true;s.lessons=I.counts.deep;s.exerciseLinks=I.counts.bank;s.terms=I.post.size;s.docs=I.docs.length}catch(e){s.error=String(e&&e.message||e)}
  try{if(g.SM_TEXTBOOK_KB){const t=await g.SM_TEXTBOOK_KB.stats();s.books=t.books;s.bookPages=t.pages}}catch(e){}
  return s;
 }
 async function selfTest(){
  const I=await ensure(),tests=[['الكسور',null],['قراءة الخريطة',null],['الثورة التحريرية',null],['الاسم والفعل',null]],rep=[];
  for(const [q] of tests){const h=run(I,q,{grade:'',limit:3});rep.push({q,ok:h.length>0&&confident(h,q),top:h[0]?place(h[0].d):''})}
  return rep;
 }
 async function renderPanel(){
  const el=g.document&&g.document.getElementById('smCoreStatus');if(!el)return;el.innerHTML='<small>…</small>';
  const s=await status(),t=await selfTest().catch(()=>[]);
  const row=(ok,txt)=>`<li>${ok===true?'✅':ok===false?'❌':'⚠️'} ${esc(txt)}</li>`;
  el.innerHTML='<ul class="sm-kb-list">'+
   row(s.gemini,s.gemini?L('مفتاح Gemini محفوظ على هذا الجهاز.','Clé Gemini enregistrée.','Gemini key saved on this device.'):L('مفتاح Gemini غير محفوظ: المعلم يعمل بالقاعدة المحلية فقط.','Clé Gemini absente : base locale uniquement.','No Gemini key: local base only.'))+
   (s.lastError?row(false,L('آخر خطأ من الذكاء الاصطناعي: ','Dernière erreur IA : ','Last AI error: ')+s.lastError):'')+
   row(s.loaded&&!s.error,s.loaded?L(`القاعدة المحلية: ${s.lessons} درساً و${s.exerciseLinks} تمريناً مرتبطاً (${s.terms} مصطلحاً مفهرساً).`,`Base locale : ${s.lessons} leçons.`,`Local base: ${s.lessons} lessons.`):L('القاعدة المحلية لم تُحمَّل: ','Base locale non chargée : ','Local base not loaded: ')+(s.error||''))+
   row(s.books?true:null,s.books?L(`كتبك: ${s.books} كتاباً و${s.bookPages} صفحة مفهرسة.`,`Manuels : ${s.books}.`,`Textbooks: ${s.books}.`):L('لا كتب مفهرسة بعد (حمّل كتاب المادة ليستشهد به المعلم).','Aucun manuel indexé.','No textbook indexed yet.'))+
   t.map(x=>row(x.ok,`${L('اختبار بحث','Test','Search test')} «${x.q}» → ${x.top||L('لا نتيجة','aucun résultat','no result')}`)).join('')+'</ul>';
 }
 const _panel=typeof g.tutorServerPanel==='function'?g.tutorServerPanel:()=>'';
 g.tutorServerPanel=function(){setTimeout(renderPanel,0);return _panel()+`<details class="panel tutor-server" id="smCorePanel"><summary><b>🧠 ${L('حالة المعلم الذكي','État du tuteur','Tutor status')}</b></summary><div id="smCoreStatus" aria-live="polite"></div><label class="cc-mode">${L('مصدر الإجابة','Source de réponse','Answer source')} <select onchange="SM_TEACHER_CORE.setMode(this.value)"><option value="db" ${getMode()==='db'?'selected':''}>${L('قاعدة بيانات المنصة أولاً (موصى به)','Base de la plateforme d’abord','Platform knowledge base first')}</option><option value="ai" ${getMode()==='ai'?'selected':''}>${L('الذكاء الاصطناعي أولاً','IA d’abord','AI first')}</option></select></label><div class="toolbar"><button class="secondary-btn" type="button" onclick="SM_TEACHER_CORE.renderPanel()">${L('فحص الآن','Vérifier','Check now')}</button><button class="secondary-btn" type="button" onclick="SM_TEACHER_CORE.resetHistory();typeof toast==='function'&&toast('✓')">${L('بدء محادثة جديدة','Nouvelle conversation','New conversation')}</button></div></details>`};
 /* follow-up chips under every bot answer (like a conversation, not a form) */
 const FOLLOW=()=>(aiEnabled()?[[L('تعمّق بالذكاء الاصطناعي','Approfondir avec l’IA','Go deeper with AI'),'lesson',q=>L('اشرح بالتفصيل وبأسلوب معلّم: ','Explique en détail : ','Explain in detail: ')+q,()=>{forceAI=true}]]:[]).concat([[L('اشرح أكثر','Explique davantage','Explain more'),'lesson',q=>L('اشرح لي أكثر وبتبسيط: ','Explique plus simplement : ','Explain more simply: ')+q],[L('اختبرني','Teste-moi','Quiz me'),'practice',q=>q],[L('مثال آخر','Un autre exemple','Another example'),'lesson',q=>L('أعطني مثالاً آخر عن: ','Donne un autre exemple : ','Give another example: ')+q]]);
 function addFollow(el){try{const d=g.document;if(!d||!el||!el.appendChild)return;d.querySelectorAll('.cc-follow').forEach(x=>x.remove());const q=(typeof lastQuestion!=='undefined'?lastQuestion:'')||'';if(!q)return;
  const box=d.createElement('div');box.className='cc-follow';
  FOLLOW().forEach(([label,mode,mk,pre])=>{const b=d.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{if(pre)pre();const m=d.querySelector('.v240-mode[data-mode="'+mode+'"]');if(m)m.click();const i=d.getElementById('chatInput'),f=d.getElementById('chatForm');if(i&&f){i.value=mk(q);f.requestSubmit?f.requestSubmit():f.dispatchEvent(new Event('submit',{cancelable:true}))}};box.appendChild(b)});
  el.appendChild(box)}catch(e){}}
 const _append=g.appendMessage;
 if(typeof _append==='function')g.appendMessage=function(text,who,actions){const el=_append.apply(this,arguments);if(who==='bot'&&actions&&el&&!/^(جارٍ|Réflexion|Thinking)/.test(clean(text)))addFollow(el);return el};
 function decorate(){const d=g.document;if(!d||!d.querySelector)return;const c=d.querySelector('.v240-compose');if(c&&!c.querySelector('.cc-note')){const p=d.createElement('p');p.className='cc-note';p.textContent=L('المعلم الذكي يعتمد على قاعدة بيانات المنصة وقد يخطئ — راجع دروسك وكتبك.','Le tuteur s’appuie sur la base de la plateforme et peut se tromper.','The tutor relies on the platform base and can make mistakes.');c.appendChild(p)}}
 if(g.document&&g.MutationObserver&&g.document.body){new g.MutationObserver(decorate).observe(g.document.body,{childList:true,subtree:true});decorate()}
 g.SM_TEACHER_CORE={getMode,setMode,search,ensure,status,selfTest,renderPanel,resetHistory,localAnswer,tokens,norm,confident,kbContext:q=>ensure().then(()=>kbContextSync(q)),history:()=>HIST.slice(),lastError:()=>lastErr,_t:{run,build,compose,inferSubject,pushH,reply,kbContextSync}};
 g.SM_EDUCATION_RELEASE=g.SM_EDUCATION_RELEASE||{};g.SM_EDUCATION_RELEASE.features=Object.assign({},g.SM_EDUCATION_RELEASE.features||{},{smartTeacherCore:true});
 if(g.document&&g.addEventListener)g.addEventListener('load',()=>{ensure().catch(()=>{})});
})(typeof window!=='undefined'?window:globalThis);
