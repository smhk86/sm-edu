/* SM EDUCATION v2.9.40 — direct in-app textbook download for the Smart Teacher.
 * One book at a time, on demand: download -> check it is a PDF -> save in IndexedDB -> index page by page.
 * Conditions built in (the source's permission is the user's responsibility; the app cannot verify it):
 *  - nothing is downloaded until the user confirms (stored locally) that the source allows it;
 *  - only HTTPS hosts listed in SM_SCHOOL_CONFIG.textbookHosts are contacted (empty list = disabled);
 *  - no bulk download, no crawling; a 403/429 answer stops the download;
 *  - on Android the request goes through CapacitorHttp so WebView CORS does not block it.
 * The book list is data (data/textbook-repository-index.json), updated without changing code. */
(function(g){'use strict';
 const PERM_KEY='smTextbookPermission',MAX_BYTES=80*1048576,ID_RX=/^[A-Za-z0-9_.-]{1,80}$/;
 const cfg=()=>g.SM_SCHOOL_CONFIG||{};
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
 const lsGet=k=>{try{return g.localStorage.getItem(k)}catch(e){return null}};
 const lsSet=(k,v)=>{try{v?g.localStorage.setItem(k,v):g.localStorage.removeItem(k)}catch(e){}};
 const curGrade=()=>typeof grade!=='undefined'?grade:'';
 const S={busy:{},pct:{},saved:new Map()};let cat=null,loading=null;
 const hosts=()=>(Array.isArray(cfg().textbookHosts)?cfg().textbookHosts:[]).map(h=>String(h).toLowerCase().replace(/^\.+/,'')).filter(Boolean);
 function urlOk(u){try{const x=new URL(u);if(x.protocol!=='https:')return false;const h=x.hostname.toLowerCase();return hosts().some(d=>h===d||h.endsWith('.'+d))}catch(e){return false}}
 const perm=()=>lsGet(PERM_KEY)==='1';
 function grant(v){lsSet(PERM_KEY,v?'1':null);render();return perm()}
 function nativeHttp(){try{const c=g.Capacitor;if(c&&c.isNativePlatform&&c.isNativePlatform()&&g.CapacitorHttp)return g.CapacitorHttp}catch(e){}return null}
 const headerValue=(h,n)=>{if(!h)return null;const k=Object.keys(h).find(x=>x.toLowerCase()===n.toLowerCase());return k?String(h[k]):null};
 function asBytes(data){
  if(data instanceof ArrayBuffer)return data;
  if(ArrayBuffer.isView(data))return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
  if(typeof data==='string'){const raw=data.replace(/^data:[^,]*;base64,/i,'').replace(/\s/g,'');const bin=atob(raw),b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return b.buffer}
  if(data&&typeof data==='object'&&typeof data.base64==='string')return asBytes(data.base64);
  throw new Error('empty-response');
 }
 async function requestUrl(url,signal,extra){
  if(signal&&signal.aborted)throw new DOMException('Aborted','AbortError');
  const http=nativeHttp();
  if(http){
   const r=await http.request({url,method:'GET',headers:Object.assign({Accept:'application/pdf,*/*'},extra||{}),connectTimeout:20000,readTimeout:120000,responseType:'arraybuffer'});
   if(signal&&signal.aborted)throw new DOMException('Aborted','AbortError');
   const status=Number(r.status)||0,headers=r.headers||{};
   return{status,ok:status>=200&&status<300,headers:{get:n=>headerValue(headers,n)},arrayBuffer:async()=>asBytes(r.data)};
  }
  return g.fetch(url,{signal,credentials:'omit',headers:Object.assign({Accept:'application/pdf,*/*'},extra||{})});
 }
 function cleanBooks(d){
  if(!d||!Array.isArray(d.books))throw new Error('invalid-catalogue');
  return d.books.filter(b=>b&&ID_RX.test(String(b.id||''))&&b.grade&&b.subject&&b.title&&typeof b.url==='string')
   .map(b=>({id:String(b.id),grade:String(b.grade),subject:String(b.subject),title:String(b.title),url:b.url,size_mb:Number(b.size_mb)||0}));
 }
 function indexUrls(){const c=cfg(),base=String(lsGet('smContentBase')||c.publicContentBase||'').replace(/\/+$/,'');return [c.textbookCatalogueIndex,base?base+'/data/textbook-repository-index.json':'','./data/textbook-repository-index.json'].filter(Boolean)}
 function load(){
  if(cat)return Promise.resolve(cat);if(loading)return loading;
  loading=(async()=>{for(const u of indexUrls()){try{const r=await g.fetch(u);if(!r.ok)continue;cat={books:cleanBooks(await r.json())};return cat}catch(e){}}cat={books:[]};return cat})().finally(()=>{loading=null});
  return loading;
 }
 async function refreshSaved(){try{const rows=await g.SM_TEACHER_BOOKS.listSaved();S.saved=new Map(rows.filter(r=>r.sourceBookId).map(r=>[r.sourceBookId,r.id]))}catch(e){}}
 function rows(){const sub=g.document&&g.document.getElementById('smTbSubject');const s=sub?sub.value:'';return (cat?cat.books:[]).filter(b=>b.grade===curGrade()&&(!s||b.subject===s))}
 function listHtml(){
  const chk=`<label class="sm-td-perm"><input type="checkbox" ${perm()?'checked':''} onchange="SM_TEXTBOOK_DL.grant(this.checked)"> أؤكد أن مصدر الكتب يسمح بتحميلها واستعمالها لأغراض التعلّم.</label>`;
  if(!cat)return chk+'<p>جارٍ تحميل قائمة الكتب…</p>';
  if(!cat.books.length)return chk+'<p class="empty-note">لم تُضف قائمة الكتب بعد. يمكنك استيراد ملف PDF يدوياً من الأعلى.</p>';
  if(!hosts().length)return chk+'<p class="empty-note">قائمة الكتب موجودة لكن مصدر التحميل غير مفعّل في إعدادات التطبيق.</p>';
  const r=rows();if(!r.length)return chk+'<p class="empty-note">لا توجد كتب في القائمة لهذا المستوى والمادة.</p>';
  return chk+r.map(b=>{const saved=S.saved.get(b.id),busy=!!S.busy[b.id],p=S.pct[b.id]||0;
   return `<article class="sm-tb-row"><div><b>${esc(b.title)}</b><small>${esc(b.subject)} · ${esc(b.grade)}${b.size_mb?' · '+b.size_mb+' MB':''}</small>${busy?`<progress id="smTdP-${esc(b.id)}" max="100" value="${p}"></progress> <span id="smTdT-${esc(b.id)}">${p}%</span>`:''}</div><div>${saved?`<button type="button" class="secondary-btn" onclick="SM_TEACHER_BOOKS.openBook('${esc(saved)}')">قراءة الكتاب ✓</button>`:busy?`<button type="button" class="text-btn" onclick="SM_TEXTBOOK_DL.cancel('${esc(b.id)}')">إلغاء</button>`:`<button type="button" class="primary-btn" onclick="SM_TEXTBOOK_DL.download('${esc(b.id)}')">تحميل داخل التطبيق</button>`}</div></article>`}).join('');
 }
 function render(){const el=g.document&&g.document.getElementById('smTdList');if(el)el.innerHTML=listHtml()}
 function setPct(id,p){S.pct[id]=p;const a=g.document&&g.document.getElementById('smTdP-'+id),t=g.document&&g.document.getElementById('smTdT-'+id);if(a)a.value=p;if(t)t.textContent=p+'%'}
 function msg(e){const m=e&&e.message||'';
  if(e&&e.name==='AbortError')return 'أُلغي التحميل.';
  if(m==='no-permission')return 'أكّد أولاً أن مصدر الكتب يسمح بالتحميل.';
  if(m==='host-not-allowed')return 'مصدر الكتب غير مفعّل في إعدادات التطبيق.';
  if(m==='refused')return 'رفض الموقع الطلب (403/429). حاول لاحقاً.';
  if(m==='too-big')return 'حجم الكتاب أكبر من 80 ميغابايت.';
  if(m==='not-a-document')return 'الملف المستلم ليس PDF صالحاً.';
  if(/^HTTP /.test(m))return 'تعذر التحميل ('+m+').';
  return 'تعذر التحميل: '+(m||'خطأ غير معروف')+' — خارج تطبيق Android قد يمنع المتصفح الطلب (CORS).';
 }
 async function download(id){
  const b=(cat?cat.books:[]).find(x=>x.id===id);if(!b){say('الكتاب غير موجود في القائمة.');return null}
  if(S.busy[id])return null;
  if(S.saved.has(id)){say('الكتاب محفوظ مسبقاً؛ افتحه من «كتبي المفهرسة».');return null}
  const ctl=new AbortController();
  try{
   if(!perm())throw new Error('no-permission');
   if(!urlOk(b.url))throw new Error('host-not-allowed');
   S.busy[id]=ctl;S.pct[id]=0;render();say('بدأ تحميل «'+b.title+'»…');
   const res=await requestUrl(b.url,ctl.signal);
   if(res.status===403||res.status===429)throw new Error('refused');
   if(!res.ok)throw new Error('HTTP '+res.status);
   const total=+(res.headers&&res.headers.get&&res.headers.get('content-length'))||0;
   if(total>MAX_BYTES)throw new Error('too-big');
   let parts=[],got=0;
   if(res.body&&res.body.getReader){
    const rd=res.body.getReader();
    for(;;){const {done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;if(got>MAX_BYTES)throw new Error('too-big');setPct(id,total?Math.min(99,Math.round(got*100/total)):0)}
   }else{const bytes=await res.arrayBuffer();got=bytes.byteLength;if(got>MAX_BYTES)throw new Error('too-big');parts=[bytes]}
   const blob=new Blob(parts,{type:'application/pdf'});
   const h=new Uint8Array(await blob.slice(0,4).arrayBuffer());
   if(!blob.size||!(h[0]===0x25&&h[1]===0x50&&h[2]===0x44&&h[3]===0x46))throw new Error('not-a-document');
   setPct(id,100);
   return await g.SM_TEACHER_BOOKS.importBlob(blob,{title:b.title,grade:b.grade,subject:b.subject,source:'catalogue_download',sourceBookId:b.id,sourceUrl:b.url});
  }catch(e){say(msg(e));return null}
  finally{delete S.busy[id];delete S.pct[id];await refreshSaved();render()}
 }
 async function status(){
  await load();const books=cat?cat.books:[];
  return{catalogue:books.length,forGrade:books.filter(b=>b.grade===curGrade()).length,hosts:hosts(),hostsOk:books.filter(b=>urlOk(b.url)).length,permission:perm(),native:!!nativeHttp(),saved:S.saved.size};
 }
 const list=()=>(cat?cat.books:[]).filter(b=>!curGrade()||b.grade===curGrade());
 /* Connectivity test: asks for the first KB only (Range) and checks the %PDF signature. Nothing is saved. */
 async function probe(id){
  const b=(cat?cat.books:[]).find(x=>x.id===id);
  if(!b)return{ok:false,message:'الكتاب غير موجود في القائمة.'};
  try{
   if(!perm())throw new Error('no-permission');
   if(!urlOk(b.url))throw new Error('host-not-allowed');
   const ctl=new AbortController(),res=await requestUrl(b.url,ctl.signal,{Range:'bytes=0-1023'});
   if(res.status===403||res.status===429)throw new Error('refused');
   if(!res.ok)throw new Error('HTTP '+res.status);
   const cr=res.headers&&res.headers.get&&res.headers.get('content-range'),cl=+(res.headers&&res.headers.get&&res.headers.get('content-length'))||0;
   const size=cr&&/\/(\d+)$/.test(cr)?+RegExp.$1:(res.status===200?cl:0);
   let head;
   if(res.body&&res.body.getReader){const rd=res.body.getReader(),{value}=await rd.read();try{await rd.cancel()}catch(e){}head=value||new Uint8Array(0)}
   else head=new Uint8Array(await res.arrayBuffer());
   const isPdf=head.length>=4&&head[0]===0x25&&head[1]===0x50&&head[2]===0x44&&head[3]===0x46;
   if(!isPdf)throw new Error('not-a-document');
   if(size>MAX_BYTES)throw new Error('too-big');
   return{ok:true,status:res.status,size,message:'الاتصال يعمل والملف PDF صالح'+(res.status===206?' (الخادم يدعم التحميل الجزئي).':'.')};
  }catch(e){return{ok:false,status:0,message:msg(e)}}
 }
 function cancel(id){const c=S.busy[id];if(c&&c.abort)c.abort()}
 function section(){return `<section class="panel sm-td-panel"><h3>⬇️ تحميل مباشر داخل التطبيق</h3><p>اختر كتاباً واحداً من القائمة فيُحمَّل داخل التطبيق دون متصفح، ثم يُحفظ ويُفهرس صفحة بصفحة ليستعين به الأستاذ الذكي. لا يُحمَّل شيء إلا بطلبك، ويمكنك حذف أي كتاب لاستعادة المساحة.</p><div id="smTdList">${listHtml()}</div></section>`}
 const B=g.SM_TEACHER_BOOKS;
 if(B&&typeof B.panelHtml==='function'){
  const oldPanel=B.panelHtml;
  B.panelHtml=function(){const html=oldPanel.apply(this,arguments);setTimeout(()=>{load().then(refreshSaved).then(render).catch(render)},0);return html+section()};
  const oldRemove=B.remove;
  if(typeof oldRemove==='function')B.remove=async function(){const r=await oldRemove.apply(this,arguments);await refreshSaved();render();return r};
 }
 if(g.document&&g.document.addEventListener)g.document.addEventListener('change',e=>{if(e.target&&e.target.id==='smTbSubject')render()});
 if(g.document&&g.document.head&&!g.document.getElementById('smTextbookDlCss')){const s=g.document.createElement('style');s.id='smTextbookDlCss';s.textContent='.sm-td-panel{margin-top:14px}.sm-td-perm{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:8px 0}.sm-td-panel progress{width:100%;margin-top:6px}';g.document.head.appendChild(s)}
 g.SM_TEXTBOOK_DL={download,cancel,grant,load,render,status,probe,list,_t:{urlOk,cleanBooks,listHtml,hosts,perm,state:S,setCatalogue:c=>{cat=c}}};
 g.SM_EDUCATION_RELEASE=g.SM_EDUCATION_RELEASE||{};g.SM_EDUCATION_RELEASE.features=Object.assign({},g.SM_EDUCATION_RELEASE.features||{},{textbookDirectDownload:true});
})(window);
