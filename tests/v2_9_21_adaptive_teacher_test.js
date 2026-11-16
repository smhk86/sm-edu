const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../web/smart-teacher.js','utf8');
const bank=[
 {id:'e1',grade:'الأولى متوسط',subject:'الرياضيات',question:'سهل 1',choices:['أ','ب'],answer_index:0,difficulty:'مبتدئ',topic:'الكسور'},
 {id:'e2',grade:'الأولى متوسط',subject:'الرياضيات',question:'سهل 2',choices:['أ','ب'],answer_index:1,difficulty:'سهل',topic:'الكسور'},
 {id:'m1',grade:'الأولى متوسط',subject:'الرياضيات',question:'متوسط 1',choices:['أ','ب'],answer_index:0,difficulty:'متوسط',topic:'المعادلات'},
 {id:'h1',grade:'الأولى متوسط',subject:'الرياضيات',question:'متقدم 1',choices:['أ','ب'],answer_index:1,difficulty:'متقدم',topic:'الهندسة'},
 {id:'wrong-grade',grade:'الثانية متوسط',subject:'الرياضيات',question:'سنة أخرى',choices:['أ','ب'],answer_index:0,difficulty:'مبتدئ'},
 {id:'bad-answer',grade:'الأولى متوسط',subject:'الرياضيات',question:'إجابة غير صالحة',choices:['أ','ب'],answer_index:8,difficulty:'مبتدئ'}
];
const ctx={grade:'الأولى متوسط',level:'middle',lang:'ar',activeLearner:()=>({id:'learner-a',grade:'الأولى متوسط'}),exerciseBankRecords:bank,subjectPractice:{},demoBank:{},Date,Math,Number,String,Array,Object};
vm.createContext(ctx);vm.runInContext(source+';this.pool=smartTeacherPool;this.profile=smartTeacherAdaptiveProfile;this.select=smartTeacherSelectAdaptiveQuestions;',ctx);
const pool=ctx.pool('الرياضيات');assert.deepEqual(Array.from(pool,x=>x.id),['e1','e2','m1','h1']);
const now=new Date('2026-11-11T12:00:00Z');
const base=[{learnerId:'learner-a',subject:'الرياضيات',date:'2026-11-01',correct:2,total:10},{learnerId:'learner-a',subject:'الرياضيات',date:'2026-10-01',correct:10,total:10},{learnerId:'learner-b',subject:'الرياضيات',date:'2026-11-02',correct:0,total:20}];
const errors=[{learnerId:'learner-a',subject:'الرياضيات',topic:'الكسور'},{learnerId:'learner-a',subject:'الرياضيات',topic:'الكسور'},{learnerId:'learner-b',subject:'الرياضيات',topic:'الهندسة'}];
const discovery=ctx.profile('learner-a','الرياضيات',[],errors,now);assert.equal(discovery.level,'discovery');assert.equal(discovery.accuracy,null);
const support=ctx.profile('learner-a','الرياضيات',base,errors,now);assert.equal(support.total,10);assert.equal(support.correct,2);assert.equal(support.accuracy,20);assert.equal(support.level,'support');assert.equal(support.weakTopics[0].topic,'الكسور');
const selected=ctx.select(pool,support,3);assert.equal(selected.length,3);assert.equal(selected[0].id,'e1');assert.equal(selected[1].id,'e2');assert(selected.every(x=>x.id!=='wrong-grade'));
const challenge=ctx.profile('learner-a','الرياضيات',[{learnerId:'learner-a',subject:'الرياضيات',date:'2026-11-02',correct:9,total:10}],[],now);assert.equal(challenge.level,'challenge');assert.equal(ctx.select(pool,challenge,2)[0].id,'h1');
const dedup=ctx.select([pool[0],pool[0],pool[1]],support,5);assert.equal(dedup.length,2);
// End-to-end local session check: the teacher uses the curated bank and refreshes memory after grading.
let snapshotCalls=0,progressRows=[],mount={innerHTML:'',scrollIntoView(){}};
const local={getItem:()=>null,setItem:()=>{}};
const integration={grade:'الأولى متوسط',level:'middle',lang:'ar',exerciseBankRecords:bank,subjectPractice:{},demoBank:{},
 activeLearner:()=>({id:'kid',name:'تلميذ',grade:'الأولى متوسط'}),getProgress:()=>progressRows,saveProgress:x=>{progressRows=x},
 learningMemorySnapshot:id=>{assert.equal(id,'kid');snapshotCalls++},localStorage:local,Date,Math,Number,String,Array,Object,
 smartTeacherText:(a)=>a,escapeReviewText:x=>String(x),toast:()=>{},starterLessons:[],
 document:{getElementById:id=>id==='smartTeacherSubject'?{value:'الرياضيات'}:id==='smartTeacherMount'?mount:id==='smartTeacherResult'?{innerHTML:''}:id.startsWith('smartTeacherFeedback')?{textContent:''}:id.startsWith('smartTeacherReasoning')?{value:''}:null,
 querySelector:()=>({value:'0'}),querySelectorAll:()=>[]}};
vm.createContext(integration);vm.runInContext(source+';this.start=startSmartTeacherSession;this.submit=submitSmartTeacherSession;',integration);
integration.start();assert.equal(vm.runInContext('smartTeacherSession.difficulty',integration),'discovery');assert(mount.innerHTML.includes('أسئلة استكشافية'));
integration.submit();assert.equal(snapshotCalls,1);assert.equal(progressRows.length,1);assert.equal(progressRows[0].mode,'smart-teacher');
console.log('PASS: exact-grade curated bank, learner privacy, 30-day evidence threshold, adaptive difficulty, recurring-topic priority, duplicate prevention and automatic memory snapshot integration');
