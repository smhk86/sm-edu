// v2.8.8: GitHub repository -> app link: workflow guards, silent throttled auto-sync, wiring.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const wf=read('.github/workflows/sync-approved-exams.yml');
assert(/workflow_dispatch:/.test(wf)&&!/\n\s*(push|schedule|pull_request):/.test(wf),'manual trigger only');
assert(wf.includes('permission_confirmed')&&wf.includes('inputs.permission_confirmed != true')&&wf.includes('exit 1'),'permission gate fails the run');
assert(wf.includes('--source dzexams')&&wf.includes('--source raji3dz')&&wf.includes('--permission-confirmed'));
assert(wf.includes('web/repository')&&wf.includes('raji3dz-repository-index.json')&&wf.includes('dzexams-repository-index.json'));
assert(wf.includes('deploy-pages')&&wf.includes('upload-pages-artifact'),'same run redeploys Pages (GITHUB_TOKEN pushes do not trigger other workflows)');
assert(!/secrets\.|ghp_|github_pat_/.test(wf),'no custom secrets: built-in token only');
const html=read('web/index.html'),sw=read('web/sw.js');
assert(html.includes('src="v2-8-8.js"')&&sw.includes('./v2-8-8.js'));
const store={};const calls=[];let online=true;
const mk=n=>({_t:{load:async()=>calls.push(n+':load')},syncRepositoryIndex:async q=>{calls.push(n+':sync:'+q);return true}});
const ctx={console,setTimeout:(f)=>0,Date,Object,Number,String,navigator:{get onLine(){return online}},
 localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)}},SM_DZLIB:mk('dz'),SM_RAJI3DZ:mk('rj'),SM_EDUCATION_RELEASE:{features:['x']}};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(read('web/v2-8-8.js'),ctx);
assert.equal(ctx.SM_EDUCATION_RELEASE.version,'2.8.8');
(async()=>{
 online=false;assert.equal((await ctx.smSyncRepositories(false)).skipped,'offline');assert.equal(calls.length,0);online=true;
 let r=await ctx.smSyncRepositories(false);
 assert.deepEqual(calls,['dz:load','dz:sync:true','rj:load','rj:sync:true'],'both indexes synced quietly');assert(r.dzexams&&r.raji3dz);
 calls.length=0;assert.equal((await ctx.smSyncRepositories(false)).skipped,'recent');assert.equal(calls.length,0,'throttled');
 await ctx.smSyncRepositories(true);assert.equal(calls.length,4,'force overrides throttle');
 ctx.SM_DZLIB.syncRepositoryIndex=async()=>{throw new Error('x')};calls.length=0;
 r=await ctx.smSyncRepositories(true);assert.equal(r.dzexams,false);assert(calls.includes('rj:sync:true'),'one failure does not block the other');
 console.log('PASS: v2.8.8 workflow guards, silent throttled repository auto-sync, wiring');
})().catch(e=>{console.error(e);process.exit(1)});
