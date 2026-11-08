/* SM éducation v2.8.7 — automatic grading against a model answer.
   - Reads the student's answer sheet from a photo/scan (image or PDF) or typed text.
   - Compares it question-by-question with a model answer (typed, file, or a solution PDF from the
     DzExams / Raji3DZ in-app libraries already stored on this device).
   - The AI only judges each question; the final mark is computed here from the per-question points
     (clamped, rounded to 0.25, scaled to the requested maximum) so the total is always consistent.
   - Marks are formative estimates, never official. Nothing is uploaded to GitHub and no GitHub
     token exists anywhere in the app. Images/text go to Groq only after explicit consent. */
(function(){
 'use strict';
 const L=()=>(typeof lang!=='undefined'?lang:'ar');
 const T=(ar,fr,en)=>L()==='ar'?ar:L()==='fr'?fr:en;
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const $=id=>document.getElementById(id);
 const num=v=>{const n=Number(String(v==null?'':v).replace(',','.'));return Number.isFinite(n)?n:0};
 const q4=x=>Math.round(x*4)/4;
 const clip=(s,n)=>String(s==null?'':s).slice(0,n);
 const VERDICTS=['correct','partial','wrong','missing','unreadable'];
 const MAX_IMAGES=3;

 /* ---------- unified library access (DzExams + Raji3DZ) ---------- */
 const LIBS={dz:()=>window.SM_DZLIB,rj:()=>window.SM_RAJI3DZ};
 const LIB_LABEL={dz:'DZExams',rj:'Raji3DZ'};
 function libraryPdfOptions(gradeValue){
  const out=[];
  Object.keys(LIBS).forEach(k=>{
   const lib=LIBS[k]();let docs=[];
   try{docs=lib&&lib._t&&lib._t.docs?lib._t.docs():[]}catch(e){docs=[]}
   docs.forEach((d,i)=>{if(d&&d.ext==='pdf'&&(!gradeValue||d.grade===gradeValue))out.push({value:k+':'+i,label:'['+LIB_LABEL[k]+'] '+clip(d.title,120)+(d.solution?' ✔':'')})});
  });
  return out;
 }
 async function refreshLibraryOptions(gradeValue){
  for(const k of Object.keys(LIBS)){const lib=LIBS[k]();try{if(lib&&lib._t&&lib._t.load)await lib._t.load()}catch(e){}}
  return libraryPdfOptions(gradeValue);
 }
 /* value: "dz:3" | "rj:7" | legacy plain number (DzExams) */
 async function readLibraryPdf(value,maxPages,maxChars){
  const m=String(value||'').match(/^(?:(dz|rj):)?(\d+)$/);
  if(!m)throw new Error('library-pick-invalid');
  const lib=LIBS[m[1]||'dz']();
  if(!lib||!lib.readPdfText)throw new Error((LIB_LABEL[m[1]||'dz'])+' library not ready');
  return lib.readPdfText(Number(m[2]),maxPages||12,maxChars||9000);
 }

 /* ---------- pure logic (unit-tested) ---------- */
 function extractJson(text){
  let s=String(text||'').trim();
  s=s.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const start=s.indexOf('{');if(start<0)throw new Error('no-json');
  let depth=0,inStr=false,esc2=false;
  for(let i=start;i<s.length;i++){
   const c=s[i];
   if(inStr){if(esc2)esc2=false;else if(c==='\\')esc2=true;else if(c==='"')inStr=false;continue}
   if(c==='"')inStr=true;else if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)return JSON.parse(s.slice(start,i+1))}
  }
  throw new Error('json-unbalanced');
 }

 function normalizeGrade(raw,maxMark){
  maxMark=num(maxMark)>0?q4(num(maxMark)):20;
  if(!raw||!Array.isArray(raw.questions)||!raw.questions.length)throw new Error('bad-grade');
  const items=raw.questions.slice(0,60).map((q,i)=>{
   q=q||{};
   const max=Math.max(0,q4(num(q.max)));
   let verdict=VERDICTS.includes(q.verdict)?q.verdict:'partial';
   let awarded=Math.min(max,Math.max(0,q4(num(q.awarded))));
   if(verdict==='unreadable'||verdict==='missing')awarded=0;
   else verdict=max>0&&awarded>=max?'correct':awarded<=0?'wrong':'partial'; /* verdict always agrees with the points */
   return {id:clip(q.id!=null&&q.id!==''?q.id:i+1,20),max,awarded,verdict,
    studentAnswer:clip(q.student_answer,600),
    errors:(Array.isArray(q.errors)?q.errors:[]).slice(0,6).map(e=>clip(e,400)).filter(Boolean),
    correction:clip(q.correction,900)};
  }).filter(x=>x.max>0);
  if(!items.length)throw new Error('bad-grade');
  const totalMax=q4(items.reduce((n,x)=>n+x.max,0)),total=q4(items.reduce((n,x)=>n+x.awarded,0));
  const mark=Math.min(maxMark,q4(total/totalMax*maxMark));
  const unreadable=(Array.isArray(raw.unreadable_parts)?raw.unreadable_parts:[]).slice(0,10).map(x=>clip(x,200)).filter(Boolean);
  const confidence=['high','medium','low'].includes(raw.confidence)?raw.confidence:'medium';
  return {items,total,totalMax,mark,maxMark,scaled:totalMax!==maxMark,
   remarks:clip(raw.general_remarks,1500),unreadable,confidence,
   needsReview:confidence==='low'||unreadable.length>0||items.some(x=>x.verdict==='unreadable')};
 }

 function buildGradingPrompt(p){
  p=p||{};
  const max=num(p.maxMark)>0?num(p.maxMark):20;
  const imgs=[];
  if(p.studentImageCount)imgs.push(`الصور المرفقة: أول ${p.studentImageCount} صورة/صور هي ورقة إجابة التلميذ`);
  if(p.modelImageCount)imgs.push(`${p.studentImageCount?'والصورة/الصور التالية':'الصور المرفقة'} (${p.modelImageCount}) هي الإجابة النموذجية`);
  return `أنت مصحح تربوي لمادة ${clip(p.subject,80)||'غير محددة'} (المستوى: ${clip(p.grade,60)||'غير محدد'}) في المنظومة التربوية الجزائرية. قارن إجابات التلميذ بالإجابة النموذجية سؤالاً بسؤال وبنداً بنداً.\n`+
  `القواعد الصارمة:\n`+
  `1) اعتمد حصراً على ما هو مكتوب فعلاً في ورقة التلميذ وعلى الإجابة النموذجية المعطاة. لا تخترع نصاً أو قيماً أو خطوات.\n`+
  `2) امنح نقاطاً فقط لما هو ظاهر ومقروء. إذا تعذرت قراءة جزء فاجعل verdict="unreadable" وawarded=0 واذكره في unreadable_parts ولا تخمّن الرموز أو الأرقام. إذا لم يجب التلميذ فverdict="missing".\n`+
  `3) اقبل الطرق والصيغ المختلفة المكافئة والصحيحة علمياً حتى لو خالفت صياغة الإجابة النموذجية، وامنح نقاطاً جزئية للخطوات الصحيحة. حدّد أول خطأ في كل سؤال (حسابي/منهجي/وحدات/إشارات/مفهومي/لغوي) واشرح سببه باختصار.\n`+
  `4) إذا كان سلم التنقيط موجوداً في الإجابة النموذجية فاستعمله؛ وإلا وزّع ${max} نقطة بالتساوي على الأسئلة الظاهرة. اجعل مجموع max لكل الأسئلة = ${max}. النقاط من مضاعفات 0.25.\n`+
  `5) العلامة تقديرية تكوينية وليست رسمية.\n`+
  `أعد كائن JSON واحداً فقط، دون أي نص قبله أو بعده ودون علامات \`\`\`، بهذا الشكل بالضبط:\n`+
  `{"questions":[{"id":"1","max":0,"awarded":0,"verdict":"correct|partial|wrong|missing|unreadable","student_answer":"ما كتبه التلميذ باختصار","errors":["الخطأ وسببه"],"correction":"التصحيح الصحيح باختصار"}],"general_remarks":"ملاحظات عامة وخطوات علاجية","unreadable_parts":["أجزاء غير مقروءة"],"confidence":"high|medium|low"}\n`+
  (imgs.length?imgs.join('، ')+'.\n':'')+
  (p.question?`\nنص الموضوع/السؤال:\n${clip(p.question,3000)}\n`:'')+
  (p.modelText?`\nالإجابة النموذجية (النص):\n${clip(p.modelText,9000)}\n`:'')+
  (p.studentText?`\nإجابة التلميذ (النص):\n${clip(p.studentText,9000)}\n`:'');
 }

 /* ---------- model call ---------- */
 function apiUrl(){
  const base=typeof apiBase==='function'?apiBase():'';
  return `${base}/api/v1/ai/tutor`;
 }
 async function gradeAnswers(p){
  const groq=window.SM_GROQ;
  if(!groq||!groq.enabled())throw new Error('groq-disabled');
  if(!p.consent)throw new Error('no-consent');
  const studentImages=(p.studentImages||[]),modelImages=(p.modelImages||[]);
  if(!studentImages.length&&!String(p.studentText||'').trim())throw new Error('no-student');
  if(!modelImages.length&&!String(p.modelText||'').trim())throw new Error('no-model');
  /* total vision budget is MAX_IMAGES: keep the student's sheet first */
  const sKeep=modelImages.length?Math.min(studentImages.length,MAX_IMAGES-1):Math.min(studentImages.length,MAX_IMAGES);
  const sImgs=studentImages.slice(0,sKeep),mImgs=modelImages.slice(0,MAX_IMAGES-sImgs.length);
  const truncated=sImgs.length<studentImages.length||mImgs.length<modelImages.length;
  const prompt=buildGradingPrompt({subject:p.subject,grade:p.grade,maxMark:p.maxMark,question:p.question,modelText:p.modelText,studentText:p.studentText,studentImageCount:sImgs.length,modelImageCount:mImgs.length});
  const r=await fetch(apiUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   task:'evaluate',strict_json:true,message:prompt,student_answer:clip(p.studentText,2500)||'(انظر الصور المرفقة)',
   vision_images:sImgs.concat(mImgs),language:p.language||L(),grade:p.grade||'',subject:p.subject||'عام',
   learning_context:'Formative grading against a model answer. Output JSON only.'})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'HTTP '+r.status);
  let raw;try{raw=extractJson(d.answer)}catch(e){const err=new Error('unparseable');err.raw=String(d.answer||'');throw err}
  const g=normalizeGrade(raw,p.maxMark);g.truncated=truncated;g.mode=d.mode||'';return g;
 }

 /* ---------- rendering ---------- */
 const ICON={correct:'✅',partial:'🟡',wrong:'❌',missing:'⚪',unreadable:'❓'};
 const VLABEL=()=>({correct:T('صحيح','Correct','Correct'),partial:T('جزئي','Partiel','Partial'),wrong:T('خاطئ','Faux','Wrong'),missing:T('بلا إجابة','Sans réponse','No answer'),unreadable:T('غير مقروء','Illisible','Unreadable')});
 function renderGrade(g){
  const vl=VLABEL();
  const rows=g.items.map(x=>`<tr><td>${esc(x.id)}</td><td>${x.awarded} / ${x.max}</td><td>${ICON[x.verdict]} ${esc(vl[x.verdict])}</td><td>${x.studentAnswer?`<small>${esc(x.studentAnswer)}</small>`:''}${x.errors.length?`<ul>${x.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:''}${x.correction?`<div><b>${T('التصحيح','Correction','Correction')}:</b> ${esc(x.correction)}</div>`:''}</td></tr>`).join('');
  const warns=[];
  if(g.needsReview)warns.push(T('بعض أجزاء الورقة غير واضحة أو ثقة النموذج منخفضة؛ العلامة مؤقتة وتحتاج مراجعة الأستاذ.','Certaines parties sont peu lisibles ou la confiance est faible : note provisoire, à vérifier par l’enseignant.','Some parts are unclear or confidence is low: provisional mark, teacher review needed.'));
  if(g.scaled)warns.push(T(`مجموع نقاط الأسئلة (${g.totalMax}) لا يساوي ${g.maxMark}؛ حُوِّلت العلامة إلى ${g.maxMark}.`,`Le total des questions (${g.totalMax}) ≠ ${g.maxMark} : note ramenée sur ${g.maxMark}.`,`Question points total (${g.totalMax}) ≠ ${g.maxMark}: mark rescaled to ${g.maxMark}.`));
  if(g.truncated)warns.push(T('عدد الصور تجاوز الحد المسموح (3)، فحُللت الصور الأولى فقط.','Trop d’images (max 3) : seules les premières ont été analysées.','More than 3 images: only the first ones were analysed.'));
  return `<article class="answer-review-card"><h3>${T('العلامة التقديرية','Note estimée','Estimated mark')}: <span dir="ltr">${g.mark} / ${g.maxMark}</span></h3>`+
   `<p><small>${T('علامة تكوينية غير رسمية. تُحسب من نقاط الأسئلة أدناه.','Note formative non officielle, calculée à partir des points ci-dessous.','Unofficial formative mark computed from the per-question points below.')}</small></p>`+
   warns.map(w=>`<p class="notice">⚠️ ${esc(w)}</p>`).join('')+
   `<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>#</th><th>${T('النقاط','Points','Points')}</th><th>${T('الحكم','Verdict','Verdict')}</th><th>${T('الأخطاء والتصحيح','Erreurs et correction','Errors and correction')}</th></tr></thead><tbody>${rows}</tbody></table></div>`+
   (g.unreadable.length?`<p><b>${T('أجزاء غير مقروءة','Parties illisibles','Unreadable parts')}:</b> ${g.unreadable.map(esc).join('، ')}</p>`:'')+
   (g.remarks?`<p style="white-space:pre-wrap"><b>${T('ملاحظات وخطوات علاجية','Remarques et remédiation','Remarks and next steps')}:</b> ${esc(g.remarks)}</p>`:'')+`</article>`;
 }

 /* ---------- file preparation ---------- */
 const isImage=f=>!!f&&(String(f.type).startsWith('image/')||/\.(png|jpe?g|webp)$/i.test(f.name||''));
 const isPdf=f=>!!f&&(f.type==='application/pdf'||/\.pdf$/i.test(f.name||''));
 async function pdfTextOf(file,maxPages,maxChars){
  if(!window.pdfjsLib)return '';
  pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,out=[];
  for(let n=1;n<=Math.min(pdf.numPages,maxPages||12);n++){const pg=await pdf.getPage(n),c=await pg.getTextContent();out.push(c.items.map(x=>x.str||'').join(' ').replace(/\s+/g,' ').trim())}
  return out.join('\n').trim().slice(0,maxChars||9000);
 }
 async function visionOf(file){
  const fn=window.smartTeacherPrepareVision||(typeof smartTeacherPrepareVision==='function'?smartTeacherPrepareVision:null);
  if(!fn)throw new Error('vision-unavailable');
  return fn(file);
 }
 /* A scanned/handwritten PDF has no text layer, so fall back to page images. */
 async function prepareSource(file){
  if(!file)return {text:'',images:[]};
  if(isImage(file))return {text:'',images:await visionOf(file)};
  if(isPdf(file)){
   const text=await pdfTextOf(file,12,9000);
   if(text.replace(/\s+/g,'').length>=40)return {text,images:[]};
   return {text:'',images:await visionOf(file)};
  }
  throw new Error('unsupported-file');
 }

 /* ---------- UI ---------- */
 function panel(gradeValue){
  const opts=libraryPdfOptions(gradeValue||(typeof grade!=='undefined'?grade:''));
  const sel=document&&document.getElementById&&document.getElementById('smartTeacherSubject');
  return `<section class="panel" id="agrPanel"><h3>🧮 ${T('التصحيح الآلي بالإجابة النموذجية','Correction automatique avec corrigé','Automatic grading with a model answer')}</h3>`+
  `<p>${T('ارفع صورة أو PDF لورقة التلميذ، وأدخل الإجابة النموذجية (نصاً أو ملفاً أو حلاً من مكتبة DZExams / Raji3DZ). يقارن المعلم الذكي كل سؤال، يحدد الأخطاء، وتُحسب العلامة من نقاط الأسئلة.','Téléversez la copie de l’élève (image/PDF) et le corrigé (texte, fichier ou solution d’une bibliothèque). La note est calculée à partir des points par question.','Upload the student sheet (image/PDF) and the model answer (text, file, or a solution from a library). The mark is computed from per-question points.')}</p>`+
  `<label>${T('ورقة التلميذ (صورة أو PDF)','Copie de l’élève (image ou PDF)','Student sheet (image or PDF)')}<input id="agrStudentFile" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,application/pdf,.pdf"></label>`+
  `<label>${T('أو اكتب إجابة التلميذ','Ou saisir la réponse de l’élève','Or type the student answer')}<textarea id="agrStudentText" rows="3" maxlength="9000"></textarea></label>`+
  `<label>${T('الإجابة النموذجية (نص)','Corrigé (texte)','Model answer (text)')}<textarea id="agrModelText" rows="4" maxlength="9000"></textarea></label>`+
  `<label>${T('أو ملف الإجابة النموذجية (صورة/PDF)','Ou fichier du corrigé (image/PDF)','Or model answer file (image/PDF)')}<input id="agrModelFile" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,application/pdf,.pdf"></label>`+
  `<label>${T('أو حل من مكتبة DZExams / Raji3DZ (PDF)','Ou solution depuis la bibliothèque (PDF)','Or a solution from the library (PDF)')}<select id="agrLibrary" onfocus="smAutoGraderRefreshLibrary()"><option value="">${T('لا شيء','Aucun','None')}</option>${opts.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></label>`+
  `<label>${T('المادة','Matière','Subject')}<input id="agrSubject" maxlength="80" value="${esc(sel&&sel.value||'')}"></label>`+
  `<label>${T('نص الموضوع/السؤال (اختياري)','Énoncé (facultatif)','Question/prompt (optional)')}<textarea id="agrQuestion" rows="2" maxlength="3000"></textarea></label>`+
  `<label>${T('العلامة القصوى','Note maximale','Maximum mark')}<input id="agrMax" type="number" min="1" max="100" step="0.5" value="20" dir="ltr"></label>`+
  `<label class="notice"><input id="agrConsent" type="checkbox"> ${T('أوافق على إرسال النص والصور إلى Groq للتصحيح. لا يُرسل شيء قبل تفعيل هذا الخيار، ولا تُحفظ الصور.','J’accepte l’envoi du texte et des images à Groq. Rien n’est envoyé avant, et les images ne sont pas conservées.','I agree to send the text and images to Groq for grading. Nothing is sent before this is checked and images are not stored.')}</label>`+
  `<button class="primary-btn" type="button" onclick="smAutoGrade()">${T('صحّح الآن','Corriger maintenant','Grade now')}</button><div id="agrOut" aria-live="polite"></div></section>`;
 }
 async function refreshUiLibrary(){
  const el=$('agrLibrary');if(!el)return;
  const keep=el.value,opts=await refreshLibraryOptions(typeof grade!=='undefined'?grade:'');
  el.innerHTML=`<option value="">${T('لا شيء','Aucun','None')}</option>`+opts.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  if(keep&&opts.some(o=>o.value===keep))el.value=keep;
 }
 const ERR=e=>{
  const m=String(e&&e.message||e);
  if(m==='groq-disabled')return T('فعّل مفتاح Groq أولاً.','Activez d’abord la clé Groq.','Enable your Groq key first.');
  if(m==='no-consent')return T('يجب الموافقة أولاً على إرسال المحتوى إلى Groq.','Veuillez d’abord consentir à l’envoi à Groq.','Please consent to sending content to Groq first.');
  if(m==='no-student')return T('أضف ورقة التلميذ أو اكتب إجابته.','Ajoutez la copie de l’élève ou sa réponse.','Add the student sheet or type the answer.');
  if(m==='no-model')return T('أضف الإجابة النموذجية نصاً أو ملفاً أو من المكتبة.','Ajoutez le corrigé (texte, fichier ou bibliothèque).','Add the model answer (text, file or library).');
  if(m==='unsupported-file')return T('صيغة الملف غير مدعومة. استعمل صورة PNG/JPEG/WEBP أو PDF.','Format non pris en charge (PNG/JPEG/WEBP/PDF).','Unsupported file (use PNG/JPEG/WEBP/PDF).');
  if(m==='vision-unavailable')return T('تحليل الصور غير متاح في هذه الصفحة.','Analyse d’image indisponible.','Image analysis unavailable.');
  if(m==='unparseable')return T('لم يُرجع النموذج نتيجة منظمة قابلة للحساب، لذا لم تُحسب علامة. أعد المحاولة بصورة أوضح.','Réponse non structurée : aucune note calculée. Réessayez avec une image plus nette.','The model did not return a structured result, so no mark was computed. Try a clearer image.');
  if(m==='bad-grade')return T('نتيجة التصحيح غير مكتملة؛ أعد المحاولة.','Résultat incomplet, réessayez.','Incomplete grading result; try again.');
  return T('تعذر التصحيح: ','Échec de la correction : ','Grading failed: ')+m;
 };
 async function run(){
  const out=$('agrOut');if(!out)return null;
  const val=id=>($(id)&&$(id).value||'').trim(),files=id=>($(id)&&$(id).files&&$(id).files[0])||null;
  try{
   if(!$('agrConsent')||!$('agrConsent').checked)throw new Error('no-consent');
   if(!(window.SM_GROQ&&window.SM_GROQ.enabled()))throw new Error('groq-disabled');
   const sFile=files('agrStudentFile'),mFile=files('agrModelFile'),lib=val('agrLibrary'),sTextIn=val('agrStudentText');
   if(!sFile&&!sTextIn)throw new Error('no-student');
   if(!val('agrModelText')&&!mFile&&!lib)throw new Error('no-model');
   out.textContent=T('جارٍ قراءة الملفات…','Lecture des fichiers…','Reading files…');
   const s=await prepareSource(sFile);
   let modelText=val('agrModelText'),modelImages=[];
   if(mFile){const m=await prepareSource(mFile);modelText=(modelText+'\n'+m.text).trim();modelImages=m.images}
   if(lib){const parsed=await readLibraryPdf(lib,12,9000);modelText=(modelText+'\n'+parsed.text).trim()}
   out.textContent=T('يقارن المعلم الإجابات…','Comparaison des réponses…','Comparing answers…');
   const lr=typeof activeLearner==='function'?activeLearner():{};
   const g=await gradeAnswers({consent:true,subject:val('agrSubject')||'عام',grade:lr.grade||(typeof grade!=='undefined'?grade:''),maxMark:num(val('agrMax'))||20,question:val('agrQuestion'),
    modelText,modelImages,studentText:(sTextIn+'\n'+s.text).trim(),studentImages:s.images});
   out.innerHTML=renderGrade(g);return g;
  }catch(e){
   if(e&&e.message==='unparseable'&&e.raw)out.innerHTML=`<p class="notice">${esc(ERR(e))}</p><details><summary>${T('عرض ردّ النموذج الخام','Voir la réponse brute','Show raw model reply')}</summary><pre style="white-space:pre-wrap">${esc(e.raw.slice(0,4000))}</pre></details>`;
   else out.textContent=ERR(e);
   return null;
  }
 }

 window.smAutoGraderPanel=panel;
 window.smAutoGrade=run;
 window.smAutoGraderRefreshLibrary=refreshUiLibrary;
 window.smLibraryPdfOptions=libraryPdfOptions;
 window.smReadLibraryPdf=readLibraryPdf;
 window.SM_AUTOGRADER={grade:gradeAnswers,run,panel,_t:{extractJson,normalizeGrade,buildGradingPrompt,renderGrade,libraryPdfOptions,readLibraryPdf,prepareSource,MAX_IMAGES}};
})();
