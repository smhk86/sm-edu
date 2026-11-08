// v2.9.1: files synced to the GitHub repository open without the raji3dz owner-permission gate; term filter works; manual scan stays gated.
const fs=require('fs'),path=require('path'),assert=require('assert'),root=path.join(__dirname,'..');
global.window=global;global.lang='ar';global.page='tests';global.toast=()=>{};global.confirm=()=>true;
const ls=new Map();
global.localStorage={getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)};
global.history={pushState(){},back(){}};
global.document={getElementById:()=>null,createElement:()=>({style:{},click(){},remove(){}}),body:{style:{},appendChild(){}}};
const BASE='https://smhk86.github.io/sm-edu',G='الثانية متوسط';
global.SM_SCHOOL_CONFIG={publicContentBase:BASE,raji3dzHosts:['raji3dz.com'],raji3dzRepositoryPath:'/repository/raji3dz/'};
const f1=BASE+'/repository/raji3dz/'+encodeURIComponent(G)+'/a.pdf',f2=BASE+'/repository/raji3dz/'+encodeURIComponent(G)+'/b.pdf';
const calls=[];
global.fetch=async u=>{calls.push(u);
 if(u===BASE+'/data/raji3dz-repository-index.json')return new Response(JSON.stringify({schema:'sm-raji3dz-index-v1',items:[
  {grade:G,subject:'الرياضيات',title:'فرض الفصل الأول',ext:'pdf',file:f1,term:1,solution:true},
  {grade:G,subject:'الرياضيات',title:'اختبار الفصل الثاني',ext:'pdf',file:f2,term:2}]}),{status:200,headers:{'content-type':'application/json'}});
 if(u===f1)return new Response(Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(200,65)]),{status:200});
 return new Response('nope',{status:404})};
eval(fs.readFileSync(path.join(root,'web/raji3dz-library.js'),'utf8'));
const Z=window.SM_RAJI3DZ,T=Z._t;
(async()=>{
 await T.load();assert.equal(await Z.syncRepositoryIndex(true),true);
 assert.equal(T.perm(),null,'no permission granted');
 let html=window.raji3dzPanel(G);
 assert(html.includes('rjAck')===true&&html.includes('<details'),'permission box only inside the collapsed advanced section');
 assert(/الفصل الأول/.test(html)&&/الفصل الثالث/.test(html),'term selector shown');
 assert.equal(T.filtered().length,2);
 Z.set('term','2');assert.equal(T.filtered().length,1);assert.equal(T.filtered()[0].d.file,f2);
 Z.set('term','');
 // repository file downloads with no permission and without a robots.txt request
 const i=T.docs().findIndex(d=>d.file===f1);
 const blob=await T.fetchDoc(i);assert(blob.size>0);
 assert(!calls.some(u=>/robots\.txt/.test(u)),'no robots check for own repository files');
 // a non-repository (raji3dz.com) file still needs permission
 T.docs().push({file:'https://www.raji3dz.com/x.pdf',url:'https://www.raji3dz.com/x.pdf',title:'x',grade:G,ext:'pdf'});
 await assert.rejects(()=>T.fetchDoc(T.docs().length-1),/no-permission/);
 console.log('ok');
})().catch(e=>{console.error(e);process.exit(1)});
