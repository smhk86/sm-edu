// v2.8.9: review fixes — repository base, DzExams file host, workflow robustness, service-worker rules.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ctx={window:{fetch:async()=>({}),localStorage:{getItem:()=>null}},localStorage:{getItem:()=>null}};vm.createContext(ctx);vm.runInContext(read('web/config.js'),ctx);
const cfg=ctx.window.SM_SCHOOL_CONFIG;
assert.equal(cfg.publicContentBase,'https://smhk86.github.io/sm-edu');
assert(cfg.dzexamsHosts.includes('dzexams.com')&&cfg.dzexamsHosts.includes('dzexams.pro'));
assert(!/hakou44/.test(read('web/config.js')+read('tools/sync_dzexams_repository.py')),'old repository base removed');
const wf=read('.github/workflows/sync-approved-exams.yml');
assert(wf.includes('PUBLIC_BASE')&&wf.includes('github.repository_owner')&&wf.includes('--public-base "$PUBLIC_BASE"'));
assert(!wf.includes('wc -l'),'CSV row count must not depend on a trailing newline');
const sw=read('web/sw.js');
assert(sw.includes("-repository-index\\.json")&&sw.includes('./data/raji3dz-repository-index.json'));
assert(sw.includes('(?:exams|repository)'),'large repository files are not cached by the worker');
assert(read('web/index.html').includes('src="v2-8-9.js"')&&sw.includes('./v2-8-9.js'));
const rel={window:null};const c2={SM_EDUCATION_RELEASE:{features:['x']}};c2.window=c2;vm.createContext(c2);vm.runInContext(read('web/v2-8-9.js'),c2);
assert.equal(c2.SM_EDUCATION_RELEASE.version,'2.8.9');assert(c2.SM_EDUCATION_RELEASE.features.includes('x'));
console.log('PASS: v2.8.9 review fixes (repository base, dzexams.pro host, workflow, service worker)');
