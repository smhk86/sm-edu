const fs=require('fs'),vm=require('vm'),assert=require('assert');
const script=fs.readFileSync('web/ux-v2-3-0.js','utf8');
assert(fs.readFileSync('web/index.html','utf8').includes('ux-v2-3-0.js')&&fs.readFileSync('web/sw.js','utf8').includes('./ux-v2-3-0.js'),'wired into index and precache');
assert(fs.readFileSync('web/styles.css','utf8').includes('.v230-quick'));
const store={};const opened=[];
const ctx={window:{renderExerciseBank:s=>{opened.push(s);return 'ok'},exerciseBankHomePage:()=>'<h3 class="bank-section-title">Subjects</h3>'},
 exerciseBankRecords:[{grade:'G',subject:'Math'},{grade:'G',subject:'Math'},{grade:'G',subject:'Arabic'},{grade:'H',subject:'Physics'}],
 grade:'G',lang:'ar',localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)}}};
vm.createContext(ctx);vm.runInContext(script,ctx);
const W=ctx.window;
// daily challenge: deterministic per day+grade, always one of the grade's subjects
const subs=['Math','Arabic','Physics'];
assert.equal(W.sm230DailySubject('G',subs,'2026-11-07'),W.sm230DailySubject('G',[...subs].reverse(),'2026-11-07'));
assert(subs.includes(W.sm230DailySubject('G',subs,'2026-11-08')));assert.equal(W.sm230DailySubject('G',[],'x'),'');
const days=new Set();for(let i=1;i<=28;i++)days.add(W.sm230DailySubject('G',subs,'2026-11-'+String(i).padStart(2,'0')));assert(days.size>1,'rotates across days');
// first visit: only the daily card, grade-H subject never offered for grade G
let html=W.exerciseBankHomePage();
assert(html.includes('تحدّي اليوم')&&!html.includes('تابع من حيث توقفت')&&!html.includes('Physics')&&html.indexOf('v230-quick')<html.indexOf('bank-section-title'));
// opening a subject records it for that grade and still calls the original
assert.equal(W.renderExerciseBank('Arabic'),'ok');assert.deepStrictEqual(opened,['Arabic']);
assert.deepStrictEqual(JSON.parse(store.smExerciseLastSubject),{G:'Arabic'});
html=W.exerciseBankHomePage();
assert(html.includes('تابع من حيث توقفت')&&html.includes('data-subject="Arabic"'));
// button handler opens the subject through the wrapped function
W.sm230OpenSubject({dataset:{subject:'Math'}});assert.equal(opened.at(-1),'Math');assert.equal(JSON.parse(store.smExerciseLastSubject).G,'Math');
// a remembered subject that no longer exists is ignored; an empty grade leaves the page untouched
store.smExerciseLastSubject=JSON.stringify({G:'Gone'});assert(!W.exerciseBankHomePage().includes('تابع من حيث توقفت'));
ctx.grade='Z';assert.equal(W.exerciseBankHomePage(),'<h3 class="bank-section-title">Subjects</h3>');
console.log('PASS: v2.4.0 exercise bank resume card and daily challenge');
