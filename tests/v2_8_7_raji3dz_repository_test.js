// v2.8.7: Raji3DZ curated GitHub index — read-only sync inside the app (no token, no third-party contact, strict path/host rules).
const fs=require('fs'),path=require('path'),assert=require('assert'),root=path.join(__dirname,'..');
const els={};const toasts=[];
global.window=global;global.lang='ar';global.page='tests';
global.toast=m=>toasts.push(m);global.confirm=()=>true;
const ls=new Map();
global.localStorage={getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)};
global.history={pushState(){},back(){}};
global.document={getElementById:id=>els[id]||null,createElement:()=>({style:{},click(){},remove(){}}),body:{style:{},appendChild(){}}};
const BASE='https://hakou44.github.io/sm-edu',G='الثانية متوسط';
global.SM_SCHOOL_CONFIG={publicContentBase:BASE,raji3dzHosts:['raji3dz.com'],raji3dzRepositoryPath:'/repository/raji3dz/'};
const seen=[];let indexBody;
global.fetch=async(u,init)=>{seen.push([u,init]);if(u===BASE+'/data/raji3dz-repository-index.json')return new Response(JSON.stringify(indexBody),{status:200,headers:{'content-type':'application/json'}});return new Response('nope',{status:404})};
eval(fs.readFileSync(path.join(root,'web/raji3dz-library.js'),'utf8'));
const Z=window.SM_RAJI3DZ,T=Z._t;
(async()=>{
 await T.load();
 const ok=BASE+'/repository/raji3dz/'+encodeURIComponent(G)+'/exam-a1b2c3.pdf';
 indexBody={schema:'sm-raji3dz-index-v1',items:[
  {grade:G,subject:'رياضيات',title:'فرض الفصل الأول',ext:'pdf',file:ok,source_url:'https://www.raji3dz.com/f/1.pdf',year:2025,term:1,solution:true,rights_cleared:true},
  {grade:G,subject:'علوم',title:'DzExams path must be refused',ext:'pdf',file:BASE+'/repository/exams/x.pdf'},          // other source's folder
  {grade:G,subject:'علوم',title:'foreign host',ext:'pdf',file:'https://evil.example/repository/raji3dz/x.pdf'},       // not the Pages origin
  {grade:G,subject:'علوم',title:'http',ext:'pdf',file:'http://hakou44.github.io/sm-edu/repository/raji3dz/x.pdf'},     // not https
  {grade:G,subject:'علوم',title:'bad ext',ext:'exe',file:BASE+'/repository/raji3dz/x.exe'},
  {grade:G,title:'',ext:'pdf',file:BASE+'/repository/raji3dz/y.pdf'}]};
 assert.equal(await Z.syncRepositoryIndex(),true);
 let docs=T.docs();assert.equal(docs.length,1,'only the valid, in-path, https entry is imported');
 assert.equal(docs[0].file,ok);assert.equal(docs[0].ext,'pdf');assert.equal(docs[0].solution,true);assert.equal(docs[0].repository,true);assert.equal(docs[0].year,2025);
 // read-only: GET of the public index only — no Authorization header, no third-party site contact
 assert.equal(seen.length,1);assert.equal(seen[0][0],BASE+'/data/raji3dz-repository-index.json');
 assert(!JSON.stringify(seen[0][1]||{}).toLowerCase().includes('authorization'),'no token is ever sent');
 assert(!seen.some(c=>/raji3dz\.com/.test(c[0])),'syncing the index never contacts raji3dz.com');
 // idempotent
 await Z.syncRepositoryIndex();assert.equal(T.docs().length,1);
 // wrong schema (e.g. the DzExams index) is rejected
 indexBody={schema:'sm-dzexams-index-v1',items:[{grade:G,subject:'x',title:'t',ext:'pdf',file:ok}]};
 const before=T.docs().length;assert.equal(await Z.syncRepositoryIndex(),false);assert.equal(T.docs().length,before);
 // repository files are recognised for download only inside the Raji3DZ folder
 assert.equal(T.repoFileOk(ok),true);assert.equal(T.repoFileOk(BASE+'/repository/exams/a.pdf'),false);assert.equal(T.repoFileOk('https://evil.example/repository/raji3dz/a.pdf'),false);
 // shipped files: empty curated index + CSV template + config keys are in place
 const idx=JSON.parse(fs.readFileSync(path.join(root,'web/data/raji3dz-repository-index.json'),'utf8'));
 assert.equal(idx.schema,'sm-raji3dz-index-v1');assert(Array.isArray(idx.items));
 assert(fs.readFileSync(path.join(root,'templates/raji3dz-approved-files.csv'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)[0].startsWith('url,grade,subject,title,year,term,solution'));
 const cfg=fs.readFileSync(path.join(root,'web/config.js'),'utf8');assert(cfg.includes('raji3dzRepositoryPath')&&cfg.includes('raji3dzRepositoryIndex'));
 console.log('PASS: Raji3DZ GitHub index sync — schema, path/host/https rules, read-only, idempotent, shipped templates');
})().catch(e=>{console.error(e);process.exit(1)});
