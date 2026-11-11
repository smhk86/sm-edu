const fs=require('fs'),vm=require('vm'),assert=require('assert');
const learners=[{id:'a',name:'Learner A',grade:'4AP'},{id:'b',name:'Learner B',grade:'2AM'}];
const progress=[
 {date:'2026-10-05',learnerId:'a',subject:'Math',correct:3,total:10,mode:'exercise'},
 {date:'2026-10-12',learnerId:'a',subject:'Math',correct:4,total:10,mode:'exercise'},
 {date:'2026-11-02',learnerId:'a',subject:'Math',correct:8,total:10,mode:'test'},
 {date:'2026-11-03',learnerId:'a',subject:'Arabic',correct:8,total:10,mode:'exercise'},
 {date:'2026-11-01',learnerId:'b',subject:'Science',correct:9,total:10,mode:'test'}
];
const ctx={Date,Math,Number,String,Array,Object,JSON,Map,Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},document:{createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},getProgress:()=>progress,getLearners:()=>learners,activeLearner:()=>learners[0],escapeReviewText:x=>String(x).replace(/[&<>"']/g,''),lang:'en'};
vm.createContext(ctx);for(const f of ['student-profile.js','family-dashboard.js','v2-9-26.js'])vm.runInContext(fs.readFileSync(__dirname+'/../web/'+f,'utf8'),ctx);
const m=ctx.familyDashboardComparison(learners[0],progress,new Date('2026-11-10T12:00:00'));
assert.equal(m.current.accuracy,67);assert.equal(m.previous.accuracy,30);assert.equal(m.delta,37);assert.equal(m.focus.subject,'Math');assert(m.recommendation.includes('Math'));
const insufficient=ctx.familyDashboardComparison(learners[1],progress,new Date('2026-11-10T12:00:00'));
assert.equal(insufficient.delta,null,'comparison must be withheld when previous period has no evidence');
const html=ctx.familyDashboardPanel();for(const token of ['Monthly comparison & guidance','Learner A','Learner B','Previous 30 days','Recommendation:'])assert(html.includes(token),`missing ${token}`);
let clicked=false;ctx.document.createElement=()=>({click(){clicked=true},remove(){}});ctx.downloadFamilyDashboardReport();assert(clicked,'family comparison CSV export should trigger download');
const index=fs.readFileSync(__dirname+'/../web/index.html','utf8'),sw=fs.readFileSync(__dirname+'/../web/sw.js','utf8');assert(index.includes('src="v2-9-26.js"'));assert(sw.includes('./v2-9-26.js'));
console.log('PASS: v2.9.38 parent comparison, insufficient-evidence guard, support recommendation, CSV export and offline wiring');
