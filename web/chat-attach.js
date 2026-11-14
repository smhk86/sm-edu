/* v2.9.42 — Smart teacher chat: attach button (images + PDF) inside the input bar; mode row removed. */
(function(){
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const MAX_FILES=3,MAX_BYTES=25*1024*1024,CONSENT='smChatAttachConsent';
 const L=()=>{try{return typeof lang!=='undefined'?lang:'ar'}catch(e){return 'ar'}};
 const tr=(a,f,e)=>L()==='fr'?f:L()==='en'?e:a;
 const $id=i=>document.getElementById(i);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let files=[];

 /* 1) Rewrite the chat markup: drop the circled mode row, add the attach button + preview strip */
 const prev=window.tutor;
 if(typeof prev==='function'){
  window.tutor=function(){
   let h=prev.apply(this,arguments);
   if(typeof h!=='string'||h.indexOf('id="chatForm"')<0)return h;
   h=h.replace(/<div class="v240-modes"[\s\S]*?<\/div>\s*(?=<select id="tutorTask")/,'');
   const label=tr('إرفاق صورة أو PDF','Joindre une image ou un PDF','Attach an image or PDF');
   const btn=`<button type="button" class="v242-attach" id="v242AttachBtn" aria-label="${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.9-8.9a3.7 3.7 0 015.2 5.2l-8.9 8.9a1.8 1.8 0 01-2.6-2.6l8.2-8.2"/></svg></button><input type="file" id="v242File" hidden multiple accept="image/png,image/jpeg,image/webp,application/pdf,.pdf">`;
   h=h.replace('<div class="v240-inputrow">','<div class="v242-previews" id="v242Previews" hidden></div><div class="v240-inputrow">'+btn);
   return h;
  };
 }

 /* 2) Preview strip */
 function renderPreviews(){
  const box=$id('v242Previews');if(!box)return;
  box.hidden=!files.length;
  box.innerHTML=files.map((f,i)=>`<span class="v242-chip">${f.type.startsWith('image/')?'🖼':'📄'} <span class="v242-name">${esc(f.name)}</span><button type="button" data-rm="${i}" aria-label="×">×</button></span>`).join('');
 }
 document.addEventListener('click',e=>{
  const t=e.target.closest&&e.target.closest('#v242AttachBtn');
  if(t){const i=$id('v242File');if(i){i.value='';i.click()}return}
  const rm=e.target.closest&&e.target.closest('[data-rm]');
  if(rm&&rm.closest('#v242Previews')){files.splice(Number(rm.dataset.rm),1);renderPreviews()}
 });
 document.addEventListener('change',e=>{
  if(!e.target||e.target.id!=='v242File')return;
  const ok=[];
  for(const f of Array.from(e.target.files||[])){
   const isImg=/^image\/(png|jpe?g|webp)$/.test(f.type)||/\.(png|jpe?g|webp)$/i.test(f.name);
   const isPdf=f.type==='application/pdf'||/\.pdf$/i.test(f.name);
   if(!isImg&&!isPdf){toast_(tr('نوع غير مدعوم: ','Type non pris en charge : ','Unsupported type: ')+f.name);continue}
   if(f.size>MAX_BYTES){toast_(tr('الملف كبير جداً: ','Fichier trop volumineux : ','File too large: ')+f.name);continue}
   ok.push(f);
  }
  files=files.concat(ok).slice(0,MAX_FILES);
  if(files.length>=MAX_FILES&&ok.length)toast_(tr('الحد الأقصى 3 ملفات (يُحلَّل 3 صور/صفحات كحد أقصى).','Maximum 3 fichiers.','Maximum 3 files.'));
  renderPreviews();
  const i=$id('chatInput');if(i)i.focus();
 });
 function toast_(s){try{toast(s)}catch(e){alert(s)}}

 /* 3) Intercept submit only when something is attached */
 const thumb=f=>f.type.startsWith('image/')?URL.createObjectURL(f):'';
 async function visionOf(list){
  const out=[];
  for(const f of list){
   if(out.length>=MAX_FILES)break;
   const imgs=await smartTeacherPrepareVision(f);
   for(const u of imgs){if(out.length<MAX_FILES)out.push(u)}
  }
  return out;
 }
 document.addEventListener('submit',async e=>{
  if(!e.target||e.target.id!=='chatForm'||!files.length)return;
  e.preventDefault();e.stopImmediatePropagation();
  const input=$id('chatInput');
  const msg=((input&&input.value)||'').trim()||tr('حلّ التمرين الموجود في الملف خطوة بخطوة.','Résous l’exercice du fichier étape par étape.','Solve the exercise in the attached file step by step.');
  if(!(window.SM_AI&&window.SM_AI.enabled())){toast_(tr('فعّل مفتاح Gemini أولاً لتحليل الملفات.','Activez d’abord votre clé Gemini.','Enable your Gemini key first to analyse files.'));return}
  if(!localStorage.getItem(CONSENT)){
   if(!confirm(tr('سيُرسل محتوى الصور/صفحات PDF المرفقة إلى Gemini لتحليلها. هل توافق؟','Les images/pages PDF jointes seront envoyées à Gemini pour analyse. Accepter ?','Attached images/PDF pages will be sent to Gemini for analysis. Agree?')))return;
   try{localStorage.setItem(CONSENT,'1')}catch(_){}
  }
  const list=files.slice();files=[];renderPreviews();if(input){input.value='';input.style.height='auto'}
  const subject=($id('tutorSubject')||{}).value||'عام';
  const box=$id('messages');
  const sug=$id('v240Suggest');if(sug)sug.remove();
  appendMessage(msg+'\n'+list.map(f=>(f.type.startsWith('image/')?'🖼 ':'📄 ')+f.name).join('\n'),'user');
  const waiting=appendMessage(tr('جارٍ قراءة الملف وتحليله...','Lecture du fichier...','Reading and analysing the file...'),'bot');
  try{
   const images=await visionOf(list);
   if(!images.length)throw new Error(tr('تعذر تجهيز الملف للتحليل.','Fichier illisible.','Could not prepare the file.'));
   const learner=typeof activeLearner==='function'?activeLearner():{};
   const instr='حلّل الصور المرفقة (صفحات تمرين أو درس). استخرج نص التمرين ومعطياته بدقة دون تخمين الرموز أو القياسات، ثم أجب عن طلب التلميذ التالي بالاعتماد على المنهاج الجزائري. إن كان في الصورة إجابة للتلميذ فصحّحها خطوة بخطوة واشرح أخطاءه. إن كان شيء غير واضح فاذكر ذلك واطلب صورة أوضح.\nطلب التلميذ: '+msg;
   const ctx=typeof tutorLearningContext==='function'?tutorLearningContext():{};
   const r=await fetch(`${apiBase()}/api/v1/ai/tutor`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({task:'evaluate',message:instr,student_answer:'',vision_images:images,language:L(),grade:(learner&&learner.grade)||grade,subject,learner_name:learner&&learner.name},ctx))});
   const data=await r.json();
   if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:'HTTP '+r.status);
   waiting.remove();appendMessage(data.answer||'','bot',true);
   if(typeof saveTutorTurn==='function')saveTutorTurn(msg+' ['+list.map(f=>f.name).join(', ')+']',data.answer||'','evaluate',subject);
  }catch(err){
   waiting.remove();
   appendMessage(tr('تعذر تحليل الملف: ','Analyse impossible : ','Could not analyse the file: ')+err.message,'bot',true);
  }
 },true);

 /* 4) Style */
 const st=document.createElement('style');
 st.textContent='.v240-modes,.v240-suggest{display:none!important}'
 +'.v242-attach{flex:0 0 38px;width:38px;height:38px;border:0;border-radius:50%;background:transparent;color:var(--cc-muted,var(--ink,#555));display:inline-flex;align-items:center;justify-content:center;cursor:pointer}'
 +'.v242-attach:hover{background:rgba(127,127,127,.15)}'
 +'.v242-previews{display:flex;gap:6px;flex-wrap:wrap;padding:0 6px 6px}'
 +'.v242-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 6px 4px 10px;border:1px solid var(--cc-line,var(--line,#ddd));border-radius:12px;background:var(--cc-surface,var(--surface,#fff));font-size:12px}'
 +'.v242-name{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 +'.v242-chip button{border:0;background:transparent;font-size:16px;line-height:1;cursor:pointer;color:inherit}';
 document.head.appendChild(st);
})();
