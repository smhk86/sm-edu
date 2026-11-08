/* SM éducation v2.8.6 — Raji3DZ direct-download library, INSIDE the app.
   Nothing runs on a server: the app itself reads a raji3dz.com page the
   user pastes, lists the PDF/Word files linked from it, downloads them to the device (IndexedDB, survives updates)
   and shows PDFs in an in-app viewer.
   Conditions built in (the owners' permission is the user's responsibility; the app cannot verify it):
   - nothing is scanned or downloaded until the user confirms in the app that the site owners agreed (stored locally);
   - only hosts listed in SM_SCHOOL_CONFIG.raji3dzHosts (default raji3dz.com + subdomains) are contacted, over HTTPS;
   - robots.txt is read first (fail closed); requests are sequential with a pause; stops after 3 refusals (403/429);
   - login pages and protected files are never bypassed; files stay on the user's device (no republishing).
   In the Android app requests go through CapacitorHttp (capacitor.config.json) so the WebView's CORS rule does not
   block them; in a normal browser the scan usually fails for that reason. */
(function(){
 'use strict';
 const L=()=>{try{return typeof lang!=='undefined'?lang:'ar'}catch(e){return 'ar'}};
 const tr=(ar,fr,en)=>{const l=L();return l==='fr'?fr:l==='en'?en:ar};
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
 const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
 const lsSet=(k,v)=>{try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch(e){}};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const pause=ms=>sleep(ms+Math.floor(Math.random()*600));
 const kb=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
 const PAGE=30,MAX_PAGES=12,MAX_BYTES=40*1048576;
 const PERM_KEY='smDzexamsPermission',IDX_KEY='smDzexamsIndexV1',LAST_KEY='smDzexamsLastUrls';
 const MIME={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
 const FILE_RX=/\.(pdf|docx?)$/i;
 const SKIP_PAGE=/(login|logout|register|signup|sign-up|contact|privacy|terms|about|cdn-cgi|wp-admin|account|password)/i;
 const GENERIC=/^(?:|تحميل.*|تنزيل.*|download.*|télécharger.*|pdf|word|docx?|اضغط.*|هنا|click.*)$/i;
 const SOLUTION=/(حل|الحل|تصحيح|corrig|solution)/i;

 /* ---------- native Android HTTP bridge (avoids WebView CORS) ---------- */
 function nativeHttp(){
  try{
   const cap=window.Capacitor||{};
   const native=typeof cap.isNativePlatform==='function'?cap.isNativePlatform():!!(cap.getPlatform&&cap.getPlatform()!=='web');
   const http=window.CapacitorHttp||(cap.Plugins&&cap.Plugins.CapacitorHttp);
   return native&&http&&typeof http.request==='function'?http:null;
  }catch(e){return null}
 }
 function headerValue(headers,name){
  if(!headers)return null;const k=Object.keys(headers).find(x=>x.toLowerCase()===name.toLowerCase());return k?String(headers[k]):null;
 }
 function asBytes(data){
  if(data instanceof ArrayBuffer)return data;
  if(ArrayBuffer.isView(data))return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
  if(typeof Blob!=='undefined'&&data instanceof Blob)return data.arrayBuffer();
  if(typeof data==='string'){
   const raw=data.replace(/^data:[^,]*;base64,/i,'').replace(/\s/g,'');
   try{const bin=atob(raw);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes.buffer}catch(e){return new TextEncoder().encode(data).buffer}
  }
  if(data&&typeof data==='object'&&typeof data.base64==='string')return asBytes(data.base64);
  throw new Error('empty-response');
 }
 async function requestUrl(url,opts={}){
  const signal=opts.signal;
  if(signal&&signal.aborted)throw new DOMException('Aborted','AbortError');
  const http=nativeHttp();
  if(http){
   const responseType=opts.responseType||'text';
   const r=await http.request({url,method:'GET',headers:opts.headers||{Accept:responseType==='text'?'text/html,application/xhtml+xml':'*/*'},connectTimeout:20000,readTimeout:45000,responseType});
   if(signal&&signal.aborted)throw new DOMException('Aborted','AbortError');
   const status=Number(r.status)||0,headers=r.headers||{},data=r.data;
   return {status,ok:status>=200&&status<300,headers:{get:n=>headerValue(headers,n)},
    async text(){return typeof data==='string'?data:(data==null?'':JSON.stringify(data))},
    async json(){if(data&&typeof data==='object'&&!(data instanceof ArrayBuffer)&&!ArrayBuffer.isView(data))return data;return JSON.parse(typeof data==='string'?data:new TextDecoder().decode(await asBytes(data)))},
    async arrayBuffer(){return await asBytes(data)}};
  }
  return fetch(url,{signal,credentials:'omit',headers:opts.headers||{}});
 }

 /* ---------- host / url rules ---------- */
 const hosts=()=>{const c=window.SM_SCHOOL_CONFIG||{};return (Array.isArray(c.raji3dzHosts)&&c.raji3dzHosts.length?c.raji3dzHosts:['raji3dz.com']).map(h=>String(h).toLowerCase())};
 const hostOk=h=>{h=String(h||'').toLowerCase();return hosts().some(x=>h===x||h.endsWith('.'+x))};
 const repoBase=()=>{const c=window.SM_SCHOOL_CONFIG||{};return String(c.publicContentBase||'').replace(/\/$/,'')};
 const repoFileOk=u=>{const x=parseUrl(u),base=repoBase(),b=parseUrl(base);const path=String((window.SM_SCHOOL_CONFIG||{}).raji3dzRepositoryPath||'/repository/raji3dz/');return !!x&&!!b&&x.protocol==='https:'&&x.origin===b.origin&&x.pathname.startsWith((b.pathname.replace(/\/$/,'')+path).replace(/\/\/+/g,'/'))};
 const sourceUrlOk=u=>{const x=parseUrl(u);return !!x&&x.protocol==='https:'&&hostOk(x.hostname)};
 const parseUrl=u=>{try{return new URL(String(u||'').trim())}catch(e){return null}};
 const urlOk=u=>sourceUrlOk(u)||repoFileOk(u);
 const ext=d=>String(d&&d.ext||((String(d&&d.url||'').split(/[?#]/)[0].match(/\.(\w+)$/)||[])[1])||'pdf').toLowerCase();

 /* ---------- subject detection (from link text, page title and file name) ---------- */
 const SUBJECTS=[
  [/(رياضيات|mathématiques|mathematiques|maths?\b)/i,'الرياضيات'],
  [/(فيزياء|فيزيائية|physique|physics)/i,'العلوم الفيزيائية'],
  [/(علوم\s*(الطبيعة|طبيعية)|طبيعة\s*والحياة|svt|sciences\s*naturelles)/i,'علوم الطبيعة والحياة'],
  [/(لغة\s*عربية|اللغة\s*العربية|العربية|arabe|arabic)/i,'اللغة العربية'],
  [/(فرنسية|français|francais|french)/i,'اللغة الفرنسية'],
  [/(إنجليزية|انجليزية|anglais|english)/i,'اللغة الإنجليزية'],
  [/(تاريخ|جغرافيا|histoire|géographie|geographie)/i,'التاريخ والجغرافيا'],
  [/(إسلامية|اسلامية|islamique|islamic)/i,'التربية الإسلامية'],
  [/(مدنية|civique)/i,'التربية المدنية'],
  [/(فلسفة|philosophie)/i,'الفلسفة'],
  [/(إعلام\s*آلي|اعلام\s*الي|informatique)/i,'الإعلام الآلي'],
  [/(أمازيغية|امازيغية|tamazight)/i,'اللغة الأمازيغية']
 ];
 const subjectOf=txt=>{const s=String(txt||'');for(const [rx,label] of SUBJECTS)if(rx.test(s))return label;return ''};
 const lastUrls=()=>{try{return JSON.parse(lsGet(LAST_KEY)||'{}')||{}}catch(e){return {}}};
 const rememberUrl=(g,u)=>{const m=lastUrls();m[g]=u;lsSet(LAST_KEY,JSON.stringify(m))};

 /* ---------- permission (local, revocable) ---------- */
 const perm=()=>{try{const p=JSON.parse(lsGet(PERM_KEY)||'null');return p&&p.at?p:null}catch(e){return null}};
 function grant(confirmed,note){
  if(!confirmed){say(tr('أكّد أولاً أنك حصلت على موافقة أصحاب الموقع.','Confirmez d’abord l’accord des propriétaires du site.','Confirm first that you have the site owners’ agreement.'));return false}
  lsSet(PERM_KEY,JSON.stringify({at:new Date().toISOString(),note:String(note||'').trim().slice(0,200)}));refresh();return true;
 }
 function revoke(){cancelScan();cancelBulk();lsSet(PERM_KEY,'');say(tr('أُلغي تفعيل التحميل من raji3dz.','Téléchargement raji3dz désactivé.','raji3dz downloading switched off.'));refresh()}

 /* ---------- on-device storage: IndexedDB, with an in-memory fallback ---------- */
 const mem=new Map();let dbp=null;
 function db(){
  if(dbp)return dbp;
  dbp=new Promise((res,rej)=>{try{
   if(typeof indexedDB==='undefined')return rej(new Error('no indexedDB'));
   const r=indexedDB.open('sm-raji3dz-docs',1);
   r.onupgradeneeded=()=>r.result.createObjectStore('files');
   r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);
  }catch(e){rej(e)}});
  dbp.catch(()=>{});return dbp;
 }
 const req=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
 const tx=async(mode,fn)=>{const d=await db();return new Promise((res,rej)=>{const t=d.transaction('files',mode);fn(t.objectStore('files'));t.oncomplete=res;t.onerror=()=>rej(t.error)})};
 const store={
  async get(k){try{return (await req((await db()).transaction('files').objectStore('files').get(k)))||mem.get(k)||null}catch(e){return mem.get(k)||null}},
  async put(k,v){try{await tx('readwrite',s=>s.put(v,k))}catch(e){mem.set(k,v)}},
  async del(k){mem.delete(k);try{await tx('readwrite',s=>s.delete(k))}catch(e){}},
  async keys(){let ks=[];try{ks=await req((await db()).transaction('files').objectStore('files').getAllKeys())}catch(e){}return new Set([...ks,...mem.keys()])}
 };

 /* ---------- state + saved list ---------- */
 const S={grade:'',subject:'',term:'',q:'',sol:false,ext:'',shown:PAGE,bulk:null,view:null,busy:new Set(),pct:{},scan:null,url:'',deep:false};
 let docs=[],have=new Set(),ready=false,loading=null;
 try{const j=JSON.parse(lsGet(IDX_KEY)||'null');if(j&&Array.isArray(j.documents))docs=j.documents}catch(e){}
 const saveIdx=()=>lsSet(IDX_KEY,JSON.stringify({version:1,documents:docs}));
 function load(){if(!loading)loading=store.keys().then(k=>{have=k}).catch(()=>{}).then(()=>{ready=true;refresh();return true});return loading}
 const gradeDocs=()=>docs.map((d,i)=>({d,i})).filter(x=>x.d.grade===S.grade);
 const norm=s=>String(s||'').replace(/[\u064B-\u065F\u0640]/g,'').toLowerCase();
 function filtered(){
  const q=norm(S.q).trim();
  return gradeDocs().filter(({d})=>(!S.subject||d.subject===S.subject)&&(!S.term||String(d.term)===String(S.term))&&(!S.sol||d.solution)&&(!S.ext||ext(d)===S.ext)&&(!q||norm(d.title+' '+(d.subject||'')).includes(q)))
   .sort((a,b)=>String(a.d.subject||'~').localeCompare(String(b.d.subject||'~'),'ar')||String(a.d.title).localeCompare(String(b.d.title),'ar'));
 }

 /* ---------- polite network layer ---------- */
 const robotsCache={};
 function robotsRules(txt){
  const out=[];let star=false,lastAgent=false;
  String(txt).split(/\r?\n/).forEach(line=>{
   line=line.replace(/#.*/,'').trim();const m=line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);if(!m)return;
   const k=m[1].toLowerCase(),v=m[2].trim();
   if(k==='user-agent'){if(!lastAgent)star=false;if(v==='*')star=true;lastAgent=true}
   else{lastAgent=false;if(star&&k==='disallow'&&v){try{out.push(new RegExp('^'+v.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')))}catch(e){}}}
  });
  return out;
 }
 async function robotsAllows(u){
  const x=new URL(u);let rules=robotsCache[x.origin];
  if(!rules){
   let r;try{r=await requestUrl(x.origin+'/robots.txt',{responseType:'text',headers:{Accept:'text/plain'}})}catch(e){throw new Error('robots-unreachable')}
   if(r.status===404||r.status===410)rules=[];
   else if(!r.ok)throw new Error('robots-unreachable');
   else rules=robotsRules(await r.text());
   robotsCache[x.origin]=rules;
  }
  const p=x.pathname+x.search;return !rules.some(rx=>rx.test(p));
 }
 const isRepoDoc=i=>{const d=docs[i];return !!(d&&d.repository&&repoFileOk(d.url))};
 const needPerm=i=>{if(perm()||(i!=null&&isRepoDoc(i)))return true;say(tr('فعّل أولاً الإذن من أصحاب raji3dz داخل البطاقة.','Activez d’abord l’accord raji3dz dans la carte.','Confirm the raji3dz permission in the card first.'));return false};
 async function getHtml(u,signal){
  if(!await robotsAllows(u))throw new Error('robots-disallow');
  const r=await requestUrl(u,{signal,responseType:'text',headers:{Accept:'text/html,application/xhtml+xml'}});
  if(r.status===403||r.status===429)throw new Error('refused');
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.text();
 }
 function extract(html,pageUrl){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const pageTitle=((doc.querySelector('h1')||doc.querySelector('title')||{}).textContent||'').replace(/\s+/g,' ').trim();
  const files=[],pages=[];
  doc.querySelectorAll('a[href]').forEach(a=>{
   let u;try{u=new URL(a.getAttribute('href'),pageUrl)}catch(e){return}
   if(u.protocol!=='https:'&&u.protocol!=='http:')return;
   u.protocol='https:';u.hash='';
   const text=(a.textContent||a.getAttribute('title')||'').replace(/\s+/g,' ').trim();
   (FILE_RX.test(u.pathname)?files:pages).push({url:u.href,text});
  });
  return {files,pages,pageTitle};
 }
 const safeName=u=>{try{return decodeURIComponent(new URL(u).pathname)}catch(e){return ''}};
 function titleFor(f,pageTitle){
  let name='';try{name=decodeURIComponent(new URL(f.url).pathname.split('/').pop()).replace(FILE_RX,'').replace(/[_-]+/g,' ').trim()}catch(e){}
  const t=f.text&&!GENERIC.test(f.text)?f.text:(pageTitle?(name?pageTitle+' — '+name:pageTitle):name);
  return (t||'raji3dz').slice(0,160);
 }

 /* ---------- curated GitHub repository index ---------- */
 async function syncRepositoryIndex(quiet){const sayq=m=>{if(!quiet)say(m)};
  const c=window.SM_SCHOOL_CONFIG||{},base=repoBase();const index=String(c.raji3dzRepositoryIndex||((base?base+'/data/raji3dz-repository-index.json':''))).trim();
  if(!index){sayq(tr('لم يُضبط عنوان مستودع المحتوى.','Le dépôt de contenu n’est pas configuré.','Content repository is not configured.'));return false}
  try{const r=await requestUrl(index,{responseType:'json',headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);const data=await r.json();if(!data||data.schema!=='sm-raji3dz-index-v1'||!Array.isArray(data.items))throw new Error('bad-index');let added=0,skipped=0;
   data.items.forEach(x=>{if(!x||!x.grade||!x.title||!x.file||!repoFileOk(x.file)){skipped++;return}const e=String(x.ext||ext({url:x.file})).toLowerCase();if(!['pdf','doc','docx'].includes(e)){skipped++;return}if(docs.some(d=>d.file===x.file&&d.grade===x.grade))return;docs.push({file:x.file,url:x.file,title:String(x.title).slice(0,160),subject:String(x.subject||''),grade:String(x.grade),ext:e,solution:!!x.solution,page:String(x.source_url||'GitHub Repository'),year:Number(x.year)||null,term:Number(x.term)||null,at:Date.now(),repository:true});added++});saveIdx();refresh();sayq(tr(`تمت مزامنة مستودع GitHub: ${added} ملف جديد${skipped?'، وتجاوز '+skipped+' سجلات غير صالحة':''}.`,`Dépôt GitHub synchronisé : ${added} nouveau(x) fichier(s).`,`GitHub repository synced: ${added} new file(s).`));return true;
  }catch(e){sayq(tr('تعذرت مزامنة مستودع GitHub. تحقق من نشر ملف الفهرس واتصال الإنترنت.','Échec de synchronisation GitHub. Vérifiez l’index publié et Internet.','Could not sync GitHub repository. Check the published index and internet connection.'));return false}
 }

 /* ---------- scan a pasted raji3dz page ---------- */
 const scanErr=e=>{
  const m=e&&e.message||'';
  if(e&&e.name==='AbortError')return '';
  if(m==='robots-disallow')return tr('يمنع الموقع هذه الصفحة في robots.txt، لذلك لم تُفحص.','Le site interdit cette page (robots.txt).','The site disallows this page in robots.txt, so it was not scanned.');
  if(m==='robots-unreachable')return tr('تعذّر التحقق من robots.txt. خارج تطبيق Android يمنع المتصفح عادةً هذا الطلب (CORS).','Impossible de vérifier robots.txt. Hors de l’app Android, le navigateur bloque souvent la requête (CORS).','Could not check robots.txt. Outside the Android app the browser usually blocks this request (CORS).');
  if(m==='refused')return tr('رفض الموقع الطلبات (403/429) فتوقفنا. حاول لاحقاً أو راسل أصحاب الموقع.','Le site refuse les requêtes (403/429) : arrêt.','The site refused the requests (403/429), so we stopped.');
  return tr('تعذّر الاتصال بالموقع. تحقق من الاتصال والرابط.','Connexion impossible. Vérifiez le lien et le réseau.','Could not reach the site. Check the link and your connection.');
 };
 async function scan(url,deep){
  if(!needPerm()||S.scan)return false;
  if(url!=null)S.url=String(url).trim();
  S.deep=!!deep;
  const start=parseUrl(S.url);
  if(!S.grade){say(tr('اختر المستوى أولاً.','Choisissez d’abord le niveau.','Pick a grade first.'));return false}
  if(!start||!sourceUrlOk(start.href)){say(tr('الصق رابط صفحة https من raji3dz.com (النطاقات المسموحة: '+hosts().join('، ')+').','Collez un lien https raji3dz.com.','Paste an https page link on '+hosts().join(', ')+'.'));return false}
  rememberUrl(S.grade,start.href);
  const ctl=new AbortController();S.scan={ctl,pages:0,found:0,added:0,skipped:0};refreshScan();
  const first=start.href.split('#')[0],seen=new Set([first]),queue=[first],maxPages=S.deep?MAX_PAGES:1;
  let refused=0,failure=null;
  try{
   for(let n=0;queue.length&&n<maxPages&&!ctl.signal.aborted;n++){
    const u=queue.shift();if(n>0)await pause(2000);
    let html;
    try{html=await getHtml(u,ctl.signal)}
    catch(e){
     if(e&&e.name==='AbortError')break;
     if(e.message==='refused'){if(n===0||++refused>=3){failure=e;break}continue}
     if(n===0||e.message==='robots-unreachable'){failure=e;break}
     continue;
    }
    refused=0;
    const ex=extract(html,u);
    ex.files.forEach(f=>{
     S.scan.found++;
     if(!hostOk(new URL(f.url).hostname)){S.scan.skipped++;return}
     if(docs.some(d=>d.file===f.url&&d.grade===S.grade))return;
     docs.push({file:f.url,url:f.url,title:titleFor(f,ex.pageTitle),subject:subjectOf(f.text+' '+ex.pageTitle+' '+safeName(f.url)),grade:S.grade,ext:ext({url:f.url}),solution:SOLUTION.test(f.text+' '+f.url),page:u,at:Date.now()});S.scan.added++;
    });
    if(S.deep)ex.pages.forEach(p=>{
     const x=parseUrl(p.url);if(!x||seen.has(x.href.split('#')[0])||!urlOk(x.href)||SKIP_PAGE.test(x.pathname))return;
     seen.add(x.href.split('#')[0]);queue.push(x.href.split('#')[0]);
    });
    S.scan.pages++;refreshScan();
   }
  }catch(e){failure=e}
  const r=S.scan;S.scan=null;saveIdx();refresh();
  if(failure){const m=scanErr(failure);if(m)say(m)}
  else if(!ctl.signal.aborted){
   say(r.added?tr(`أُضيف ${r.added} ملف إلى القائمة`,`${r.added} fichier(s) ajouté(s)`,`${r.added} file(s) added`)
    :r.found?tr('الملفات موجودة في القائمة مسبقاً'+(r.skipped?` (${r.skipped} من نطاق غير مسموح)`:''),'Déjà dans la liste','Already in the list')
    :tr('لم أجد روابط مباشرة لملفات PDF أو Word في هذه الصفحة. قد يتطلب التحميل في الموقع خطوة إضافية؛ اطلب من أصحاب الموقع رابطاً مباشراً.','Aucun lien direct vers un PDF/Word dans cette page.','No direct PDF/Word links found on this page; the site may need an extra step — ask the owners for direct links.'));
  }
  return !failure;
 }
 function cancelScan(){if(S.scan)S.scan.ctl.abort()}

 /* ---------- download ---------- */
 async function fetchDoc(i,signal){
  const d=docs[i];
  if(!perm()&&!isRepoDoc(i))throw new Error('no-permission');
  if(!urlOk(d.url))throw new Error('host-not-allowed');
  S.busy.add(i);S.pct[i]=0;
  try{
   if(!isRepoDoc(i)&&!await robotsAllows(d.url))throw new Error('robots-disallow');
   const res=await requestUrl(d.url,{signal,responseType:'arraybuffer',headers:{Accept:MIME[ext(d)]||'*/*'}});
   if(res.status===403||res.status===429)throw new Error('refused');
   if(!res.ok)throw new Error('HTTP '+res.status);
   const total=+(res.headers&&res.headers.get&&res.headers.get('content-length'))||0;
   if(total>MAX_BYTES)throw new Error('too-big');
   let parts=[],got=0;
   if(res.body&&res.body.getReader){
    const rd=res.body.getReader();
    for(;;){const {done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;if(got>MAX_BYTES)throw new Error('too-big');S.pct[i]=total?Math.min(99,Math.round(got*100/total)):0;const el=document.getElementById('rj-p-'+i);if(el)el.textContent=S.pct[i]+'%'}
   }else{
    const bytes=await res.arrayBuffer();got=bytes.byteLength;if(got>MAX_BYTES)throw new Error('too-big');parts=[bytes];S.pct[i]=100;
   }
   const blob=new Blob(parts,{type:MIME[ext(d)]||'application/octet-stream'});
   if(!blob.size||blob.size>MAX_BYTES)throw new Error('bad-file');
   const h=new Uint8Array(await blob.slice(0,4).arrayBuffer()),e=ext(d);
   const ok=e==='pdf'?(h[0]===0x25&&h[1]===0x50&&h[2]===0x44&&h[3]===0x46):e==='docx'?(h[0]===0x50&&h[1]===0x4B):(h[0]===0xD0&&h[1]===0xCF)||(h[0]===0x50&&h[1]===0x4B);
   if(!ok)throw new Error('not-a-document');
   await store.put(d.file,{blob,size:blob.size,at:Date.now()});
   d.bytes=blob.size;saveIdx();have.add(d.file);
   return blob;
  }finally{S.busy.delete(i);delete S.pct[i]}
 }
 async function blobOf(i){
  const d=docs[i],rec=await store.get(d.file);
  if(rec&&rec.blob)return rec.blob;
  const b=await fetchDoc(i);refreshList();return b;
 }
 async function readPdfText(i,maxPages=18,maxChars=14000){
  const d=docs[i];if(!d||ext(d)!=='pdf')throw new Error('pdf-required');
  const blob=await blobOf(i);if(!window.pdfjsLib)throw new Error('pdfjs-missing');
  pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:await blob.arrayBuffer()}).promise;let out=[];
  for(let n=1;n<=Math.min(pdf.numPages,maxPages);n++){const page=await pdf.getPage(n),content=await page.getTextContent();const line=content.items.map(x=>x.str||'').join(' ').replace(/\s+/g,' ').trim();if(line)out.push('صفحة '+n+': '+line);if(out.join('\n').length>=maxChars)break;}
  const text=out.join('\n').slice(0,maxChars);if(!text.trim())throw new Error('pdf-no-text');return {text,pages:pdf.numPages,readPages:Math.min(pdf.numPages,maxPages),title:d.title,grade:d.grade,subject:d.subject,source:d.file};
 }
 const errText=e=>{
  const m=e&&e.message||'';
  if(e&&e.name==='AbortError')return '';
  if(m==='no-permission')return tr('فعّل أولاً الإذن من أصحاب raji3dz.','Activez d’abord l’accord raji3dz.','Confirm the raji3dz permission first.');
  if(m==='robots-disallow'||m==='robots-unreachable'||m==='refused')return scanErr(e);
  if(m==='too-big')return tr('الملف أكبر من 40 MB فلم يُحمَّل.','Fichier > 40 MB, non téléchargé.','File is over 40 MB, not downloaded.');
  if(m==='not-a-document'||m==='bad-file')return tr('الرابط لم يُرجع ملفاً صالحاً (قد يكون محمياً أو يحتاج تسجيل دخول).','Le lien ne renvoie pas un fichier valide (protégé ou connexion requise).','The link did not return a valid file (it may be protected or need a login).');
  return tr('تعذّر التحميل. تحقق من الاتصال وأعد المحاولة.','Téléchargement impossible. Vérifiez la connexion.','Download failed. Check your connection and retry.');
 };
 async function downloadAll(){
  if(S.bulk)return;
  const todo=filtered().filter(x=>!have.has(x.d.file));
  if(todo.some(x=>!isRepoDoc(x.i))&&!needPerm())return;
  if(!todo.length){say(tr('كل ما في القائمة محفوظ على الجهاز','Tout est déjà sur l’appareil','Everything shown is already on your device'));return}
  const ctl=new AbortController();S.bulk={n:todo.length,done:0,fail:0,ctl};refreshList();
  let refused=0;
  for(const {i} of todo){
   if(ctl.signal.aborted)break;
   try{await fetchDoc(i,ctl.signal);S.bulk.done++;refused=0}
   catch(e){
    if(e&&e.name==='AbortError')break;
    S.bulk.fail++;
    if(e&&e.message==='refused'&&++refused>=3){say(scanErr(e));break}
   }
   refreshList();await pause(1500);
  }
  const b=S.bulk;S.bulk=null;refreshList();
  say(tr(`حُمّل ${b.done} من ${b.n}`+(b.fail?` — تعذّر ${b.fail}`:''),`${b.done}/${b.n} téléchargés`,`${b.done}/${b.n} downloaded`));
 }
 function cancelBulk(){if(S.bulk)S.bulk.ctl.abort()}
 async function clearGrade(){
  const mine=gradeDocs();if(!mine.length)return;
  if(typeof confirm==='function'&&!confirm(tr(`حذف ${mine.length} عنصراً من القائمة وملفاتها من هذا الجهاز؟`,`Supprimer ${mine.length} éléments et leurs fichiers ?`,`Remove ${mine.length} items and their files from this device?`)))return;
  for(const {d} of mine){await store.del(d.file);have.delete(d.file)}
  const keep=new Set(mine.map(x=>x.i));docs=docs.filter((d,i)=>!keep.has(i));saveIdx();refresh();
 }

 /* ---------- save / share ---------- */
 const fileName=d=>(String(d.title||'raji3dz').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,90)||'raji3dz')+'.'+ext(d);
 async function saveBlob(d,blob){
  const name=fileName(d);
  try{const f=new File([blob],name,{type:blob.type});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:d.title});return 'shared'}}
  catch(e){if(e&&e.name==='AbortError')return 'cancel'}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>{try{URL.revokeObjectURL(a.href)}catch(e){}},30000);return 'download';
 }
 async function save(i){if(!needPerm(i))return;try{await saveBlob(docs[i],await blobOf(i))}catch(e){const m=errText(e);if(m)say(m)}}

 /* ---------- in-app viewer ---------- */
 async function renderPdf(blob){
  const box=document.getElementById('rjPdf');if(!box)return;
  try{
   if(!window.pdfjsLib)throw new Error('pdfjs missing');
   pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';
   const pdf=await pdfjsLib.getDocument({data:await blob.arrayBuffer()}).promise;
   box.innerHTML='';
   const w=Math.min(box.clientWidth||360,900)*(window.devicePixelRatio||1);
   for(let n=1;n<=pdf.numPages;n++){
    if(!document.getElementById('rjPdf'))return;
    const pg=await pdf.getPage(n),v0=pg.getViewport({scale:1}),v=pg.getViewport({scale:w/v0.width});
    const c=document.createElement('canvas');c.width=v.width;c.height=v.height;c.style.width='100%';c.className='tl-pg';
    box.appendChild(c);await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
   }
  }catch(e){box.innerHTML='<p class="tl-vhint">'+tr('تعذّر عرض الملف هنا. اضغط زر الحفظ لفتحه في تطبيق آخر.','Affichage impossible ici ; utilisez Enregistrer.','Cannot show it here; tap Save to open it elsewhere.')+'</p>'}
 }
 async function openDoc(i){
  if(!needPerm(i))return;
  try{
   const d=docs[i],blob=await blobOf(i);closeViewer(true);
   const url=URL.createObjectURL(blob),isPdf=ext(d)==='pdf';
   const o=document.createElement('div');o.className='tl-viewer';o.id='rjViewer';
   o.innerHTML=`<div class="tl-vbar"><button type="button" class="tl-vbtn" onclick="SM_RAJI3DZ.close()" aria-label="${tr('إغلاق','Fermer','Close')}">✕</button><b>${esc(d.title)}</b><button type="button" class="tl-vbtn" onclick="SM_RAJI3DZ.saveCurrent()" aria-label="${tr('حفظ / مشاركة','Enregistrer / partager','Save / share')}">⬇</button></div>`+
    (isPdf?`<div class="tl-pdfwrap" id="rjPdf"><p class="tl-vhint">…</p></div>`
     :`<div class="tl-vno"><p>${tr('هذا ملف Word ولا يمكن عرضه داخل التطبيق. اضغط ⬇ لحفظه أو فتحه في Word.','Fichier Word : touchez ⬇ pour l’enregistrer.','This is a Word file and cannot be shown in the app. Tap ⬇ to save or open it in Word.')}</p></div>`);
   document.body.appendChild(o);document.body.style&&(document.body.style.overflow='hidden');
   S.view={i,url,blob,pushed:false};if(isPdf)renderPdf(blob);
   try{history.pushState({smSchoolPage:typeof page!=='undefined'?page:'home',rjViewer:1},'');S.view.pushed=true}catch(e){}
  }catch(e){const m=errText(e);if(m)say(m)}
 }
 function closeViewer(silent){
  const v=S.view;if(!v)return;S.view=null;
  const o=document.getElementById('rjViewer');if(o&&o.remove)o.remove();
  try{URL.revokeObjectURL(v.url)}catch(e){}
  if(document.body.style)document.body.style.overflow='';
  if(!silent&&v.pushed){try{history.back()}catch(e){}}
 }
 async function saveCurrent(){if(S.view)await saveBlob(docs[S.view.i],S.view.blob)}
 if(typeof window.addEventListener==='function')window.addEventListener('popstate',()=>{if(S.view){S.view.pushed=false;closeViewer(true)}});
 const hb=window.handleAppBack;
 if(typeof hb==='function')window.handleAppBack=function(){if(S.view){closeViewer(false);return}return hb.apply(this,arguments)};

 /* ---------- rendering ---------- */
 const head=()=>`<div class="learning-meta"><b>📥 ${tr('مكتبة راجِع ديزاد','Bibliothèque Raji3DZ','Raji3DZ library')}</b></div><div class="tl-flow" aria-label="Raji3DZ to SM Education"><div class="tl-flow-step"><b>Raji3DZ</b><small>${tr('مصدر الملفات المصرح بها','Source des fichiers autorisés','Authorized file source')}</small></div><span class="tl-flow-arrow">↓</span><div class="tl-flow-step tl-flow-final"><b>SM EDUCATION</b><small>${tr('البحث والتنزيل المباشر إلى جهازك','Recherche et téléchargement direct sur votre appareil','Search and download directly to your device')}</small></div></div><small>${tr('المصدر الخارجي: raji3dz.com · التخزين النهائي: جهازك. لا يعاد نشر الملفات من التطبيق.','Source : raji3dz.com · stockage final : votre appareil. Les fichiers ne sont pas republiés par l’application.','External source: raji3dz.com · final storage: your device. Files are not republished by the app.')}</small>`;
 const credit=()=>`<small class="tl-credit">${tr('المصدر: raji3dz.com — الملفات ملك لأصحابها، وتُحمَّل على جهازك فقط بناءً على إقرارك بموافقة أصحاب الموقع.','Source : raji3dz.com — fichiers conservés sur votre appareil, selon votre déclaration d’accord des propriétaires.','Source: raji3dz.com — files belong to their owners and stay on your device, based on your confirmation of the site owners’ agreement.')}</small>`;
 function permHtml(){
  return `<p>${tr('حمّل امتحانات وفروضاً مباشرة من raji3dz.com إلى جهازك. لا يبدأ أي فحص أو تحميل قبل أن تقرّ بأنك حصلت على موافقة أصحاب الموقع.','Téléchargez des examens depuis raji3dz.com. Rien ne démarre avant que vous confirmiez l’accord des propriétaires du site.','Download exams from raji3dz.com. Nothing starts until you confirm the site owners agreed.')}</p>`+
   `<label class="tl-check"><input type="checkbox" id="rjAck"> ${tr('أقرّ بأنني حصلت على موافقة أصحاب موقع raji3dz.com على هذا الاستخدام.','Je confirme avoir obtenu l’accord des propriétaires de raji3dz.com.','I confirm I have the agreement of the raji3dz.com owners for this use.')}</label>`+
   `<div class="tl-filters"><input id="rjNote" type="text" maxlength="200" placeholder="${tr('مرجع الموافقة (اختياري): تاريخ الرسالة أو اسم المرسِل','Référence de l’accord (facultatif)','Agreement reference (optional)')}">`+
   `<button type="button" class="primary-btn tl-btn" onclick="SM_RAJI3DZ.grant(document.getElementById('rjAck').checked,document.getElementById('rjNote').value)">${tr('تفعيل','Activer','Enable')}</button></div>`+credit();
 }
 function scanHtml(){
  const sc=S.scan,when=perm()&&perm().at?new Date(perm().at).toLocaleDateString(L()==='ar'?'ar-DZ':L()==='fr'?'fr-FR':'en-GB'):'';
  return `<div class="tl-filters"><input id="rjUrl" type="url" inputmode="url" dir="ltr" value="${esc(S.url)}" oninput="SM_RAJI3DZ.setv('url',this.value)" placeholder="https://www.raji3dz.com/…">`+
   `<label class="tl-check"><input type="checkbox" id="rjDeep" ${S.deep?'checked':''} onchange="SM_RAJI3DZ.setv('deep',this.checked)"> ${tr('افحص أيضاً الصفحات المرتبطة (حتى '+MAX_PAGES+' صفحة، ببطء)','Scanner aussi les pages liées (max '+MAX_PAGES+')','Also scan linked pages (up to '+MAX_PAGES+', slowly)')}</label>`+
   (sc?`<button type="button" class="secondary-btn tl-btn" onclick="SM_RAJI3DZ.cancelScan()">${tr('إيقاف','Arrêter','Stop')}</button><small id="rjScan" role="status">${tr('جارٍ الفحص… صفحات: '+sc.pages+' — ملفات: '+sc.found,'Analyse… pages : '+sc.pages+' — fichiers : '+sc.found,'Scanning… pages: '+sc.pages+' — files: '+sc.found)}</small>`
    :`<button type="button" class="primary-btn tl-btn" onclick="SM_RAJI3DZ.scan(document.getElementById('rjUrl').value,document.getElementById('rjDeep').checked)">${tr('افحص الصفحة وأضف الملفات','Analyser la page','Scan page & add files')} (${esc(S.grade)})</button>`)+
   `</div><small>${tr('الصق رابط صفحة المادة أو المستوى من raji3dz.com. التفعيل بتاريخ '+when+'.','Collez le lien d’une page raji3dz.com. Activé le '+when+'.','Paste a raji3dz.com page link. Enabled on '+when+'.')} <a href="#" onclick="SM_RAJI3DZ.revoke();return false">${tr('إلغاء التفعيل','Désactiver','Disable')}</a></small>`;
 }
 function rowHtml({d,i}){
  const got=have.has(d.file),busy=S.busy.has(i);
  const meta=[d.subject,ext(d).toUpperCase(),d.solution?tr('مع الحل','avec corrigé','with solution'):'',d.bytes?kb(d.bytes):''].filter(Boolean).join(' · ');
  return `<div class="tl-row"><div class="tl-main"><b>${got?'✅ ':''}${esc(d.title)}</b><small>${esc(meta)}</small></div>`+
   `<div class="tl-actions">${busy?`<span class="tl-wait" id="rj-p-${i}">⏳ ${S.pct[i]||0}%</span>`:`<button type="button" class="primary-btn tl-btn" onclick="SM_RAJI3DZ.open(${i})">${got?tr('فتح','Ouvrir','Open'):tr('تحميل وفتح','Télécharger','Get & open')}</button><button type="button" class="secondary-btn tl-btn" onclick="SM_RAJI3DZ.save(${i})" aria-label="${tr('حفظ / مشاركة','Enregistrer','Save / share')}">⬇</button>`}</div></div>`;
 }
 function listHtml(){
  const all=filtered(),shown=all.slice(0,S.shown),mine=gradeDocs().filter(x=>have.has(x.d.file)).length,pending=all.filter(x=>!have.has(x.d.file)).length;
  let bar;
  if(S.bulk){const b=S.bulk,p=Math.round(b.done*100/b.n);bar=`<div class="tl-bulk"><progress max="100" value="${p}"></progress><small>${tr('تحميل','Téléchargement','Downloading')} ${b.done}/${b.n}${b.fail?' — ⚠ '+b.fail:''}</small><button type="button" class="secondary-btn tl-btn" onclick="SM_RAJI3DZ.cancelBulk()">${tr('إيقاف','Arrêter','Stop')}</button></div>`}
  else bar=`<div class="tl-bulk"><button type="button" class="primary-btn tl-btn" onclick="SM_RAJI3DZ.downloadAll()" ${pending?'':'disabled'}>⬇ ${tr('تحميل كل المعروض','Tout télécharger','Download all shown')} (${pending})</button>${gradeDocs().length?`<button type="button" class="secondary-btn tl-btn" onclick="SM_RAJI3DZ.clearGrade()">🗑 ${tr('مسح قائمة المستوى','Vider la liste','Clear this grade')}</button>`:''}</div>`;
  return `<small class="tl-count">${all.length} ${tr('ملف','fichiers','files')} · ${mine} ${tr('على الجهاز','sur l’appareil','on this device')}</small>${bar}`+
   (all.length?`<div class="tl-list">${shown.map(rowHtml).join('')}</div>`:`<p>${tr('لا توجد ملفات في القائمة لهذا المستوى بعد. الصق رابط صفحة من raji3dz.com بالأعلى.','Aucun fichier pour ce niveau. Collez un lien raji3dz.com ci-dessus.','No files for this grade yet. Paste a raji3dz.com link above.')}</p>`)+
   (all.length>shown.length?`<button type="button" class="secondary-btn tl-more" onclick="SM_RAJI3DZ.more()">${tr('عرض المزيد','Plus','Show more')} (${all.length-shown.length})</button>`:'');
 }
 function inner(){
  if(!ready)return head()+`<p>${tr('جارٍ التحميل…','Chargement…','Loading…')}</p>`;
  const opt=(v,t,c)=>`<option value="${esc(v)}" ${String(c)===String(v)?'selected':''}>${esc(t)}</option>`;
  const termSel=`<select aria-label="${tr('الفصل','Trimestre','Term')}" onchange="SM_RAJI3DZ.set('term',this.value)">${opt('',tr('كل الفصول','Tous','All terms'),S.term)}${[1,2,3].map(n=>opt(String(n),tr('الفصل '+['الأول','الثاني','الثالث'][n-1],'Trimestre '+n,'Term '+n),S.term)).join('')}</select>`;
  const adv=`<details class="tl-adv"><summary>${tr('إضافة ملفات من raji3dz.com (متقدم)','Ajouter depuis raji3dz.com (avancé)','Add from raji3dz.com (advanced)')}</summary>${perm()?scanHtml():permHtml()}</details>`;
  return head()+`<div class="tl-filters"><select aria-label="${tr('المادة','Matière','Subject')}" onchange="SM_RAJI3DZ.set('subject',this.value)">${opt('',tr('كل المواد','Toutes','All subjects'),S.subject)}${[...new Set(gradeDocs().map(x=>x.d.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar')).map(s=>opt(s,s,S.subject)).join('')}</select>${termSel}<input type="search" value="${esc(S.q)}" placeholder="${tr('بحث','Rechercher','Search')}" oninput="SM_RAJI3DZ.set('q',this.value)">`+
   `<select aria-label="${tr('الصيغة','Format','Format')}" onchange="SM_RAJI3DZ.set('ext',this.value)">${opt('',tr('كل الصيغ','Tous','All formats'),S.ext)}${opt('pdf','PDF',S.ext)}${opt('docx','Word',S.ext)}</select>`+
   `<label class="tl-check"><input type="checkbox" ${S.sol?'checked':''} onchange="SM_RAJI3DZ.set('sol',this.checked)"> ${tr('مع الحل فقط','Corrigés','With solution')}</label></div>`+
   `<div id="rjList">${listHtml()}</div>`+adv+credit();
 }
 function refresh(){const el=document.getElementById('rjLib');if(el)el.innerHTML=inner()}
 function refreshList(){const el=document.getElementById('rjList');if(el)el.innerHTML=listHtml()}
 function refreshScan(){const el=document.getElementById('rjScan'),sc=S.scan;if(el&&sc)el.textContent=tr('جارٍ الفحص… صفحات: '+sc.pages+' — ملفات: '+sc.found,'Analyse… pages : '+sc.pages+' — fichiers : '+sc.found,'Scanning… pages: '+sc.pages+' — files: '+sc.found);else refresh()}
 function panel(g){
  if(S.grade!==g)Object.assign(S,{grade:g,subject:'',term:'',q:'',sol:false,ext:'',shown:PAGE,url:lastUrls()[g]||''});
  if(!ready)load();
  return `<section class="panel dz-panel tl" id="rjLib">${inner()}</section>`;
 }
 function set(k,v){S[k]=v;S.shown=PAGE;refreshList()}
 function setv(k,v){S[k]=v}

 window.raji3dzPanel=panel;
 window.SM_RAJI3DZ={set,setv,more(){S.shown+=PAGE;refreshList()},grant,revoke,scan,cancelScan,open:openDoc,save,saveCurrent,close:()=>closeViewer(false),downloadAll,cancelBulk,clearGrade,readPdfText,syncRepositoryIndex,
  _t:{S,subjectOf,lastUrls,store,load,filtered,fetchDoc,scan,robotsRules,robotsAllows,extract,titleFor,hostOk,urlOk,repoFileOk,perm,requestUrl,nativeHttp,docs:()=>docs,have:()=>have,reset(){docs=[];ready=false;loading=null;have=new Set();mem.clear();Object.keys(robotsCache).forEach(k=>delete robotsCache[k]);Object.assign(S,{grade:'',subject:'',term:'',q:'',sol:false,ext:'',shown:PAGE,bulk:null,view:null,scan:null,url:'',deep:false})}}};

 const st=document.createElement('style');
 st.textContent='.tl-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.tl-pdfwrap{overflow:auto;height:calc(100% - 60px);padding:8px;background:#e9edf3}.tl-pg{display:block;margin:0 auto 8px;background:#fff;box-shadow:0 1px 4px #0003}';
 (document.head||document.body).appendChild(st);
})();
