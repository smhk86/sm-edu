const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const graph=JSON.parse(fs.readFileSync(path.join(root,'web/data/teacher-knowledge-graph-2026-2027.json'),'utf8'));
assert.strictEqual(graph.release,'2.9.32');assert.strictEqual(graph.nodes.length,1250);assert(graph.summary.concept_terms>0);assert(graph.edges.length>0);
const ids=new Set(graph.nodes.map(x=>x.id));assert.strictEqual(ids.size,graph.nodes.length);
for(const e of graph.edges){assert(ids.has(e.source)&&ids.has(e.target));assert.notStrictEqual(e.source,e.target);assert(['same_topic','shared_concept'].includes(e.type));}
assert.strictEqual(graph.summary.official_prerequisite_relations,0);assert.strictEqual(graph.summary.official_sequence_relations,0);
assert(graph.coverage.length>0);assert(graph.nodes.every(n=>Array.isArray(n.concepts)));
const sandbox={window:{fetch:async()=>({ok:true,json:async()=>graph}),document:null,SM_EDUCATION_RELEASE:{}},console};
vm.runInNewContext(fs.readFileSync(path.join(root,'web/v2-9-32.js'),'utf8'),sandbox);
(async()=>{await sandbox.window.smTeacherKnowledgeGraphReady;const stats=sandbox.window.smTeacherKnowledgeGraphStats();assert.strictEqual(stats.lessons,1250);const found=sandbox.window.smTeacherKnowledgeGraphSearch({query:'الاسم والفعل',limit:5});assert(found.length>0);const related=sandbox.window.smTeacherKnowledgeGraphRelated(found[0].id,4);assert(Array.isArray(related));const ctx=sandbox.window.smTeacherKnowledgeGraphContext({query:'الاسم والفعل'});assert(ctx.includes('لا يثبت'));console.log('v2.9.32 teacher knowledge graph tests passed');})().catch(e=>{console.error(e);process.exit(1)});
