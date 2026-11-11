const assert=require('assert');const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'..');const d=JSON.parse(fs.readFileSync(path.join(root,'web/data/teacher-retrieval-index-2026-2027.json'),'utf8'));
assert.equal(d.release,'2.9.34');assert.equal(d.documents.length,1250);assert.ok(d.summary.indexed_terms>0);assert.equal(d.summary.lesson_exercise_links,1581);
const ids=new Set(d.documents.map(x=>x.id));assert.equal(ids.size,d.documents.length);const bank=JSON.parse(fs.readFileSync(path.join(root,'web/data/exercise-bank-2026-2027.json'),'utf8'));const exerciseIds=new Set(bank.records.map(x=>String(x.id))); 
for(const doc of d.documents){assert.ok(Array.isArray(doc.tokens));assert.ok(Array.isArray(doc.exercise_ids));assert.ok(Array.isArray(doc.knowledge_record_ids));for(const id of doc.exercise_ids)assert.ok(exerciseIds.has(id));}
for(const [token,refs] of Object.entries(d.postings)){assert.ok(token.length>2);assert.ok(Array.isArray(refs));for(const id of refs)assert.ok(ids.has(id));}
const target=d.documents.find(x=>x.lesson==='الاسم والفعل والحرف');assert.ok(target);assert.ok(target.exercise_ids.length>0);assert.ok(target.deep_content_available);
assert.equal(d.policy.knowledge_links,'Only exact metadata and lesson-name matches are linked.');
console.log('v2.9.34 retrieval index tests: PASS');
