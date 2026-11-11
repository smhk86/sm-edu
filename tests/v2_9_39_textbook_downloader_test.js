const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const mem=new Map(),msgs=[],calls=[],imports=[];
global.window=global;global.lang='ar';global.grade='الرابعة متوسط';global.toast=m=>msgs.push(m);
global.localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
global.document={getElementById:()=>null,addEventListener(){},head:null};
global.SM_SCHOOL_CONFIG={textbookHosts:['books.example.test'],publicContentBase:''};
global.Capacitor={isNativePlatform:()=>true};
const PDF=Buffer.from('%PDF-1.4\nTest textbook');
let site={};
global.CapacitorHttp={request:async o=>{calls.push(o.url);const r=site[o.url]||{status:404,data:''};return{status:r.status,headers:r.headers||{},data:r.data}}};
global.fetch=async u=>({ok:true,json:async()=>CAT});
const CAT={books:[
 {id:'math-4am',grade:'الرابعة متوسط',subject:'الرياضيات',title:'كتاب الرياضيات',url:'https://books.example.test/m.pdf'},
 {id:'bad id!',grade:'الرابعة متوسط',subject:'الرياضيات',title:'x',url:'https://books.example.test/x.pdf'},
 {id:'ext-1',grade:'الرابعة متوسط',subject:'العربية',title:'كتاب خارجي',url:'https://evil.example.org/a.pdf'},
 {id:'http-1',grade:'الرابعة متوسط',subject:'العربية',title:'غير آمن',url:'http://books.example.test/a.pdf'}
]};
global.SM_TEACHER_BOOKS={panelHtml:()=>'<p>base</p>',remove:async()=>{},listSaved:async()=>[],importBlob:async(b,m)=>{imports.push({size:b.size,meta:m});return{id:'tb-1',...m}}};
eval(fs.readFileSync(path.join(root,'web/textbook-downloader.js'),'utf8'));
const D=SM_TEXTBOOK_DL,T=D._t;
(async()=>{
 // allow-list
 assert(T.urlOk('https://books.example.test/a.pdf'),'listed host allowed');
 assert(T.urlOk('https://cdn.books.example.test/a.pdf'),'subdomain allowed');
 assert(!T.urlOk('http://books.example.test/a.pdf'),'http refused');
 assert(!T.urlOk('https://evil.example.org/a.pdf'),'unlisted host refused');
 assert(!T.urlOk('https://notbooks.example.test/a.pdf'),'look-alike host refused');
 // catalogue sanitising
 await D.load();
 const ids=T.cleanBooks(CAT).map(b=>b.id);
 assert.deepStrictEqual(ids,['math-4am','ext-1','http-1'],'unsafe ids are dropped');
 // permission gate
 site['https://books.example.test/m.pdf']={status:200,headers:{'content-length':String(PDF.length)},data:PDF.toString('base64')};
 await D.download('math-4am');
 assert.strictEqual(calls.length,0,'no request before the user confirms permission');
 assert(msgs.some(m=>m.includes('أكّد')),'user is asked to confirm');
 D.grant(true);
 // unlisted host / http never contacted
 await D.download('ext-1');await D.download('http-1');
 assert.strictEqual(calls.length,0,'unlisted/http hosts are never contacted');
 // successful single-book download
 await D.download('math-4am');
 assert.strictEqual(calls.length,1,'exactly one request for one book (no bulk)');
 assert.strictEqual(imports.length,1);
 assert.strictEqual(imports[0].size,PDF.length);
 assert.strictEqual(imports[0].meta.sourceBookId,'math-4am');
 assert.strictEqual(imports[0].meta.grade,'الرابعة متوسط');
 assert.strictEqual(imports[0].meta.source,'catalogue_download');
 // not a PDF
 site['https://books.example.test/m.pdf']={status:200,headers:{},data:Buffer.from('<html>login</html>').toString('base64')};
 await D.download('math-4am');
 assert.strictEqual(imports.length,1,'non-PDF is not imported');
 assert(msgs.some(m=>m.includes('ليس PDF')));
 // refused
 site['https://books.example.test/m.pdf']={status:429,headers:{},data:''};
 await D.download('math-4am');
 assert(msgs.some(m=>m.includes('رفض الموقع')),'403/429 stops the download');
 assert.strictEqual(imports.length,1);
 // too big (content-length)
 site['https://books.example.test/m.pdf']={status:200,headers:{'content-length':String(90*1048576)},data:PDF.toString('base64')};
 await D.download('math-4am');
 assert(msgs.some(m=>m.includes('80 ميغابايت')),'size cap enforced');
 assert.strictEqual(imports.length,1);
 // panel integration appends the catalogue section
 assert(SM_TEACHER_BOOKS.panelHtml().includes('smTdList'),'panel gets the direct-download section');
 // disabled when no host configured
 SM_SCHOOL_CONFIG.textbookHosts=[];
 assert(!T.urlOk('https://books.example.test/a.pdf'),'empty host list disables downloads');
 const files=['web/textbook-downloader.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8'));
 assert(fs.readFileSync(path.join(root,'web/index.html'),'utf8').includes('textbook-downloader.js'),'script is loaded');
 assert(fs.readFileSync(path.join(root,'web/sw.js'),'utf8').includes('./textbook-downloader.js'),'script is precached');
 assert(JSON.parse(fs.readFileSync(path.join(root,'web/data/textbook-repository-index.json'),'utf8')).books.length>=0);
 assert(/textbookHosts:\s*\[/.test(fs.readFileSync(path.join(root,'web/config.js'),'utf8')),'config exposes textbookHosts');
 console.log('v2.9.40 textbook downloader tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
