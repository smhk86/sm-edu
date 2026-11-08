/* v2.8.8 — GitHub repository -> app link. Silent, throttled, read-only sync of the curated DzExams and Raji3DZ indexes. */
(function(g){'use strict';
 const KEY='smRepoIndexSyncAt',EVERY=12*3600*1000;
 const prior=g.SM_EDUCATION_RELEASE||{};
 g.SM_EDUCATION_RELEASE=Object.assign({},prior,{version:'2.8.8',focus:'github-repository-to-app-link',integrations:['dzexams','raji3dz'],features:(prior.features||[]).concat(['auto-repository-sync','sync-approved-exams-workflow'])});
 async function sync(force){
  try{
   if(typeof navigator!=='undefined'&&navigator.onLine===false)return {skipped:'offline'};
   const last=Number(g.localStorage&&g.localStorage.getItem(KEY))||0;
   if(!force&&Date.now()-last<EVERY)return {skipped:'recent'};
   const out={};
   for(const [name,lib] of [['dzexams',g.SM_DZLIB],['raji3dz',g.SM_RAJI3DZ]]){
    if(!lib||!lib.syncRepositoryIndex)continue;
    try{if(lib._t&&lib._t.load)await lib._t.load();out[name]=await lib.syncRepositoryIndex(true)}catch(e){out[name]=false}
   }
   if(Object.values(out).some(Boolean)){try{g.localStorage.setItem(KEY,String(Date.now()))}catch(e){}}
   return out;
  }catch(e){return {skipped:'error'}}
 }
 g.smSyncRepositories=sync;
 if(typeof g.addEventListener==='function')g.addEventListener('load',()=>setTimeout(()=>sync(false),4000));
})(window);
