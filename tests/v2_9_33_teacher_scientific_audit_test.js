const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const audit=JSON.parse(fs.readFileSync(path.join(root,'web/data/teacher-scientific-audit-2026-2027.json'),'utf8'));
assert.strictEqual(audit.release,'2.9.33');assert.strictEqual(audit.summary.lessons_checked,1250);assert.strictEqual(audit.summary.deep_content_records,1250);assert.strictEqual(audit.summary.exercise_records,1581);
assert.strictEqual(audit.summary.officially_verified_lessons,0);assert(audit.summary.policy.includes('not proof'));
for(const f of audit.findings){assert(f.record_id&&f.code&&f.severity&&f.confidence);assert.strictEqual(f.requires_human_review,true);assert(['high','medium','low'].includes(f.severity));}
const sandbox={window:{fetch:async()=>({ok:true,json:async()=>audit}),document:null,SM_EDUCATION_RELEASE:{}}};
vm.runInNewContext(fs.readFileSync(path.join(root,'web/v2-9-33.js'),'utf8'),sandbox);
(async()=>{await sandbox.window.smTeacherScientificAuditReady;assert.strictEqual(sandbox.window.smTeacherScientificAuditStats().lessons_checked,1250);assert.strictEqual(sandbox.window.smTeacherScientificAuditFindings({limit:5}).length,Math.min(5,audit.findings.length));assert(sandbox.window.smTeacherScientificAuditContext().includes('ليست إثباتاً'));assert.strictEqual(sandbox.window.SM_EDUCATION_RELEASE.version,'2.9.33');console.log('v2.9.33 teacher scientific audit tests passed');})().catch(e=>{console.error(e);process.exit(1)});
