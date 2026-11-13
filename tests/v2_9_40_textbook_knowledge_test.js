const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const mem=new Map(),msgs=[],listeners={},els={},reqs=[];
global.window=global;global.lang='ar';global.grade='الرابعة متوسط';global.toast=m=>msgs.push(m);
global.localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};
global.document={getElementById:id=>els[id]||null,addEventListener(){},head:null,readyState:'loading'};
global.addEventListener=(n,f)=>{listeners[n]=f};
global.SM_SCHOOL_CONFIG={textbookHosts:['books.example.test'],publicContentBase:''};
global.Capacitor={isNativePlatform:()=>true};
const PDF=Buffer.from('%PDF-1.4\nTest textbook');
let site={};
global.CapacitorHttp={request:async o=>{reqs.push(o);const r=site[o.url]||{status:404,data:''};return{status:r.status,headers:r.headers||{},data:r.data}}};
global.fetch=async()=>({ok:true,json:async()=>({books:[{id:'math-4am',grade:'الرابعة متوسط',subject:'الرياضيات',title:'كتاب الرياضيات',url:'https://books.example.test/m.pdf'}]})});

const pg=(page,text)=>({page,text});
const long=w=>(w+' ').repeat(60);
let BOOKS=[
 {id:'b-math',title:'كتاب الرياضيات',grade:'الرابعة متوسط',subject:'الرياضيات',chars:5000,pages:3,pageTexts:[
  pg(1,'حل المعادلات من الدرجة الأولى بمجهول واحد: نجمع الحدود المتشابهة ثم نعزل المجهول في طرف واحد. '+long('تمرين تطبيق')),
  pg(2,'مبرهنة طالس في المثلث: إذا وازى مستقيم أحد أضلاع المثلث فإنه يقسم الضلعين الآخرين إلى أجزاء متناسبة. '+long('هندسة مثلث')),
  pg(3,'الأعداد الناطقة والعمليات عليها: الجمع والطرح والضرب والقسمة مع اختزال الكسور. '+long('عدد كسر'))]},
 {id:'b-sci',title:'كتاب العلوم الفيزيائية',grade:'الرابعة متوسط',subject:'العلوم الفيزيائية والتكنولوجيا',chars:3000,pages:2,pageTexts:[
  pg(1,'الدارة الكهربائية البسيطة تتكون من مولد وناقل ومصباح وقاطعة. '+long('كهرباء تيار')),
  pg(2,'شدة التيار الكهربائي تقاس بجهاز الأمبيرمتر وتوصل على التسلسل في الدارة. '+long('أمبير دارة'))]},
 {id:'b-other',title:'كتاب السنة الأولى',grade:'الأولى متوسط',subject:'الرياضيات',chars:900,pages:1,pageTexts:[
  pg(1,'حل المعادلات من الدرجة الأولى هذا نص من مستوى آخر يجب ألا يظهر. '+long('معادلة'))]},
 {id:'b-old',title:'كتاب قديم بلا صفحات',grade:'الرابعة متوسط',subject:'اللغة العربية',chars:400,pages:2,
  text:'صفحة 1: '+'الفاعل اسم مرفوع يدل على من قام بالفعل ويأتي بعد الفعل مباشرة. '+long('نحو')+'\nصفحة 2: '+'المفعول به اسم منصوب يقع عليه فعل الفاعل. '+long('إعراب')}
];
global.SM_TEACHER_BOOKS={panelHtml:()=>'<p>base</p>',remove:async()=>{},importBlob:async()=>({id:'x'}),listSaved:async()=>BOOKS};
eval(fs.readFileSync(path.join(root,'web/textbook-downloader.js'),'utf8'));
eval(fs.readFileSync(path.join(root,'web/textbook-knowledge.js'),'utf8'));
const K=SM_TEXTBOOK_KB,T=K._t,D=SM_TEXTBOOK_DL;

(async()=>{
 /* tokenizer */
 assert.deepStrictEqual(T.tokens('المعادلات'),T.tokens('معادلة'),'plural / singular / definite article match');
 assert(!T.tokens('كيف أحل معادلة من الدرجة').includes('من'),'stop words dropped');
 assert.deepStrictEqual(T.tokens('الرِّيَاضِيَّات'),T.tokens('الرياضيات'),'diacritics ignored');
 assert.deepStrictEqual(T.tokens('٣٤'),['34'],'Arabic-Indic digits normalised');

 /* retrieval, grade isolation, page citations */
 let hits=await K.search('كيف أحل معادلة من الدرجة الأولى؟');
 assert(hits.length&&hits[0].bookId==='b-math'&&hits[0].page===1,'best page is the equations page');
 assert(hits.every(h=>h.grade==='الرابعة متوسط'),'other grades never returned');
 assert(hits[0].snippet.includes('المجهول'),'snippet comes from the matched page');
 hits=await K.search('الدارة الكهربائية التيار');
 assert(hits[0].bookId==='b-sci','science query finds the science book');
 hits=await K.search('الفاعل المرفوع');
 assert(hits[0].bookId==='b-old'&&hits[0].page===1,'legacy rows (text only) are split into pages');
 assert.deepStrictEqual(await K.search('xyzqq كلمة غير موجودة أبدا'),[],'no match -> no hits');
 assert.deepStrictEqual(await K.search('من في على'),[],'only stop words -> nothing');
 assert((await K.search('معادلة',{grade:'الأولى متوسط'})).every(h=>h.bookId==='b-other'),'explicit grade filter works');

 /* consent gate + bounded context */
 assert.strictEqual(await K.context('معادلة الدرجة الأولى'),'','disabled by default: nothing is prepared for the AI');
 K.setAuto(true);
 assert.strictEqual(mem.get('smTextbookKbAuto'),'1','choice is remembered');
 const ctx=await K.context('كيف أحل معادلة من الدرجة الأولى',{subject:'الرياضيات'});
 assert(ctx.includes('«كتاب الرياضيات»')&&ctx.includes('صفحة 1'),'context carries title and page');
 assert(!ctx.includes('مستوى آخر'),'context never leaks other grades');
 assert(ctx.length<9800,'context is capped');
 const srcLine=K.lastSourcesLine();
 assert.strictEqual(await K.context(''),'','no query -> no text (the old full-book dump is gone)');
 assert.strictEqual(await K.context('من في على'),'','stop-words-only query sends nothing');
 assert(srcLine.includes('كتاب الرياضيات')&&srcLine.includes('1'),'sources line for the chat');
 assert.strictEqual(K.lastSourcesLine(),'','sources line is reset when nothing was sent');
 assert.strictEqual(SM_TEACHER_BOOKS.context,K.context,'Smart Teacher book context now uses the knowledge base');
 K.setAuto(false);
 assert.strictEqual(await K.context('معادلة الدرجة الأولى'),'','turning it off stops everything');

 /* a page-limited context for very long matches */
 BOOKS=BOOKS.concat([{id:'b-big',title:'مرجع طويل',grade:'الرابعة متوسط',subject:'الرياضيات',chars:1,pages:40,pageTexts:Array.from({length:40},(_,i)=>pg(i+1,'مبرهنة فيثاغور في المثلث القائم uniq'+i+' '+long('فيثاغور مثلث قائم وتر ضلع')))}]);
 listeners['sm-books-changed']();await new Promise(r=>setTimeout(r,20));
 K.setAuto(true);
 const big=await K.context('مبرهنة فيثاغور المثلث القائم');
 assert(big.length<9800&&big.includes('مرجع طويل'),'new book is indexed after the change event, context stays under the cap');
 K.setAuto(false);

 /* indexing boundaries, book scoping, and self-test on short but valid pages */
 const shortBook={id:'b-short',title:'ملخص قصير',grade:'الرابعة متوسط',subject:'الرياضيات',chars:75,pageTexts:[pg(7,'قاعدة التناسب في المثلث تساعد على حساب الأطوال المجهولة بسهولة.')]};
 const emptyBook={id:'b-empty',title:'كتاب فارغ',grade:'الرابعة متوسط',subject:'عام',chars:0,pageTexts:[pg(1,'نص قصير')]};
 BOOKS=BOOKS.concat([shortBook,emptyBook]);
 listeners['sm-books-changed']();await new Promise(r=>setTimeout(r,20));
 hits=await K.search('قاعدة التناسب المثلث');
 assert(hits.some(h=>h.bookId==='b-short'&&h.page===7),'valid short pages are indexed and searchable');
 assert(!hits.some(h=>h.bookId==='b-empty'),'pages shorter than the indexing minimum are ignored');
 assert((await K.search('قاعدة التناسب',{bookId:'b-short'})).every(h=>h.bookId==='b-short'),'bookId filter never leaks another book');
 const gradeHits=await K.search('معادلة الدرجة الأولى',{grade:'الأولى متوسط'});
 assert(gradeHits.length>0&&gradeHits.every(h=>h.bookId==='b-other'),'explicit grade filter returns only the matching grade');
 const st2=await K.stats();
 assert(st2.books===BOOKS.length&&st2.pages===49,'stats count books and indexable pages, including legacy text split into pages');
 /* self-test must test the same minimum-length pages that the index actually accepts */
 const rep=await K.selfTest();
 assert(rep.length===BOOKS.length&&rep.filter(r=>r.id!=='b-empty').every(r=>r.ok),'self-test finds a page of every book with indexable text, including short pages: '+JSON.stringify(rep.filter(r=>!r.ok)));
 assert(rep.find(r=>r.id==='b-empty')?.reason==='no-text','self-test clearly reports a book with no searchable text');

 /* offline answers + prompt builders (wrapped once all scripts have loaded) */
 global.offlineTutorReply=async()=>null;
 global.smTeacherBuildReviewContext=p=>'BASE';
 listeners.load();
 let off=await global.offlineTutorReply('ما هي مبرهنة طالس؟','الرياضيات','lesson');
 assert(off.includes('كتاب الرياضيات')&&off.includes('ص 2'),'offline answer cites the book page');
 global.offlineTutorReply=async()=>'من بنك التمارين';
 K._t.wrapGlobals();
 off=await global.offlineTutorReply('ما هي مبرهنة طالس؟','الرياضيات','lesson');
 assert(off.startsWith('من بنك التمارين')&&off.includes('📚'),'book block is appended to the local bank answer');
 assert.strictEqual(global.smTeacherBuildReviewContext({grade,subject:'الرياضيات',query:'مبرهنة طالس'}),'BASE','AI prompt untouched while the toggle is off');
 K.setAuto(true);
 assert(global.smTeacherBuildReviewContext({grade,subject:'الرياضيات',query:'مبرهنة طالس'}).includes('كتاب الرياضيات'),'AI prompt gets book pages when the toggle is on');
 K.setAuto(false);

 /* readiness + connectivity probe (simulated network) */
 let st=await D.status();
 assert(st.catalogue===1&&st.hostsOk===1&&st.native&&!st.permission,'status reflects catalogue, host list, permission, native HTTP');
 let rd=await K.readiness();
 assert(rd.some(x=>x.ok===false&&x.t.includes('لم تؤكد')),'readiness flags the missing confirmation');
 let r=await D.probe('math-4am');
 assert(!r.ok&&reqs.length===0,'probe sends no request before the confirmation');
 D.grant(true);
 site['https://books.example.test/m.pdf']={status:206,headers:{'content-range':'bytes 0-1023/2097152'},data:PDF.toString('base64')};
 r=await D.probe('math-4am');
 assert(r.ok&&r.status===206&&r.size===2097152,'probe ok: PDF signature, partial content, size read from Content-Range');
 assert(reqs[0].headers.Range==='bytes=0-1023','probe asks for the first KB only');
 site['https://books.example.test/m.pdf']={status:200,headers:{},data:Buffer.from('<html>login</html>').toString('base64')};
 r=await D.probe('math-4am');assert(!r.ok&&r.message.includes('PDF'),'HTML page instead of a PDF is rejected');
 site['https://books.example.test/m.pdf']={status:429,headers:{},data:''};
 r=await D.probe('math-4am');assert(!r.ok&&r.message.includes('403/429'),'429 stops the probe');
 site['https://books.example.test/m.pdf']={status:200,headers:{'content-length':String(90*1048576)},data:PDF.toString('base64')};
 r=await D.probe('math-4am');assert(!r.ok&&r.message.includes('80'),'books over 80 MB are refused');
 rd=await K.readiness();
 assert(rd.some(x=>x.ok===true&&x.t.includes('أكدتَ')),'readiness shows the confirmation once given');
 /* wiring in the app shell */
 const R=f=>fs.readFileSync(path.join(root,f),'utf8');
 const idxHtml=R('web/index.html');
 assert(idxHtml.indexOf('textbook-downloader.js')>-1&&idxHtml.indexOf('textbook-knowledge.js')>idxHtml.indexOf('textbook-downloader.js'),'knowledge base script is loaded after the downloader');
 assert(R('web/sw.js').includes("'./textbook-knowledge.js'"),'knowledge base is cached for offline use');
 assert(R('web/app.js').includes('SM_TEXTBOOK_KB')&&R('web/app.js').includes('SM_TEACHER_BOOKS.context(msg,'),'chat uses the knowledge base with the question as query');
 assert(R('web/smart-teacher.js').includes("SM_TEACHER_BOOKS.context((question||'')"),'document review searches the books with the exercise text');
 assert(R('web/smart-teacher-books.js').includes('sm-books-changed'),'saving or deleting a book refreshes the knowledge base');
 assert(R('web/gemini-direct.js').includes('Cite page numbers only as shown'),'AI prompt allows citing the supplied page numbers only');
 console.log('v2.9.40 textbook knowledge base tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
