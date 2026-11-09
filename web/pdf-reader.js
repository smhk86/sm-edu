/* SM EDUCATION — قارئ PDF مشترك يعالج تقطّع الحروف العربية.
   1) يرسم الصفحات بلا FontFace (disableFontFace) لتفادي إعادة تشكيل المتصفح للحروف الجاهزة.
   2) وضع «نص عربي واضح»: يعيد بناء النص بترتيب RTL وبمسافات مبنية على الفراغات الفعلية ثم يُطبّع الأشكال العرضية (NFKC). */
(function(g){'use strict';
 const doc=g.document;
 const OPTS={disableFontFace:true,useSystemFonts:true,isEvalSupported:false};
 g.SM_PDF_OPTS=OPTS;
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const AR=/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
 const norm=s=>String(s).normalize('NFKC').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'').replace(/\u0640/g,'').replace(/[ \t]+/g,' ').trim();
 const ls={get:k=>{try{return g.localStorage.getItem(k)||''}catch(e){return ''}},set:(k,v)=>{try{g.localStorage.setItem(k,v)}catch(e){}}};

 /* تحويل عناصر getTextContent إلى نص مرتب */
 function itemsToText(items){
  const rows=[];
  (items||[]).forEach(it=>{
   if(!it||!it.str||!it.transform)return;
   const h=Math.abs(it.transform[3])||it.height||10,y=it.transform[5];
   let row=rows.find(r=>Math.abs(r.y-y)<=Math.max(2,r.h*0.5));
   if(!row){row={y,h,items:[]};rows.push(row)}
   row.items.push({s:it.str,x:it.transform[4],w:it.width||(it.str.length*h*0.45),h});
  });
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(r=>{
   const joined=r.items.map(i=>i.s).join('');
   const arCount=(joined.match(AR)||[]).length,rtl=arCount>joined.replace(/\s/g,'').length*0.3;
   r.items.sort((a,b)=>rtl?b.x-a.x:a.x-b.x);
   let out='',prev=null;
   r.items.forEach(i=>{
    if(prev){
     const gap=rtl?(prev.x-(i.x+i.w)):(i.x-(prev.x+prev.w));
     const endsSp=/\s$/.test(out),startsSp=/^\s/.test(i.s);
     if(gap>r.h*0.3&&!endsSp&&!startsSp)out+=' ';
    }
    out+=i.s;prev=i;
   });
   return norm(out);
  }).filter(Boolean).join('\n');
 }

 async function open(blob){
  if(!g.pdfjsLib)throw new Error('pdfjs missing');
  g.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';
  return g.pdfjsLib.getDocument(Object.assign({data:await blob.arrayBuffer()},OPTS)).promise;
 }

 async function renderPages(pdf,box,alive){
  const w=Math.min(box.clientWidth||360,1000)*Math.min(g.devicePixelRatio||1,2.5);
  for(let n=1;n<=pdf.numPages;n++){
   if(!alive())return;
   const pg=await pdf.getPage(n),v0=pg.getViewport({scale:1}),v=pg.getViewport({scale:w/v0.width});
   const c=doc.createElement('canvas');c.width=v.width;c.height=v.height;c.style.width='100%';c.className='tl-pg';
   box.appendChild(c);
   await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
  }
 }
 async function renderText(pdf,box,alive){
  let any=false;
  for(let n=1;n<=pdf.numPages;n++){
   if(!alive())return;
   const pg=await pdf.getPage(n),content=await pg.getTextContent();
   const txt=itemsToText(content.items);
   const sec=doc.createElement('section');sec.className='sm-pdf-textpage';sec.setAttribute('dir','auto');
   if(txt){any=true;sec.innerHTML=`<small class="sm-pdf-pn">صفحة ${n}</small><div class="sm-pdf-body">${esc(txt)}</div>`;box.appendChild(sec)}
   else{
    sec.innerHTML=`<small class="sm-pdf-pn">صفحة ${n}</small><p class="tl-vhint">لا يوجد نص قابل للقراءة في هذه الصفحة (قد تكون ممسوحة ضوئياً). هذه صورتها:</p>`;box.appendChild(sec);
    const v0=pg.getViewport({scale:1}),v=pg.getViewport({scale:Math.min(box.clientWidth||360,1000)*Math.min(g.devicePixelRatio||1,2)/v0.width});
    const c=doc.createElement('canvas');c.width=v.width;c.height=v.height;c.style.width='100%';c.className='tl-pg';sec.appendChild(c);
    await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
   }
  }
  return any;
 }

 /* الواجهة: شريط تبديل + محتوى */
 async function render(blob,box,alive){
  alive=alive||(()=>true);
  const pdf=await open(blob);
  const mode0=ls.get('smPdfMode')==='text'?'text':'pages';
  box.innerHTML='<div class="sm-pdf-bar"><button type="button" class="tl-vbtn" data-m="pages">📄 الصفحات</button><button type="button" class="tl-vbtn" data-m="text">🔤 نص عربي واضح</button></div><div class="sm-pdf-hint">إن بدت الكلمات العربية متقطعة اضغط «نص عربي واضح».</div><div class="sm-pdf-content"></div>';
  const bar=box.querySelector('.sm-pdf-bar'),content=box.querySelector('.sm-pdf-content');
  let token=0;
  async function show(mode){
   const my=++token;ls.set('smPdfMode',mode);
   bar.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.m===mode));
   content.innerHTML='';
   const stillMine=()=>my===token&&alive();
   try{mode==='text'?await renderText(pdf,content,stillMine):await renderPages(pdf,content,stillMine)}
   catch(e){if(my===token)content.innerHTML='<p class="tl-vhint">تعذّر عرض الملف هنا. اضغط زر الحفظ لفتحه في تطبيق آخر.</p>'}
  }
  bar.addEventListener('click',e=>{const b=e.target.closest('button[data-m]');if(b)show(b.dataset.m)});
  await show(mode0);
 }

 async function readText(blob,maxPages,maxChars){
  const pdf=await open(blob),out=[];
  for(let n=1;n<=Math.min(pdf.numPages,maxPages||18);n++){
   const t=itemsToText((await (await pdf.getPage(n)).getTextContent()).items);
   if(t)out.push('صفحة '+n+': '+t);
   if(out.join('\n').length>=(maxChars||14000))break;
  }
  return {text:out.join('\n').slice(0,maxChars||14000),pages:pdf.numPages};
 }

 const css='.sm-pdf-bar{display:flex;gap:8px;position:sticky;top:0;z-index:2;padding:6px;background:var(--surface,#fff)}.sm-pdf-bar .tl-vbtn{flex:1;min-height:44px;border:1px solid var(--line,#ccd);border-radius:12px}.sm-pdf-bar .tl-vbtn.on{background:var(--accent,#0f766e);color:#fff}.sm-pdf-hint{font-size:12px;opacity:.75;padding:2px 8px 8px}.sm-pdf-textpage{padding:12px 14px;border-bottom:1px solid var(--line,#dde)}.sm-pdf-pn{opacity:.6}.sm-pdf-body{white-space:pre-wrap;line-height:2;font-size:17px;font-family:"Noto Naskh Arabic","Amiri","IBM Plex Sans Arabic",serif;unicode-bidi:plaintext;text-align:start;direction:rtl}.tl-pdfwrap{direction:ltr}.sm-pdf-textpage{direction:rtl}';
 if(doc&&doc.head&&!doc.getElementById('smPdfStyle')){const s=doc.createElement('style');s.id='smPdfStyle';s.textContent=css;doc.head.appendChild(s)}
 g.SM_PDF={OPTS,open,render,readText,itemsToText,norm};
})(typeof window!=='undefined'?window:globalThis);
