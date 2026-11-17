// v2.4.1: files fetched into the repo are served from our own GitHub Pages; the app lists them from dzexams-index.json.
const fs=require('fs'),path=require('path'),assert=require('assert'),root=path.join(__dirname,'..');
const els={},toasts=[];
global.window=global;global.lang='ar';global.page='tests';
global.toast=m=>toasts.push(m);global.confirm=()=>true;
global.setTimeout=(f)=>{f();return 0};
const ls=new Map();
global.localStorage={getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)};
global.history={pushState(){},back(){}};
global.document={getElementById:id=>els[id]||null,createElement:()=>({style:{},click(){},remove(){}}),body:{style:{},appendChild(){}}};
global.DOMParser=class{parseFromString(){return {querySelectorAll:()=>[],querySelector:()=>null}}};
const B='https://smhk86.github.io/sm-education',G='الأولى متوسط',PDF=n=>Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(n,65)]);
const calls=[];
const index={documents:[
 {file:'exams/dzexams/e2ac9f73_20512.pdf',title:'اختبار الفصل الأول',subject:'الرياضيات',grade:G,solution:false,bytes:300},
 {file:'exams/dzexams/ab6491dc_20513.pdf',title:'الحل',subject:'الرياضيات',grade:G,solution:true,bytes:300},
 {file:'../secret.pdf',title:'bad path',grade:G},
 {file:'http://evil.example.com/x.pdf',title:'bad host',grade:G},
 {file:'exams/dzexams/no-grade.pdf',title:'no grade'},
 null]};
global.fetch=async(u)=>{calls.push(u);
 if(u.startsWith(B+'/data/dzexams-index.json'))return new Response(JSON.stringify(index),{status:200});
 if(u===B+'/exams/dzexams/e2ac9f73_20512.pdf')return new Response(PDF(300),{status:200,headers:{'content-length':'309'}});
 return new Response('nope',{status:404})};
window.SM_SCHOOL_CONFIG={publicContentBase:B+'/',dzexamsHosts:['dzexams.com','dzexams.pro']};
eval(fs.readFileSync(path.join(root,'web/dzexams-library.js'),'utf8'));
const Z=window.SM_DZLIB,T=Z._t;
(async()=>{
 assert.equal(T.serverBase(),B,'trailing slash removed');
 assert(T.isServer(B+'/exams/x.pdf')&&!T.isServer('https://evil.example.com/exams/x.pdf')&&!T.isServer(B+'.evil.com/x'));
 assert(T.urlOk(B+'/exams/x.pdf')&&!T.urlOk('http://smhk86.github.io/sm-education/x.pdf'));
 // no permission → nothing is requested
 let html=window.dzexamsPanel(G);els.dzLib={innerHTML:html};await T.load();
 assert.equal(calls.length,0,'no request before permission');
 assert.equal(await Z.syncServer(true),false);assert.equal(calls.length,0);
 // with permission → index is read from our own server, bad records rejected
 Z.grant(true,'test');
 assert.equal(await Z.syncServer(true),true);
 const d=T.docs();assert.equal(d.length,2,'only the 2 valid records');
 assert.equal(d[0].url,B+'/exams/dzexams/e2ac9f73_20512.pdf');assert.equal(d[0].grade,G);assert.equal(d[1].solution,true);
 assert(calls.some(c=>c.startsWith(B+'/data/dzexams-index.json')));
 assert(els.dzLib.innerHTML.includes('SM_DZLIB.syncServer(true)'),'update button shown');
 // second sync adds nothing (no duplicates)
 await Z.syncServer(false);assert.equal(T.docs().length,2);
 // download from our server: no robots.txt request, valid PDF stored
 const before=calls.length;
 const blob=await T.fetchDoc(0);
 assert.equal(blob.size,309);assert(T.have().has(d[0].file));
 assert(!calls.slice(before).some(c=>c.includes('robots.txt')),'own server needs no robots.txt');
 // a server file that is not a document is rejected
 await assert.rejects(()=>T.fetchDoc(1),/HTTP 404/);
 console.log('PASS: dzexams server index sync — own Pages host, index validation, no duplicates, no robots for own server');
})().catch(e=>{console.error(e);process.exit(1)});
