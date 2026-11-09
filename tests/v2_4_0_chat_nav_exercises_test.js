const fs=require('fs'),vm=require('vm'),assert=require('assert');
const script=fs.readFileSync('web/ux-v2-4-0.js','utf8');
const index=fs.readFileSync('web/index.html','utf8'),sw=fs.readFileSync('web/sw.js','utf8'),css=fs.readFileSync('web/styles.css','utf8');
// wiring
assert(index.includes('ux-v2-4-0.js')&&sw.includes('./ux-v2-4-0.js'),'wired into index and precache');
assert(index.indexOf('ux-v2-4-0.js')>index.indexOf('ux-v2-3-0.js'),'loaded after the scripts it wraps');
for(const c of ['.v240-chat','.v240-msgs','.v240-compose','.v240-seg','.v240-quick','.v240-mastery','.v240-sbar'])assert(css.includes(c),'css '+c);
assert(index.includes('id="bnMore"')&&!/class="bn-item"[^>]*data-page="tests"/.test(index),'bottom bar: More replaces Tests');
for(const p of ['home','exercises','tutor','progress'])assert(index.includes('class="bn-item'+(p==='home'?' active':'')+'" data-page="'+p+'"'),'bottom bar keeps '+p);
// harness
const store={};const calls=[];
const ctx={window:{
  tutor:()=>'OLD',appendMessage:()=>null,
  exerciseBankHomePage:()=>'<h2>head</h2><h3 class="bank-section-title">Subjects</h3><div class="subject-grid"><div class="subject-card" onclick="renderExerciseBank(\'Math\')"><strong>Math</strong><span class="pill">4 ex</span></div><div class="subject-card" onclick="renderExerciseBank(\'L\\\'Art\')"><strong>Art</strong><span class="pill">2 ex</span></div></div>',
  testBankHomePage:()=>'<h2>tests</h2>'},
 lang:'ar',grade:'G',exerciseBankSubject:'',
 t:k=>({ai:'المساعد',send:'إرسال',aiWelcome:'مرحباً **بك**'}[k]||k),
 activeLearner:()=>({name:'Ali <b>',grade:'G'}),
 readTutorHistory:()=>[{question:'q <script>x</script>',answer:'- one\n- two\n\n**bold** `c`',at:'2026-11-07T10:05:00Z'}],
 subjectsForCurrentGrade:()=>['Math','Art'],
 exerciseBankRecords:[{grade:'G',subject:'Math',id:1},{grade:'G',subject:'Math',id:2},{grade:'G',subject:'Math',id:3},{grade:'G',subject:'Art',id:4},{grade:'G',subject:'Phy',id:5},{grade:'H',subject:'Zed',id:6}],
 progressStats:()=>({items:[{grade:'G',subject:'Math',mode:'exercises',correct:3,total:4},{grade:'G',subject:'Math',mode:'tests',correct:0,total:10},{grade:'H',subject:'Art',mode:'exercises',correct:1,total:1}]}),
 startExerciseSession:m=>calls.push(m),
 localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)}}};
vm.createContext(ctx);vm.runInContext(script,ctx);const W=ctx.window;
// formatting: escape first, then limited markup
const f=W.sm240FormatChat;
assert.equal(f('<img src=x onerror=1>'),'<p>&lt;img src=x onerror=1&gt;</p>');
assert(f('**b** and `c`').includes('<strong>b</strong>')&&f('**b** and `c`').includes('<code>c</code>'));
assert.equal(f('- a\n- b'),'<ul><li>a</li><li>b</li></ul>');
assert.equal(f('1. a\n2) b'),'<ol><li>a</li><li>b</li></ol>');
assert(f('## T').includes('<strong>T</strong>')&&f('a\n\nb').includes('msg-gap'));
assert(!/<script|onerror=1>/i.test(f('<script>alert(1)</script> "x" \'y\' & z')));
assert.equal(f(null),'');
// chat page keeps every id the legacy handlers need, escapes user data and shows history
const html=W.tutor();
for(const id of ['chatForm','chatInput','tutorTask','studentAnswer','messages','tutorSubject'])assert(html.includes('id="'+id+'"'),'id '+id);
assert(html.includes('v240-chat')&&html.includes('type="submit"')&&html.includes('role="log"'));
assert(!html.includes('<script>x')&&html.includes('q &lt;script&gt;')&&html.includes('Ali &lt;b&gt;'));
assert(html.includes('<ul><li>one</li><li>two</li></ul>')&&html.includes('<strong>bold</strong>'));
assert(!html.includes('v240Suggest'),'no suggestion chips once a conversation exists');
assert.equal((html.match(/data-mode="/g)||[]).length,3,'three help modes');
ctx.readTutorHistory=()=>[];assert(W.tutor().includes('v240Suggest'),'empty chat shows suggestions');
// a failing renderer falls back to the old page
ctx.activeLearner=()=>{throw new Error('x')};assert.equal(W.tutor(),'OLD');
// mixed practice: n items, no duplicates, spread across subjects
const rows=ctx.exerciseBankRecords.filter(x=>x.grade==='G');
for(let i=0;i<30;i++){const p=W.sm240MixedPick(rows,3);assert.equal(p.length,3);assert.equal(new Set(p.map(x=>x.id)).size,3);assert.equal(new Set(p.map(x=>x.subject)).size,3,'one per subject first')}
assert.equal(W.sm240MixedPick(rows,50).length,5);assert.equal(W.sm240MixedPick([],10).length,0);
// mastery counts exercise attempts for the grade only
const m=W.sm240Mastery(ctx.progressStats().items,'G');assert.deepStrictEqual(JSON.parse(JSON.stringify(m)),{Math:{correct:3,total:4,pct:75}});
// exercise home: segmented control, quick practice, mastery + review badges (incl. escaped quote names)
store['smSchoolExerciseMistakes:G:Math']=JSON.stringify([1,2]);
let home=W.exerciseBankHomePage();
assert(home.startsWith('<nav class="v240-seg"')&&home.includes('class="on" onclick="go(\'exercises\')"'));
assert(home.includes('sm240QuickPractice()')&&home.indexOf('v240-seg')<home.indexOf('v240-quick')&&home.indexOf('v240-quick')<home.indexOf('<h2>head</h2>'));
assert(home.includes('data-level="hi"')&&home.includes('>75%</span>')&&home.includes('🔁 2'));
assert((home.match(/v240-mastery/g)||[]).length===1,'only subjects with attempts get a mastery badge');
assert.equal((home.match(/class="subject-card"/g)||[]).length,2,'cards intact');
ctx.grade='Z';home=W.exerciseBankHomePage();assert(home.startsWith('<nav class="v240-seg"')&&!home.includes('v240-quick'));ctx.grade='G';
// tests page gets the same switcher with Tests active
const tp=W.testBankHomePage();assert(tp.startsWith('<nav class="v240-seg"')&&tp.includes('class="on" onclick="go(\'tests\')"')&&tp.endsWith('<h2>tests</h2>'));
// quick practice starts a session from the grade's records under a mixed label
W.sm240QuickPractice();
assert.deepStrictEqual(calls,['random']);assert.equal(W.currentPractice.items.length,5);assert(W.currentPractice.items.every(x=>x.id<=5));
assert.equal(ctx.exerciseBankSubject,'تدريب مختلط');assert.equal(W.currentPractice.mode,'exercises');
console.log('PASS: v2.4.0 chat-style tutor, exercise bank mastery/quick practice, exercises/tests switcher and bottom-bar More');
