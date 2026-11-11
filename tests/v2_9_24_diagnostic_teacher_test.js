const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../web/smart-teacher.js','utf8');
const bank=[
 {id:'frac-1',grade:'الأولى متوسط',subject:'الرياضيات',question:'ما نصف 8؟',choices:['2','4','6'],answer_index:1,topic:'الكسور',explanation:'النصف هو القسمة على 2.',hint:'اقسم العدد إلى جزأين متساويين.',difficulty:'سهل'},
 {id:'frac-2',grade:'الأولى متوسط',subject:'الرياضيات',question:'ما ربع 12؟',choices:['2','3','4'],answer_index:1,topic:'الكسور',explanation:'12 ÷ 4 = 3.',difficulty:'متوسط'},
 {id:'eq-1',grade:'الأولى متوسط',subject:'الرياضيات',question:'حل x+2=5',choices:['2','3','7'],answer_index:1,topic:'المعادلات',explanation:'نطرح 2 من الطرفين.',difficulty:'سهل'}
];
let chosen='0';const mount={innerHTML:'',scrollIntoView(){}},result={innerHTML:''};const store={};let progress=[];
const ctx={grade:'الأولى متوسط',level:'middle',lang:'ar',exerciseBankRecords:bank,subjectPractice:{},demoBank:{},
 activeLearner:()=>({id:'learner-24',name:'تلميذ',grade:'الأولى متوسط'}),subjectsForCurrentGrade:()=>['الرياضيات'],getProgress:()=>progress,saveProgress:x=>{progress=x},
 localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)}},starterLessons:[],toast:()=>{},Date,Math,Number,String,Array,Object,
 escapeReviewText:x=>String(x??'').replace(/[&<>"']/g,''),
 document:{getElementById:id=>id==='smartTeacherSubject'?{value:'الرياضيات'}:id==='smartTeacherMount'?mount:id==='smartTeacherResult'?result:null,querySelector:()=>({value:chosen})}};
vm.createContext(ctx);vm.runInContext(source+';this.start=startSmartTeacherSession;this.submit=submitSmartTeacherSession;this.remedial=smartTeacherStartRemedialTopic;this.diagnose=smartTeacherBuildSessionDiagnosis;',ctx);
ctx.start();assert.equal(vm.runInContext('smartTeacherSession.items.length',ctx),3);
chosen='0';ctx.submit();
assert(result.innerHTML.includes('خريطة الفهم وخطة العلاج'));
assert(result.innerHTML.includes('الكسور'));
assert(result.innerHTML.includes('تدرب على هذا المحور'));
const errors=JSON.parse(store.smSchoolLearningErrors);assert.equal(errors.length,1);assert(errors.every(x=>x.learnerId==='learner-24'&&x.topic==='الكسور'));
assert(ctx.remedial('الكسور'));assert.equal(vm.runInContext('smartTeacherSession.items.length',ctx),2);assert.equal(vm.runInContext('smartTeacherSession.difficulty',ctx),'support');
const clean=ctx.diagnose({learnerId:'x',items:[{topic:'الجمع',q:'1+1',choices:['2'],a:0}],answers:{0:{choice:0}}});assert.equal(clean.errors.length,0);assert(clean.html.includes('لم تظهر أخطاء'));
console.log('PASS: topic-level evidence diagnosis, learner-scoped error persistence, conservative wording, and targeted practice from verified bank items');
