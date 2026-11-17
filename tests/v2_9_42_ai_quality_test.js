'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const context={console,document:{getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},confirm:()=>true,fetch:async()=>({ok:false,json:async()=>({})}),toast(){},open(){return null},setTimeout(){},clearTimeout(){},Math,Date,Response};
context.window=context;context.globalThis=context;context.exerciseBankRecords=[];context.addEventListener=()=>{};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'web/smart-generator.js'),'utf8'),context);
const parse=context.SM_GEN2.parseAI;
const base={exercises:[{title:'تمرين',questions:[
 {question:'احسب 2 + 3',answer:'5',steps:['نجمع العددين','الناتج 5']},
 {question:'احسب 4 + 1',answer:'5',steps:['نجمع العددين','الناتج 5']}
]}]};
assert(parse(JSON.stringify(base),{points:10},2),'valid two-step questions should pass');
const tooLong=JSON.parse(JSON.stringify(base));tooLong.exercises[0].questions[0].answer='x'.repeat(3001);
assert.strictEqual(parse(JSON.stringify(tooLong),{points:10},2),null,'oversized model answer must be rejected');
const badChoices=JSON.parse(JSON.stringify(base));badChoices.exercises[0].questions[0].choices=['أ'];
assert.strictEqual(parse(JSON.stringify(badChoices),{points:10},2),null,'single-choice MCQ must be rejected');
const dupChoices=JSON.parse(JSON.stringify(base));dupChoices.exercises[0].questions[0].choices=['أ','أ'];
assert.strictEqual(parse(JSON.stringify(dupChoices),{points:10},2),null,'duplicate choices must be rejected');
const tooManySteps=JSON.parse(JSON.stringify(base));tooManySteps.exercises[0].questions[0].steps=Array(9).fill('خطوة');
assert.strictEqual(parse(JSON.stringify(tooManySteps),{points:10},2),null,'unbounded solution steps must be rejected');

vm.runInContext(fs.readFileSync(path.join(root,'web/smart-teacher-core.js'),'utf8'),context);
const audit=context.SM_TEACHER_CORE.auditCitations;
const good=audit('المعلومة [KB-1]','[KB-1 | الثالثة متوسط — الرياضيات — المعادلات | سجل 123]');
assert.strictEqual(good.valid,true,'citation to a retrieved source should pass');
const bad=audit('المعلومة [KB-4]','[KB-1 | الثالثة متوسط — الرياضيات — المعادلات | سجل 123]');
assert.strictEqual(bad.valid,false,'citation absent from retrieved evidence must be flagged');
assert.deepStrictEqual(Array.from(bad.unknown),['KB-4']);
const noCitation=audit('شرح عام دون إحالة','');
assert.strictEqual(noCitation.status,'no_citations');
console.log('v2.9.50 Smart Teacher citation audit + Smart Generator quality gates: PASS');
