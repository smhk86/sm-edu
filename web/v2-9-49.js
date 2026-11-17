/* SM éducation v2.9.49 — home backup card (works inside the Android app), in-app update notice, footer credit. */
(function(){
 'use strict';
 if(window.__smV2949)return;window.__smV2949=true;
 const cfg=window.SM_SCHOOL_CONFIG||{};
 const APP_VERSION='2.9.49';
 const K_TIME='smUpdateCheckTime',K_INFO='smUpdateCheckInfo',K_SKIP='smUpdateSkipVersion',K_LAST='smLastBackupAt';
 const L=()=>(typeof lang!=='undefined'?lang:'ar');
 const tr=(a,f,e)=>L()==='ar'?a:L()==='fr'?f:e;
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
 const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
 const fb=(m,k)=>{if(typeof backupFeedback==='function')backupFeedback(m,k||'')};
 const isNative=()=>{try{return !!(window.Capacitor&&typeof Capacitor.isNativePlatform==='function'&&Capacitor.isNativePlatform())}catch(e){return false}};

 /* ---------- backup (share sheet on phones, download in a browser, clipboard as last resort) ---------- */
 window.exportLocalBackup=async function(){
  let text;
  try{text=JSON.stringify(collectLocalBackup(),null,2)}catch(e){fb(tr('تعذر تجهيز النسخة الاحتياطية.','Sauvegarde impossible.','Could not prepare the backup.'),'incorrect');return}
  const name='SM_SCHOOL_AI_backup_'+new Date().toISOString().slice(0,10)+'.json';
  const done=msg=>{lsSet(K_LAST,String(Date.now()));fb(msg,'correct');paintLast()};
  try{
   const file=new File([text],name,{type:'application/json'});
   if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});done(tr('تمت مشاركة النسخة الاحتياطية.','Sauvegarde partagée.','Backup shared.'));return}
  }catch(e){if(e&&e.name==='AbortError')return}
  if(!isNative()){
   try{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);done(tr('تم تجهيز النسخة الاحتياطية على جهازك.','Sauvegarde préparée sur votre appareil.','Backup prepared on your device.'));return}catch(e){}
  }
  try{await navigator.clipboard.writeText(text);done(tr('نُسخت النسخة الاحتياطية إلى الحافظة؛ الصقها في ملاحظات أو رسالة تحفظها.','Sauvegarde copiée : collez-la dans une note ou un message.','Backup copied: paste it into a note or message and keep it.'));return}catch(e){}
  const ta=document.getElementById('smBackupPaste');
  if(ta){ta.value=text;const d=ta.closest('details');if(d)d.open=true;ta.focus();ta.select();done(tr('انسخ النص الظاهر واحفظه في مكان آمن.','Copiez le texte affiché et gardez-le.','Copy the text shown and keep it safe.'))}
 };
 window.smRestoreFromPaste=function(){
  const ta=document.getElementById('smBackupPaste'),v=ta&&String(ta.value||'').trim();
  if(!v){fb(tr('الصق نص النسخة الاحتياطية أولًا.','Collez d’abord le texte de la sauvegarde.','Paste the backup text first.'),'incorrect');return}
  if(typeof importLocalBackup==='function')importLocalBackup(new File([v],'backup.json',{type:'application/json'}));
 };
 function lastText(){const t=Number(lsGet(K_LAST)||0);if(!t)return tr('لم تُحفظ أي نسخة بعد.','Aucune sauvegarde pour l’instant.','No backup saved yet.');
  return tr('آخر نسخة: ','Dernière sauvegarde : ','Last backup: ')+new Date(t).toLocaleDateString(L()==='ar'?'ar-DZ':L()==='fr'?'fr-FR':'en-GB')}
 function paintLast(){const el=document.getElementById('smBackupLast');if(el)el.textContent=lastText()}
 function backupCard(){
  return `<section class="panel progress-panel sm-home-backup"><h3>💾 ${tr('احفظ تقدّمك قبل أي تحديث','Sauvegardez vos progrès avant une mise à jour','Back up your progress before any update')}</h3>
  <p>${tr('نسخة احتياطية تحفظ تقدّم التلميذ ونتائجه. استعملها قبل حذف التطبيق أو تغيير الهاتف، واستعدها بعد التثبيت.','Une copie de la progression et des résultats. Utilisez-la avant de désinstaller ou de changer de téléphone, puis restaurez-la.','A copy of progress and results. Use it before uninstalling or changing phone, then restore it.')}</p>
  <div class="backup-actions"><button type="button" class="primary-btn" onclick="exportLocalBackup()">${tr('تصدير نسخة احتياطية','Exporter une sauvegarde','Export backup')}</button><label class="secondary-btn backup-file-label">${tr('استعادة نسخة','Restaurer','Restore')}<input type="file" accept="application/json,.json" onchange="importLocalBackup(this.files&&this.files[0])" hidden></label></div>
  <small id="smBackupLast">${esc(lastText())}</small>
  <details><summary>${tr('نسخ/لصق النص يدويًا','Copier/coller le texte','Copy/paste as text')}</summary><textarea id="smBackupPaste" rows="4" style="width:100%;margin-top:8px" aria-label="backup"></textarea><button type="button" class="secondary-btn" onclick="smRestoreFromPaste()">${tr('استعادة من النص','Restaurer depuis le texte','Restore from text')}</button></details>
  <div id="backupFeedback" class="question-feedback" aria-live="polite"></div></section>`;
 }

 /* ---------- update notice (reads data/app-version.json from the published content site; silent when offline) ---------- */
 let pending=null;
 const parse=v=>{const m=String(v||'').match(/(\d+)\.(\d+)\.(\d+)/);return m?[+m[1],+m[2],+m[3]]:null};
 const newer=(a,b)=>{for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}return false};
 function bannerHtml(){
  if(!pending)return '';
  return `<section class="panel sm-update-banner" role="status"><h3>⬆ ${tr('تحديث جديد متاح','Nouvelle version disponible','New version available')} · v${esc(pending.version)}</h3>
  <p>${tr('يُثبَّت فوق النسخة الحالية دون حذف بياناتك. يُنصح بتصدير نسخة احتياطية أولًا.','S’installe par-dessus l’actuelle sans effacer vos données. Exportez d’abord une sauvegarde.','Installs over the current one without deleting your data. Export a backup first.')}</p>
  <div class="backup-actions"><a class="primary-btn" style="text-decoration:none;display:inline-block" href="${esc(pending.url)}" target="_blank" rel="noopener">${tr('تنزيل التحديث','Télécharger la mise à jour','Download update')}</a><button type="button" class="secondary-btn" onclick="exportLocalBackup()">${tr('نسخة احتياطية أولًا','Sauvegarde d’abord','Backup first')}</button><button type="button" class="secondary-btn" onclick="smSkipUpdate()">${tr('لاحقًا','Plus tard','Later')}</button></div></section>`;
 }
 function paintBanner(){const el=document.getElementById('smUpdateBanner');if(el)el.innerHTML=bannerHtml()}
 window.smSkipUpdate=function(){if(pending)lsSet(K_SKIP,pending.version);pending=null;paintBanner()};
 function contentBase(){return String(lsGet('smContentBase')||cfg.publicContentBase||'').replace(/\/$/,'')}
 async function checkUpdate(){
  const base=contentBase();
  if(!base||!navigator.onLine)return;
  try{
   let info=null;
   const age=Date.now()-Number(lsGet(K_TIME)||0);
   if(age<6*3600*1000){try{info=JSON.parse(lsGet(K_INFO)||'null')}catch(e){}}
   if(!info){
    const r=await fetch(base+'/data/app-version.json',{cache:'no-store',headers:{Accept:'application/json'}});
    if(!r.ok)return;
    const d=await r.json(),v=parse(d&&d.version);if(!v)return;
    info={version:v.join('.'),url:String(d.url||'')};
    lsSet(K_TIME,String(Date.now()));lsSet(K_INFO,JSON.stringify(info));
   }
   const a=parse(info.version),b=parse(APP_VERSION);
   pending=(a&&b&&newer(a,b)&&lsGet(K_SKIP)!==info.version&&/^https:\/\/github\.com\//.test(info.url||''))?info:null;
   paintBanner();
  }catch(e){}
 }

 /* ---------- footer credit ---------- */
 function credit(){
  const name=String(cfg.credit||'').trim(),f=document.querySelector('footer');
  if(!name||!f||f.querySelector('.sm-credit'))return;
  const s=document.createElement('span');s.className='sm-credit';s.textContent='Réalisé par : '+name;
  f.insertBefore(s,f.lastElementChild);
 }

 /* ---------- home: update banner on top, backup card below ---------- */
 const prevHome=window.home;
 if(typeof prevHome==='function'){
  window.home=function(){return `<div id="smUpdateBanner">${bannerHtml()}</div>`+prevHome.apply(this,arguments)+backupCard()};
 }
 credit();
 try{if(typeof page!=='undefined'&&page==='home'&&typeof window.render==='function')window.render()}catch(e){}
 window.addEventListener('online',checkUpdate);
 setTimeout(checkUpdate,3000);
})();
