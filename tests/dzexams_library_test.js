// In-app dzexams.com library: permission gate, host + robots.txt rules, page scan, polite download, viewer, no Tasnim leftovers.
const fs=require('fs'),path=require('path'),assert=require('assert'),root=path.join(__dirname,'..');
const els={};let pushed=0,backs=0,toasts=[];
global.window=global;global.lang='ar';global.page='tests';
global.toast=m=>toasts.push(m);global.confirm=()=>true;
global.setTimeout=(f)=>{f();return 0};            // the app pauses between requests; do not wait in tests
const ls=new Map();
global.localStorage={getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)};
global.history={pushState(){pushed++},back(){backs++}};
global.document={getElementById:id=>els[id]||null,
 createElement:()=>({style:{},click(){},remove(){delete els[this.id]},set href(v){this._h=v},get href(){return this._h}}),
 body:{style:{},appendChild(el){if(el.id)els[el.id]=el}}};
global.DOMParser=class{parseFromString(html){
 const as=[...html.matchAll(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({getAttribute:k=>k==='href'?m[1]:null,textContent:m[2].replace(/<[^>]+>/g,'')}));
 const h1=(html.match(/<h1>([\s\S]*?)<\/h1>/)||[])[1];
 return {querySelectorAll:()=>as,querySelector:s=>s==='h1'&&h1?{textContent:h1}:null};
}};
const G='الثانية متوسط',PDF=n=>Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(n,65)]);
const H='https://www.dzexams.com';
const calls=[];let robotsDown=false,refusals=false;
const page=b=>new Response(b,{status:200,headers:{'content-type':'text/html'}});
const site={
 [H+'/robots.txt']:()=>{if(robotsDown)throw new TypeError('blocked by CORS');return new Response('User-agent: *\nDisallow: /private\n',{status:200})},
 [H+'/ar/2am/maths']:()=>page('<h1>امتحانات الرياضيات السنة الثانية متوسط</h1>'+
  '<a href="/files/2am-math-t1-2024.pdf">اختبار الفصل الأول 2024</a>'+
  '<a href="/files/2am-math-t1-2024-corrige.pdf">تحميل الحل</a>'+
  '<a href="'+H+'/files/devoir.docx">فرض الفصل الثاني</a>'+
  '<a href="https://cdn.other-site.com/x.pdf">ملف خارجي</a>'+
  '<a href="/login">دخول</a><a href="/ar/2am/bac-2025">صفحة أخرى</a>'),
 [H+'/ar/2am/bac-2025']:()=>page('<a href="/files/bac.pdf">موضوع البكالوريا</a><a href="/private/x">خاص</a>'),
 [H+'/private/list']:()=>page('<a href="/files/secret.pdf">سري</a>'),
 [H+'/files/2am-math-t1-2024.pdf']:()=>new Response(PDF(300),{status:200,headers:{'content-length':'309'}}),
 [H+'/files/2am-math-t1-2024-corrige.pdf']:()=>new Response('<html>login required</html>',{status:200}),
 [H+'/files/devoir.docx']:()=>new Response(Buffer.from('PK\x03\x04word'),{status:200})
};
global.fetch=async(u)=>{calls.push(u);if(refusals&&u!==H+'/robots.txt')return new Response('slow down',{status:429});const f=site[u];return f?f():new Response('nope',{status:404})};
eval(fs.readFileSync(path.join(root,'web/dzexams-library.js'),'utf8'));
const Z=window.SM_DZLIB,T=Z._t;
(async()=>{
 // 1) no permission: card asks for confirmation, nothing touches the network
 let html=window.dzexamsPanel(G);
 assert(html.includes('id="dzLib"')&&html.includes('جارٍ التحميل'));
 els.dzLib={innerHTML:html};await T.load();html=els.dzLib.innerHTML;
 assert(html.includes('id="dzAck"')&&!html.includes('id="dzUrl"'),'permission card, no scan form yet');
 assert.equal(await Z.scan(H+'/ar/2am/maths'),false);assert.equal(calls.length,0,'no request before permission');
 assert.equal(Z.grant(false),false);assert.equal(T.perm(),null);
 assert.equal(Z.grant(true,'بريد 2026-11-01'),true);assert.equal(T.perm().note,'بريد 2026-11-01');
 assert(els.dzLib.innerHTML.includes('id="dzUrl"'),'scan form after permission');
 assert(els.dzLib.innerHTML.includes('DZExams')&&els.dzLib.innerHTML.includes('GitHub Repository')&&els.dzLib.innerHTML.includes('SM EDUCATION'),'requested three-stage source-to-app flow is visible');

 // 2) only dzexams.com over https
 assert(T.hostOk('dzexams.com')&&T.hostOk('www.dzexams.com')&&!T.hostOk('evil-dzexams.com')&&!T.hostOk('dzexams.com.evil.com'));
 assert(T.urlOk(H+'/a')&&!T.urlOk('http://www.dzexams.com/a')&&!T.urlOk('https://example.com/a'));
 assert.equal(await Z.scan('https://example.com/exams'),false);assert.equal(calls.length,0);

 // 3) robots.txt: disallowed page is not scanned; unreachable robots fails closed
 await Z.scan(H+'/private/list');
 assert(toasts.at(-1).includes('robots.txt')&&T.docs().length===0,'robots disallow respected');
 assert(!calls.includes(H+'/private/list'),'blocked page never requested');
 T.reset();robotsDown=true;calls.length=0;window.dzexamsPanel(G);
 await Z.scan(H+'/ar/2am/maths');
 assert(T.docs().length===0&&!calls.includes(H+'/ar/2am/maths'),'no robots.txt => no scan');
 robotsDown=false;T.reset();window.dzexamsPanel(G);

 // 4) scan one page: direct files only, foreign host skipped, titles and solution flag
 await Z.scan(H+'/ar/2am/maths',false);
 let d=T.docs();
 assert.equal(d.length,3,'pdf + corrigé + docx; external host skipped');
 assert(d.every(x=>T.hostOk(new URL(x.url).hostname)&&x.grade===G));
 assert.equal(d[0].title,'اختبار الفصل الأول 2024');
 assert(d[1].title.includes('امتحانات الرياضيات')&&d[1].solution===true,'generic link text falls back to page title; solution detected');
 assert.equal(d[2].ext,'docx');
 assert(!calls.includes(H+'/ar/2am/bac-2025'),'linked pages untouched without the option');
 const before=T.docs().length;await Z.scan(H+'/ar/2am/maths',false);assert.equal(T.docs().length,before,'rescan adds no duplicates');
 // subjects, last link per grade, subject filter
 assert.equal(d[0].subject,'الرياضيات','subject taken from the page title');
 assert.equal(T.subjectOf('امتحان العلوم الفيزيائية'),'العلوم الفيزيائية');assert.equal(T.subjectOf('Sujet de Physique'),'العلوم الفيزيائية');
 assert.equal(T.subjectOf('اختبار علوم الطبيعة والحياة'),'علوم الطبيعة والحياة');assert.equal(T.subjectOf('composition de français'),'اللغة الفرنسية');assert.equal(T.subjectOf('نص عشوائي'),'');
 assert.equal(T.lastUrls()[G],H+'/ar/2am/maths','last scanned link saved for the grade');
 window.dzexamsPanel('الأولى متوسط');assert.equal(T.S.url,'','another grade starts empty');
 window.dzexamsPanel(G);assert.equal(T.S.url,H+'/ar/2am/maths','link restored when the grade is reopened');
 Z.set('subject','الرياضيات');assert.equal(T.filtered().length,3);Z.set('subject','الفلسفة');assert.equal(T.filtered().length,0);Z.set('subject','');

 // 5) deep scan: linked pages followed, login skipped, robots-blocked subpage skipped
 await Z.scan(H+'/ar/2am/maths',true);
 assert(T.docs().some(x=>x.url===H+'/files/bac.pdf'),'file from linked page added');
 assert(!calls.includes(H+'/login')&&!calls.includes(H+'/private/x'));
 assert(JSON.parse(localStorage.getItem('smDzexamsIndexV1')).documents.length===4,'list persisted');

 // 6) download: valid files stored, login-page-as-pdf and 404 rejected, nothing half-saved
 await Z.downloadAll();
 assert.equal(T.have().size,2,'pdf + docx stored');
 assert(!T.have().has(H+'/files/2am-math-t1-2024-corrige.pdf')&&!T.have().has(H+'/files/bac.pdf'));
 assert(toasts.at(-1).includes('حُمّل 2 من 4'));

 // 7) viewer + back button
 const iPdf=T.docs().findIndex(x=>x.url===H+'/files/2am-math-t1-2024.pdf');
 await Z.open(iPdf);assert(els.dzViewer&&pushed===1);
 Z.close();assert(!els.dzViewer&&backs===1);

 // 8) repeated refusals stop the batch
 T.reset();window.dzexamsPanel(G);refusals=true;
 await Z.scan(H+'/ar/2am/maths',false);
 assert(T.docs().length===0&&toasts.at(-1).includes('403'));
 refusals=false;

 // 9) revoke: permission removed, downloads refuse
 await Z.scan(H+'/ar/2am/maths',false);
 Z.revoke();assert.equal(T.perm(),null);
 await assert.rejects(()=>T.fetchDoc(0),/no-permission/);
 assert(els.dzLib.innerHTML.includes('id="dzAck"'),'asks for confirmation again');

 // 10) wiring + nothing of the old Tasnim source left in the app
 const index=fs.readFileSync(path.join(root,'web/index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'web/sw.js'),'utf8');
 assert(index.includes('src="dzexams-library.js"')&&sw.includes('./dzexams-library.js'));
 for(const p of ['capacitor.config.json','android-wrapper/capacitor.config.json'])assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root,p),'utf8')).plugins.CapacitorHttp.enabled,true,p);
 const cfg=fs.readFileSync(path.join(root,'web/config.js'),'utf8');assert(cfg.includes("dzexamsHosts: ['dzexams.com', 'dzexams.pro']"));
 global.SM_SCHOOL_CONFIG={dzexamsHosts:['dzexams.com'],publicContentBase:'https://hakou44.github.io/sm-edu',examRepositoryPath:'/repository/exams/'};
 assert(T.repoFileOk('https://hakou44.github.io/sm-edu/repository/exams/2am/math.pdf'),'curated GitHub file URL accepted');
 assert(!T.repoFileOk('https://evil.example/sm-edu/repository/exams/math.pdf'),'foreign repository host rejected');
 assert(!T.repoFileOk('https://hakou44.github.io/other/repository/exams/math.pdf'),'file outside configured repository path rejected');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'web/data/dzexams-repository-index.json'),'utf8'));
 assert.equal(manifest.schema,'sm-dzexams-index-v1');assert(Array.isArray(manifest.items));
 const smart=fs.readFileSync(path.join(root,'web/smart-teacher.js'),'utf8');
 assert(smart.includes('generateSmartMockExam')&&smart.includes('reviewSmartTeacherPdf')&&smart.includes('pdfjsLib.getDocument'),'smart teacher supports mock exams and PDF correction');
 assert(fs.readFileSync(path.join(root,'DZEXAMS_GITHUB_PIPELINE_AR.md'),'utf8').includes('DZExams ← GitHub Repository ← SM EDUCATION'));
 assert(fs.existsSync(path.join(root,'tools/sync_dzexams_repository.py')),'repository importer script exists');
 const bad=[];
 (function walk(dir){for(const n of fs.readdirSync(dir)){const p=path.join(dir,n),s=fs.statSync(p);
  if(s.isDirectory()){if(n!=='vendor')walk(p);continue}
  if(!/\.(js|html|css|json|webmanifest)$/.test(n)||s.size>5e6)continue;
  if(/tasnim|t-onec/i.test(fs.readFileSync(p,'utf8')))bad.push(path.relative(root,p))}})(path.join(root,'web'));
 assert.deepStrictEqual(bad,[],'Tasnim references remain in web/: '+bad.join(', '));
 for(const p of ['tools/fetch_tasnim.py','web/tasnim-library.js','web/tasnim-links.js','web/data/tasnim-index.json'])assert(!fs.existsSync(path.join(root,p)),p+' should be gone');
 console.log('PASS: dzexams library — permission gate, host/robots rules, scan, download, viewer, no Tasnim leftovers');
})().catch(e=>{console.error(e);process.exit(1)});
