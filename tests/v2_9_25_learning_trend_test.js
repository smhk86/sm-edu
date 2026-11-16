const fs=require('fs'),vm=require('vm'),assert=require('assert');
const store={smSchoolProgress:JSON.stringify([{learnerId:'a',subject:'Math',correct:8,total:10,date:'2026-11-01'}]),smSchoolLearningMemory:JSON.stringify([
 {learnerId:'a',at:'2026-11-01T12:00:00.000Z',totalAnswers:10,overallAccuracy:60,subjects:[{subject:'Math',accuracy:60}]},
 {learnerId:'b',at:'2026-11-02T12:00:00.000Z',totalAnswers:10,overallAccuracy:10,subjects:[{subject:'Math',accuracy:10}]},
 {learnerId:'a',at:'2026-11-03T12:00:00.000Z',totalAnswers:20,overallAccuracy:75,subjects:[{subject:'Math',accuracy:80},{subject:'Science',accuracy:70}]}
])};
const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v)};
const ctx={localStorage,lang:'ar',getProgress:()=>JSON.parse(store.smSchoolProgress),escapeReviewText:x=>String(x).replace(/</g,'&lt;')};vm.createContext(ctx);vm.runInContext(fs.readFileSync('web/learning-memory.js','utf8'),ctx);
const t=ctx.learningMemoryTrend('a');assert.equal(t.available,true);assert.equal(t.delta,15);assert.equal(t.subjects[0].subject,'Math');assert.equal(t.subjects[0].delta,20);assert.equal(ctx.learningMemoryTrend('b').available,false);
const panel=ctx.learningMemoryPanel({id:'a'});assert(panel.includes('التطور بين لقطات الذاكرة'));assert(panel.includes('+15'));
const sameDay={learnerId:'a',at:'2026-11-03T16:00:00.000Z',totalAnswers:22,overallAccuracy:76,subjects:[]};store.smSchoolLearningMemory=JSON.stringify([JSON.parse(store.smSchoolLearningMemory)[2],sameDay]);assert.equal(ctx.learningMemoryTrend('a').available,false);
console.log('PASS: learner-isolated longitudinal trend, day separation, accuracy delta, subject comparisons and insufficient-history handling');
