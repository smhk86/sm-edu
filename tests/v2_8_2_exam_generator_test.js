const fs=require('fs'),assert=require('assert');
const root=process.cwd(),app=fs.readFileSync(root+'/web/app.js','utf8'),backend=fs.readFileSync(root+'/backend/app/main.py','utf8'),html=fs.readFileSync(root+'/web/index.html','utf8'),sw=fs.readFileSync(root+'/web/sw.js','utf8'),pkg=require(root+'/package.json');
assert.strictEqual(pkg.version,'2.9.1');
for(const id of ['currExamDifficulty','currExamDuration','currExamPoints'])assert(app.includes(id),`missing ${id}`);
assert(app.includes('exclude_question_ids:recent'),'recent questions must be excluded');
assert(app.includes('smExamRecentQuestionIds:'),'recent selection history must be scoped');
assert(app.includes('paper.teacher_version.marking_scheme'),'teacher copy must render marking rubric');
assert(backend.includes('duration_minutes: int = Field(default=60'));
assert(backend.includes('total_points: int = Field(default=20'));
assert(backend.includes('exclude_question_ids: list[str]'));
assert(backend.includes('"criteria": ([{"criterion": step'));
assert(html.includes('v2.9.1')&&html.includes('v2-8-4.js'));
assert(sw.includes('sm-school-ai-v2.9.1-shell-r1')&&sw.includes('./v2-8-4.js')&&sw.includes('./v2-8-5.js'));
const rel={};vmRun();function vmRun(){require('vm').runInNewContext(fs.readFileSync(root+'/web/v2-8-4.js','utf8'),{window:rel});}
assert.strictEqual(rel.SM_EDUCATION_RELEASE.version,'2.8.4');
assert.strictEqual(rel.smEducationExamQualityRubric().reduce((a,x)=>a+x.weight,0),100);
console.log('v2.8.4 exam generator UI and release tests passed');
