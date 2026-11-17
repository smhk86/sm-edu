'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const context={console,document:{getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},confirm:()=>true,fetch:async()=>({ok:false,json:async()=>({})}),toast(){},open(){return null},setTimeout(){},clearTimeout(){},Math,Date};
context.window=context;context.globalThis=context;
context.exerciseBankRecords=[];
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'web/smart-generator.js'),'utf8'),context);
const parse=context.SM_GEN2.parseAI;
const good={exercises:[{title:'التمرين الأول',questions:[
 {question:'احسب 2 + 3',answer:'5',steps:['نجمع العددين','2 + 3 = 5']},
 {question:'احسب 4 + 1',answer:'5',steps:['نحدد العددين','4 + 1 = 5']}
]}]};
assert(parse(JSON.stringify(good),{points:10},2),'valid exact-count draft should pass');
assert.strictEqual(parse(JSON.stringify(good),{points:10},3),null,'wrong question count must be rejected');
const missing=JSON.parse(JSON.stringify(good));missing.exercises[0].questions[0].steps=[];
assert.strictEqual(parse(JSON.stringify(missing),{points:10},2),null,'question without worked steps must be rejected');
const oneStep=JSON.parse(JSON.stringify(good));oneStep.exercises[0].questions[0].steps=['خطوة واحدة'];
assert.strictEqual(parse(JSON.stringify(oneStep),{points:10},2),null,'single-step AI answers must be rejected');
const noAnswer=JSON.parse(JSON.stringify(good));noAnswer.exercises[0].questions[0].answer='';
assert.strictEqual(parse(JSON.stringify(noAnswer),{points:10},2),null,'question without model answer must be rejected');
const duplicate=JSON.parse(JSON.stringify(good));duplicate.exercises[0].questions[1].question='احسب 2 + 3';
assert.strictEqual(parse(JSON.stringify(duplicate),{points:10},2),null,'duplicate questions must be rejected');
const flattened=parse(JSON.stringify(good),{points:10},2).flatMap(x=>x.qs);
assert.strictEqual(flattened.reduce((n,q)=>n+q.points,0),10,'allocated marks must sum exactly to the requested total');
const core=fs.readFileSync(path.join(root,'web/smart-teacher-core.js'),'utf8');
const gemini=fs.readFileSync(path.join(root,'web/gemini-direct.js'),'utf8');
assert(core.includes('grade:requestGrade,subject:payload.subject'),'Smart Teacher request grade must scope first-pass retrieval');
assert(core.includes('[KB-${index+1}'),'retrieved evidence must have stable source labels');
assert(gemini.includes('CITATION RULES')&&gemini.includes('Do not invent source IDs'),'teacher prompt must prohibit fabricated citations');
console.log('v2.9.50 Smart Teacher + Smart Generator quality gates: PASS');
