/* SM EDUCATION v2.9.41 — import of Vision-OCR textbook files (<LEVEL>-sci.json.gz) into the Smart Teacher knowledge base.
 * File shape: {grade:'2AM', books:[{id,title,grade,subject,pageTexts:[{page,text}]}]}.
 * Each book becomes one local record (stable id 'vis-<LEVEL>-<bookId>', re-import replaces it, never duplicates),
 * so the existing page-level BM25 index (textbook-knowledge.js) finds it with no change.
 * Sources: (a) a file picked on the device (works offline, no hosting needed); (b) optional HTTPS base
 * SM_SCHOOL_CONFIG.visionBooksBase + '/<LEVEL>-sci.json.gz' (must be a place the owner is entitled to publish to). */
(function(g){'use strict';
 const GRADES={'1AP':'الأولى ابتدائي','2AP':'الثانية ابتدائي','3AP':'الثالثة ابتدائي','4AP':'الرابعة ابتدائي','5AP':'الخامسة ابتدائي',
  '1AM':'الأولى متوسط','2AM':'الثانية متوسط','3AM':'الثالثة متوسط','4AM':'الرابعة متوسط','1AS':'الأولى ثانوي','2AS':'الثانية ثانوي','3AS':'الثالثة ثانوي'};
 const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cfg=()=>g.SM_SCHOOL_CONFIG||{};
 /* subject: the title wins over the stored tag (older files tagged «العلوم الفيزيائية/الإسلامية» as sciences) */
 function subjectKey(title,tag){const t=String(title||'');
  if(/فيزيائ|فيزياء/.test(t))return 'physics';
  if(/إسلام|اسلام/.test(t))return 'islamic';
  if(/رياضيات/.test(t))return 'maths';
  if(/علوم/.test(t))return 'sciences';
  return tag||'other'}
 function subjectAr(key,code){const lvl=String(code||'').slice(-2);
  switch(key){
   case 'maths':return 'الرياضيات';
   case 'physics':return lvl==='AM'?'العلوم الفيزيائية والتكنولوجيا':'العلوم الفيزيائية';
   case 'sciences':return lvl==='AP'?'التربية العلمية والتكنولوجية':'العلوم الطبيعية';
   case 'islamic':return lvl==='AS'?'العلوم الإسلامية':'التربية الإسلامية';
   case 'arabic':return 'اللغة العربية';case 'french':return 'اللغة الفرنسية';case 'english':return 'اللغة الإنجليزية';
   case 'history':case 'geography':return 'التاريخ والجغرافيا';case 'civic':return 'التربية المدنية';
   case 'philosophy':return 'الفلسفة';case 'informatique':return 'الإعلام الآلي';
   default:return 'عام'}}
 function levelCode(d,name){const c=String((d&&d.grade)||'').toUpperCase();if(GRADES[c])return c;
  const m=String(name||'').toUpperCase().match(/\b([1-5]A[PMS])\b/);return m&&GRADES[m[1]]?m[1]:''}
 async function gunzip(buf){
  const u=new Uint8Array(buf);
  if(u[0]===0x1f&&u[1]===0x8b){
   if(typeof g.DecompressionStream!=='function')throw new Error('no-gzip');
   const s=new Blob([u]).stream().pipeThrough(new g.DecompressionStream('gzip'));
   return new Response(s).text()}
  return new TextDecoder('utf-8').decode(u)}
 function toRows(d,code){
  if(!d||!Array.isArray(d.books))throw new Error('invalid-file');
  const grade=GRADES[code];if(!grade)throw new Error('unknown-level');
  return d.books.map(b=>{
   const pages=(Array.isArray(b.pageTexts)?b.pageTexts:[]).map(p=>({page:Number(p.page),text:String(p.text||'')})).filter(p=>p.page>0&&p.text.replace(/\s/g,'').length>=20);
   if(!pages.length)return null;
   const text=pages.map(p=>`صفحة ${p.page}: ${p.text}`).join('\n');
   return{id:'vis-'+code+'-'+String(b.id||b.title).replace(/[^A-Za-z0-9_.-]/g,'_'),title:String(b.title||'كتاب'),grade,
    subject:subjectAr(subjectKey(b.title,b.subject),code),text,chars:text.length,pages:pages.length,pageTexts:pages,
    savedAt:Date.now(),source:'vision_ocr',mime:'text/plain'}}).filter(Boolean)}
 /* Saves every book; an existing record with the same id is replaced only when the new one has at least as many pages. */
 async function importData(d,code){
  const B=g.SM_TEACHER_BOOKS;if(!B||!B.putRow||!B.listSaved)throw new Error('books-module-missing');
  const old=new Map((await B.listSaved()).map(r=>[r.id,r]));
  let added=0,updated=0,kept=0,pages=0;
  for(const r of toRows(d,code)){
   const o=old.get(r.id);
   if(o&&(o.pages||0)>r.pages){kept++;continue}
   await B.putRow(r);o?updated++:added++;pages+=r.pages}
  return{level:code,added,updated,kept,pages}}
 async function importBuffer(buf,name){
  const d=JSON.parse(await gunzip(buf)),code=levelCode(d,name);
  if(!code)throw new Error('unknown-level');
  return importData(d,code)}
 const msg=e=>{const m=e&&e.message||'';
  if(m==='no-gzip')return 'هذا المتصفح لا يدعم فك الضغط؛ حدّث WebView أو استعمل ملف JSON غير مضغوط.';
  if(m==='unknown-level')return 'تعذر تحديد المستوى من الملف أو اسمه.';
  if(m==='invalid-file')return 'الملف ليس ملف كتب صالحاً.';
  return 'تعذر الاستيراد: '+(m||'خطأ غير معروف')};
 const sum=r=>`المستوى ${GRADES[r.level]}: أُضيف ${r.added} كتاب، حُدّث ${r.updated}، أُبقي ${r.kept}، ${r.pages} صفحة.`;
 async function importFile(file){
  if(!file){say('اختر ملف المستوى أولاً (مثل 2AM-sci.json.gz).');return null}
  try{const r=await importBuffer(await file.arrayBuffer(),file.name);say(sum(r));return r}catch(e){say(msg(e));return null}}
 async function importUI(){const el=g.document&&g.document.getElementById('smViFile');return importFile(el&&el.files&&el.files[0])}
 async function importRemote(code){
  code=String(code||'').toUpperCase();const base=String(cfg().visionBooksBase||'').replace(/\/+$/,'');
  if(!base||!/^https:\/\//i.test(base)){say('مصدر الملفات غير مفعّل (visionBooksBase).');return null}
  if(!GRADES[code]){say('مستوى غير معروف.');return null}
  try{const res=await g.fetch(base+'/'+code+'-sci.json.gz',{credentials:'omit'});if(!res.ok)throw new Error('HTTP '+res.status);
   const r=await importBuffer(await res.arrayBuffer(),code);say(sum(r));return r}catch(e){say(msg(e));return null}}
 function section(){return `<section class="panel sm-vi-panel"><h3>📥 استيراد كتب مُستخرجة (Vision)</h3><p>اختر ملف مستوى مثل <b>2AM-sci.json.gz</b> من هاتفك فتدخل كتبه قاعدة المعرفة مباشرة دون اتصال. إعادة الاستيراد تحدّث الكتاب ولا تكرّره.</p><div class="sm-kb-actions"><input id="smViFile" type="file" accept=".gz,.json,application/gzip,application/json"><button type="button" class="primary-btn" onclick="SM_VISION_IMPORT.importUI()">استيراد الملف</button></div></section>`}
 const B=g.SM_TEACHER_BOOKS;
 if(B&&typeof B.panelHtml==='function'){const old=B.panelHtml;B.panelHtml=function(){return old.apply(this,arguments)+section()}}
 g.SM_VISION_IMPORT={importFile,importUI,importBuffer,importData,importRemote,GRADES,_t:{toRows,subjectKey,subjectAr,levelCode,gunzip}};
 g.SM_EDUCATION_RELEASE=g.SM_EDUCATION_RELEASE||{};g.SM_EDUCATION_RELEASE.features=Object.assign({},g.SM_EDUCATION_RELEASE.features||{},{visionTextbookImport:true});
})(window);
