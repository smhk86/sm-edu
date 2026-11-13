/* SM SCHOOL AI — direct Gemini tutor with automatic key rotation (replaces Groq).
   Up to 3 keys are typed by the user inside the app and kept only in this device's localStorage.
   They are never bundled in the APK, never added to backups, and only sent to generativelanguage.googleapis.com.
   When a key's daily quota is exhausted (HTTP 429), the next key is used immediately. */
(function(){
 const KEYS='smSchoolGeminiKeys',MODEL='smSchoolGeminiModel',IDX='smSchoolGeminiIdx',EXH='smSchoolGeminiExhausted',DEFAULT_MODEL='gemini-3.5-flash',BASE='https://generativelanguage.googleapis.com/v1beta/models',MAX_KEYS=3;
 const store={get:k=>{try{return localStorage.getItem(k)||''}catch{return ''}},set:(k,v)=>{try{localStorage.setItem(k,v);return true}catch{return false}},del:k=>{try{localStorage.removeItem(k)}catch{}}};
 const L=()=>(typeof lang!=='undefined'?lang:'ar');
 const tr=(ar,fr,en)=>L()==='ar'?ar:L()==='fr'?fr:en;
 const say=m=>{if(typeof toast==='function')toast(m)};
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const keys=()=>{try{const a=JSON.parse(store.get(KEYS)||'[]');return Array.isArray(a)?a.filter(k=>typeof k==='string'&&k.length>=20).slice(0,MAX_KEYS):[]}catch{return []}};
 const enabled=()=>keys().length>0;
 const model=()=>store.get(MODEL)||DEFAULT_MODEL;
 const visionModel=model;
 const LANGS={ar:'Arabic',fr:'French',en:'English'};
 /* Gemini resets daily quota at midnight Pacific time */
 const today=()=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date())}catch{return new Date().toISOString().slice(0,10)}};
 const exhausted=()=>{try{const o=JSON.parse(store.get(EXH)||'{}');return o.d===today()&&Array.isArray(o.i)?o.i:[]}catch{return []}};
 const markExhausted=i=>{const a=exhausted();if(!a.includes(i))a.push(i);store.set(EXH,JSON.stringify({d:today(),i:a}))};

 function buildMessages(p){
  const langName=LANGS[p.language]||'Arabic';
  const common=`You are a careful, encouraging tutor for a student in Algeria. Grade: ${p.grade}. Subject: ${p.subject}. `+
   `Respond only in ${langName}. Adapt complexity to the grade. Never invent official curriculum claims, textbook page numbers, or ministry exam content. `+
   'Label generated material as practice, not official. If uncertain, state the uncertainty. Use age-appropriate language. '+
   `Observed learning context (may be incomplete): ${p.learning_context||'No recorded performance yet'}. Use it gently to prioritize explanations; never shame or label the learner. `+
   (p.book_context?`The learner explicitly consented to use this locally imported textbook excerpt. Treat it as user-provided reference material, not automatically official or error-free. Prefer it when directly relevant, identify its title/subject if useful, and say when the excerpt does not contain the answer. Cite page numbers only as shown in the excerpt headers; never invent page numbers.\nTEXTBOOK EXCERPT:\n${String(p.book_context).slice(0,18000)}`:'No textbook excerpt was selected or consented to.')+
   (p.kb_context?`\nPLATFORM KNOWLEDGE BASE (lesson summaries retrieved for this question; derived study material, not an official ministry text — use it when relevant, but answer from your own knowledge for anything it does not cover, and say so briefly):\n${String(p.kb_context).slice(0,5000)}`:'')+
   ' You are a conversational teacher: when the learner replies to your previous message, continue that thread instead of restarting; ask one short check-for-understanding question at the end of explanations.';
  let task;
  if(p.task==='lesson')task='Teach the requested topic from first principles. Structure: learning objective, prerequisite idea, clear step-by-step explanation, one worked example, common misconception, short recap, and two self-check questions with answers separated at the end. Topic/request: '+p.message;
  else if(p.task==='practice')task='Create the exact number of exercises requested by the user (respect the explicit count in the request; do not default to five). Follow all requested exam structure, curriculum scope, student/teacher separation, scoring and answer-key constraints. Include a mix of recall, application and reasoning where appropriate. Avoid claiming alignment to a specific official lesson sequence unless supported by supplied evidence. Topic/request: '+p.message;
  else if(p.strict_json===true&&p.task==='evaluate')task=String(p.message||'')+'\n\nOutput requirement: reply with the single JSON object requested above and nothing else.';
  else task="Provide detailed formative feedback and a structured correction of the student's written answer: (1) overall assessment, (2) correct ideas, (3) missing or inaccurate ideas with reasons, (4) language, terminology and method errors when relevant, (5) a suggested rubric with an explicitly approximate score only when the task supports it, (6) a complete model answer, (7) two targeted improvement actions. Never claim the score is official or Ministry-approved. "+`Question or task: ${p.message}\nStudent answer: ${p.student_answer||''}`;
  const userContent=Array.isArray(p.vision_images)&&p.vision_images.length?[{type:'text',text:task},...p.vision_images.slice(0,3).map(url=>({type:'image_url',image_url:{url}}))]:task;
  const hist=Array.isArray(p.history)?p.history.filter(h=>h&&(h.role==='user'||h.role==='assistant')&&typeof h.content==='string'&&h.content.trim()).slice(-8).map(h=>({role:h.role,content:h.content.slice(0,1500)})):[];
  return [{role:'system',content:common},...hist,{role:'user',content:userContent}];
 }

 function errMessage(status){
  if(status===401||status===403)return tr('مفتاح Gemini غير صالح أو غير مفعّل. تحقق من المفاتيح.','Clé Gemini invalide ou inactive.','Gemini key is invalid or inactive.');
  if(status===429)return tr('نفدت حصة كل مفاتيح Gemini اليوم. تتجدد الحصة نحو الساعة 9 صباحاً بتوقيت الجزائر.','Quota de toutes les clés Gemini épuisé. Renouvellement vers 09:00 (Alger).','All Gemini keys are out of quota. It renews around 09:00 Algeria time.');
  if(status===404||status===400)return tr('النموذج غير متاح. غيّر اسم النموذج في الإعدادات.','Modèle indisponible. Changez le nom du modèle.','Model unavailable. Change the model name in settings.');
  return tr('تعذر الاتصال بـ Gemini.','Connexion à Gemini impossible.','Could not reach Gemini.');
 }
 const reply=(status,body)=>{if(status>=400&&body&&body.detail)say('Gemini: '+body.detail);return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})};

 function toGemini(msgs){
  const sys=msgs.filter(m=>m.role==='system').map(m=>m.content).join('\n');
  const contents=msgs.filter(m=>m.role!=='system').map(m=>{
   const parts=[];
   if(Array.isArray(m.content)){for(const c of m.content){
    if(c.type==='text')parts.push({text:c.text});
    else if(c.type==='image_url'){const mm=/^data:([^;]+);base64,(.+)$/.exec(c.image_url.url||'');if(mm)parts.push({inlineData:{mimeType:mm[1],data:mm[2]}})}
   }}else parts.push({text:String(m.content||'')});
   return {role:m.role==='assistant'?'model':'user',parts};
  });
  return {systemInstruction:{parts:[{text:sys}]},contents};
 }

 /* Try keys in rotation order. 429 with a per-day quota => key marked exhausted for today; other 429 (per-minute) => just move on. */
 async function ask(payload){
  const ks=keys();
  if(!ks.length)return reply(401,{detail:errMessage(401)});
  const start=Math.min(parseInt(store.get(IDX)||'0',10)||0,ks.length-1),done=exhausted();
  const order=[];for(let n=0;n<ks.length;n++){const i=(start+n)%ks.length;if(!done.includes(i))order.push(i)}
  if(!order.length)return reply(429,{detail:errMessage(429)});
  const body=JSON.stringify(Object.assign(toGemini(buildMessages(payload)),{generationConfig:{temperature:0.2,maxOutputTokens:payload.task==='practice'?9000:payload.task==='evaluate'?8000:6000}}));
  let last=0;
  for(const i of order){
   let r;
   try{r=await _fetch(BASE+'/'+encodeURIComponent(model())+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':ks[i]},body})}catch{last=0;continue}
   if(r.ok){
    try{
     const d=await r.json();const answer=((d.candidates||[])[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
     if(!answer)throw 0;
     store.set(IDX,String(i));
     return reply(200,{mode:'gemini',task:payload.task,answer,remaining:null,key:i+1});
    }catch{last=0;continue}
   }
   last=r.status;
   if(r.status===429){let t='';try{t=await r.text()}catch{}if(/PerDay|per day/i.test(t))markExhausted(i);continue}
   if(r.status===400||r.status===401||r.status===403){if(r.status!==400)markExhausted(i);if(r.status===400&&order.length===1)break;continue}
   if(r.status>=500)continue;
   break;
  }
  return reply(last===429?429:last===401||last===403?401:502,{detail:errMessage(last)});
 }

 // Route the app's existing tutor calls to Gemini when at least one key is saved.
 const _fetch=window.fetch.bind(window);
 window.fetch=function(input,init){
  try{
   const url=typeof input==='string'?input:(input&&input.url)||'';
   if(enabled()&&/\/api\/v1\/ai\/(tutor|chat)$/.test(url.split('?')[0])&&init&&init.body){
    const payload=JSON.parse(init.body);
    if(/\/chat$/.test(url.split('?')[0]))payload.task='lesson';
    return ask(payload);
   }
  }catch{}
  return _fetch(input,init);
 };

 function panel(){
  const ks=keys(),on=ks.length>0,ex=exhausted();
  const inputs=[0,1,2].map(i=>`<div class="toolbar"><input class="geminiKeyInput" data-i="${i}" type="password" dir="ltr" autocomplete="off" placeholder="${tr('مفتاح','Clé','Key')} ${i+1}" value="${ks[i]?'••••••••••••':''}"> <small>${ks[i]?(ex.includes(i)?'⏳ '+tr('نفدت حصته اليوم','quota épuisé','quota used'):'✅'):''}</small></div>`).join('');
  return `<details class="panel tutor-server" id="geminiPanel" ${on?'':'open'}><summary><b>⚡ ${tr('مفاتيح Gemini (المعلّم الذكي مباشرة)','Clés Gemini (tuteur IA direct)','Gemini keys (direct AI tutor)')}</b> <small>${on?'✅ '+ks.length+'/3':'⚪ '+tr('غير مفعّل','inactif','inactive')}</small></summary>`+
   `<p><small>${tr('أدخل حتى 3 مفاتيح؛ عند نفاد حصة أحدها ينتقل التطبيق تلقائياً إلى التالي. تُحفظ المفاتيح محلياً على هذا الجهاز فقط ولا تدخل النسخ الاحتياطية. عند التفعيل يُرسل السؤال وملخص الأداء والصور المرفقة إلى Google مباشرة.','Saisissez jusqu’à 3 clés ; à l’épuisement du quota, la suivante est utilisée automatiquement. Les clés restent sur cet appareil.','Enter up to 3 keys; when one runs out of quota the next is used automatically. Keys stay on this device only.')}</small></p>`+
   inputs+
   `<div class="toolbar"><input id="geminiModelInput" dir="ltr" placeholder="${DEFAULT_MODEL}" value="${esc(store.get(MODEL))}"><button class="primary-btn" type="button" onclick="saveGeminiKeys()">${tr('حفظ وتفعيل','Enregistrer','Save & enable')}</button><button class="secondary-btn" type="button" onclick="testGeminiKeys()">${tr('اختبار','Tester','Test')}</button><button class="secondary-btn" type="button" onclick="removeGeminiKeys()">${tr('حذف المفاتيح','Supprimer','Remove keys')}</button></div></details>`;
 }
 const _panel=typeof tutorServerPanel==='function'?tutorServerPanel:()=>'';
 window.tutorServerPanel=function(){return _panel()+panel()};

 window.saveGeminiKeys=function(){
  const old=keys(),next=[];
  document.querySelectorAll('.geminiKeyInput').forEach(el=>{
   const v=(el.value||'').trim(),i=Number(el.dataset.i);
   if(/^•+$/.test(v)){if(old[i])next.push(old[i])}else if(v)next.push(v);
  });
  const bad=next.find(k=>!/^[A-Za-z0-9_.\-]{20,}$/.test(k));
  if(bad){say(tr('صيغة أحد المفاتيح غير صحيحة','Format de clé invalide','Invalid key format'));return}
  const uniq=[...new Set(next)].slice(0,MAX_KEYS);
  if(!uniq.length){say(tr('أدخل مفتاحاً واحداً على الأقل','Saisissez au moins une clé','Enter at least one key'));return}
  if(!store.set(KEYS,JSON.stringify(uniq))){say(tr('تعذر حفظ المفاتيح','Enregistrement impossible','Could not save keys'));return}
  const m=(document.getElementById('geminiModelInput')?.value||'').trim();if(m)store.set(MODEL,m);else store.del(MODEL);
  store.del(IDX);store.del(EXH);
  say(tr('تم الحفظ وتفعيل Gemini ✓ ('+uniq.length+' مفاتيح)','Enregistré ✓ ('+uniq.length+' clés)','Saved ✓ ('+uniq.length+' keys)'));
  document.querySelectorAll('.geminiKeyInput').forEach((el,i)=>{el.value=uniq[i]?'••••••••••••':''});
  const s=document.querySelector('#geminiPanel summary small');if(s)s.textContent='✅ '+uniq.length+'/3';
 };
 window.removeGeminiKeys=function(){
  store.del(KEYS);store.del(MODEL);store.del(IDX);store.del(EXH);
  document.querySelectorAll('.geminiKeyInput').forEach(el=>{el.value=''});
  const s=document.querySelector('#geminiPanel summary small');if(s)s.textContent='⚪ '+tr('غير مفعّل','inactif','inactive');
  say(tr('تم حذف المفاتيح','Clés supprimées','Keys removed'));
 };
 window.testGeminiKeys=async function(){
  const ks=keys();if(!ks.length){say(tr('احفظ المفاتيح أولاً','Enregistrez d’abord les clés','Save the keys first'));return}
  const res=[];
  for(let i=0;i<ks.length;i++){
   try{const r=await _fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',{headers:{'x-goog-api-key':ks[i]}});res.push((i+1)+':'+(r.ok?'✓':r.status))}catch{res.push((i+1)+':✗')}
  }
  say(tr('نتيجة الاختبار ','Résultat ','Test ')+res.join('  '));
 };
 window.SM_AI={enabled,model,visionModel,buildMessages,keysCount:()=>keys().length};
})();
