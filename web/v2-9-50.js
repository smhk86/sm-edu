/* SM éducation v2.9.50 — (1) smart-teacher chat laid out like Claude's app (keyboard-aware, full screen, back button),
   (2) stay on the same page for 10 minutes after leaving the app, (3) BEM / BAC space: past papers with solutions + suggested topics. */
(function(){
 'use strict';
 if(window.__smV2950)return;window.__smV2950=true;
 const w=window,d=document;
 const L=()=>{try{return typeof lang!=='undefined'?lang:'ar'}catch(e){return 'ar'}};
 const tr=(a,f,e)=>L()==='ar'?a:L()==='fr'?f:e;
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const curPage=()=>{try{return typeof page!=='undefined'?page:''}catch(e){return ''}};

 /* ================= 1. Claude-like chat ================= */
 const css=`
 body.sm-chatfull{overflow:hidden}
 @media (max-width:720px){
  body.sm-chatfull .topbar,body.sm-chatfull .bottom-nav,body.sm-chatfull .grade-bar,body.sm-chatfull footer{display:none!important}
  body.sm-chatfull .v240-chat{position:fixed;inset-inline:0;top:var(--sm-vv-top,0px);bottom:auto;height:var(--sm-vv-h,100dvh);min-height:0;z-index:60;border:0;border-radius:0;box-shadow:none;background:var(--bg);padding-top:env(safe-area-inset-top,0px)}
  body.sm-chatfull .v240-chat-head{background:var(--bg);border-bottom:1px solid var(--line);padding:8px 10px}
  body.sm-chatfull .v240-chat-head .avatar{display:none}
  .sm50-back{border:0;background:transparent;color:var(--ink);font-size:22px;width:38px;height:38px;border-radius:50%;cursor:pointer;flex:0 0 auto}
  .sm50-back:active{background:var(--soft,#eef2ff)}
  body.sm-chatfull .v240-msgs{padding:14px 14px 8px;gap:14px}
  body.sm-chatfull .v240-msgs .message{max-width:100%;font-size:16px;line-height:1.95}
  body.sm-chatfull .v240-msgs .message.bot{align-self:stretch;background:transparent;border:0;padding:2px 2px}
  body.sm-chatfull .v240-msgs .message.user{max-width:88%;background:var(--soft,#eef2f7);color:var(--ink);border-radius:20px;border-end-end-radius:6px}
  body.sm-chatfull .v240-compose{padding:6px 10px calc(8px + env(safe-area-inset-bottom,0px));background:var(--bg);border-top:0;gap:6px}
  body.sm-chatfull .v240-inputrow{align-items:flex-end;background:var(--card);border:1px solid var(--line);border-radius:26px;padding:6px 8px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  body.sm-chatfull .v240-inputrow textarea{border:0;background:transparent;box-shadow:none;outline:none;padding:9px 8px;font-size:16px;max-height:140px}
  body.sm-chatfull .v240-send{flex:0 0 40px;width:40px;height:40px}
  body.sm-chatfull .v240-modes{padding:0 2px}
  body.sm-chatfull .v240-mode{font-size:12px;padding:5px 11px}
  body.sm-chatfull .v240-settings{max-height:60vh}
 }`;
 const st=d.createElement('style');st.textContent=css;(d.head||d.documentElement).appendChild(st);

 function vv(){
  try{
   const v=w.visualViewport,root=d.documentElement;
   const h=Math.round(Math.min(v?v.height:w.innerHeight,w.innerHeight||1e5)),top=Math.round(v?v.offsetTop:0);
   root.style.setProperty('--sm-vv-h',h+'px');root.style.setProperty('--sm-vv-top',top+'px');
   const box=d.getElementById('messages');
   if(box&&d.activeElement&&d.activeElement.id==='chatInput')setTimeout(()=>{box.scrollTop=box.scrollHeight},60);
  }catch(e){}
 }
 if(w.visualViewport){w.visualViewport.addEventListener('resize',vv);w.visualViewport.addEventListener('scroll',vv)}
 w.addEventListener('resize',vv);
 d.addEventListener('focusin',e=>{if(e.target&&e.target.id==='chatInput'){vv();setTimeout(vv,250);setTimeout(()=>{try{e.target.scrollIntoView({block:'nearest'})}catch(x){}},350)}});

 function decorate(){
  const chat=d.querySelector('.v240-chat');
  const on=!!chat&&curPage()==='teacher';
  d.body.classList.toggle('sm-chatfull',on);
  if(!on)return;
  vv();
  const head=chat.querySelector('.v240-chat-head');
  if(head&&!head.querySelector('.sm50-back')){
   const b=d.createElement('button');b.type='button';b.className='sm50-back';
   b.setAttribute('aria-label',tr('رجوع','Retour','Back'));b.textContent=L()==='ar'?'→':'←';
   b.onclick=()=>{try{if(typeof go==='function')go('home')}catch(e){}};
   head.insertBefore(b,head.firstChild);
  }
 }
 let tm=null;
 new MutationObserver(()=>{if(!tm)tm=setTimeout(()=>{tm=null;try{decorate()}catch(e){}},120)}).observe(d.body,{childList:true,subtree:true});
 setTimeout(decorate,300);

 /* ================= 2. stay in place for 10 minutes ================= */
 const KEEP_MS=10*60*1000;let hiddenAt=0;
 d.addEventListener('visibilitychange',()=>{
  if(d.visibilityState==='hidden'){hiddenAt=Date.now();return}
  if(hiddenAt&&Date.now()-hiddenAt>KEEP_MS&&curPage()&&curPage()!=='home'&&typeof w.go==='function'){try{w.go('home')}catch(e){}}
  hiddenAt=0;
 });

 /* ================= 3. BEM / BAC space ================= */
 const TRACKS={BEM:{grade:'الرابعة متوسط',label:'BEM',full:()=>tr('شهادة التعليم المتوسط','Brevet (BEM)','BEM — Middle school certificate'),icon:'🎓'},
               BAC:{grade:'الثالثة ثانوي',label:'BAC',full:()=>tr('شهادة البكالوريا','Baccalauréat (BAC)','BAC — Baccalaureate'),icon:'🏅'}};
 const S={papers:null,track:'BEM',subject:'',year:'',sol:true,shown:15,items:null,topics:null,loading:false,err:''};
 const TERM=n=>n?tr('الفصل '+['','الأول','الثاني','الثالث'][n],'Trimestre '+n,'Term '+n):'';

 async function loadData(){
  if(S.items||S.loading)return;S.loading=true;
  try{
   const r=await fetch('data/raji3dz-repository-index.json');const j=await r.json();
   S.items=(Array.isArray(j.items)?j.items:[]).filter(x=>x&&(x.grade===TRACKS.BEM.grade||x.grade===TRACKS.BAC.grade));
  }catch(e){S.items=[];S.err=tr('تعذّر تحميل فهرس المواضيع.','Index indisponible.','Could not load the index.')}
  try{const r=await fetch('data/certificate-papers.json');S.papers=r.ok?((await r.json()).items||[]).filter(x=>x&&x.rights_cleared&&x.text):[]}catch(e){S.papers=[]}
  try{
   const r=await fetch('data/curriculum-2026-2027.json');const j=await r.json();const out={};
   (j.records||[]).filter(x=>x.grade===TRACKS.BEM.grade||x.grade===TRACKS.BAC.grade).forEach(rec=>{
    const key=rec.grade+'|'+rec.subject,set=out[key]=out[key]||new Set();
    ((rec.platform_learning_map||{}).terms||[]).forEach(t=>{(t.platform_lessons||[]).forEach(x=>set.add(x));(t.platform_topics||[]).forEach(x=>set.add(x))});
   });
   S.topics=out;
  }catch(e){S.topics={}}
  S.loading=false;refresh();
 }
 const tItems=()=>(S.items||[]).filter(x=>x.grade===TRACKS[S.track].grade);
 function filtered(){
  return tItems().filter(x=>(!S.subject||x.subject===S.subject)&&(!S.year||String(x.year)===String(S.year))&&(!S.sol||x.solution))
   .sort((a,b)=>(b.year||0)-(a.year||0)||String(a.subject).localeCompare(String(b.subject),'ar')||(a.term||0)-(b.term||0));
 }
 function panelHtml(){
  const T=TRACKS[S.track],items=tItems();
  const subjects=[...new Set(items.map(x=>x.subject))].sort((a,b)=>String(a).localeCompare(String(b),'ar'));
  const years=[...new Set(items.map(x=>x.year).filter(Boolean))].sort((a,b)=>b-a);
  const opt=(v,t,c)=>`<option value="${esc(v)}" ${String(c)===String(v)?'selected':''}>${esc(t)}</option>`;
  const seg=['BEM','BAC'].map(k=>`<button type="button" class="${S.track===k?'on':''}" onclick="SM_V2950.track('${k}')">${TRACKS[k].icon} ${TRACKS[k].label}</button>`).join('');
  let body;
  if(!S.items)body=`<p>${tr('جارٍ التحميل…','Chargement…','Loading…')}</p>`;
  else{
   const all=filtered(),shown=all.slice(0,S.shown);
   body=`<div class="sm50-filters"><select aria-label="${tr('المادة','Matière','Subject')}" onchange="SM_V2950.set('subject',this.value)">${opt('',tr('كل المواد','Toutes','All subjects'),S.subject)}${subjects.map(s=>opt(s,s,S.subject)).join('')}</select>`+
    `<select aria-label="${tr('السنة','Année','Year')}" onchange="SM_V2950.set('year',this.value)">${opt('',tr('كل السنوات','Toutes','All years'),S.year)}${years.map(y=>opt(y,y,S.year)).join('')}</select>`+
    `<label class="sm50-sol"><input type="checkbox" ${S.sol?'checked':''} onchange="SM_V2950.set('sol',this.checked)"> ${tr('مع الحل فقط','Avec corrigé seulement','With solution only')}</label></div>`+
    `<small class="sm50-count">${all.length} ${tr('موضوع','sujets','papers')}</small>`+
    (all.length?`<div class="tl-list">${shown.map(x=>{const meta=[x.subject,x.year||'',TERM(x.term),x.solution?tr('مع الحل','avec corrigé','with solution'):''].filter(Boolean).join(' · ');
      return `<div class="tl-row"><div class="tl-main"><b>${esc(x.title)}</b><small>${esc(meta)}</small></div><div class="tl-actions"><button type="button" class="primary-btn tl-btn" onclick="SM_V2950.open(${(S.items||[]).indexOf(x)})">${tr('تحميل وفتح','Télécharger','Get & open')}</button></div></div>`}).join('')}</div>`:`<p>${tr('لا توجد مواضيع مطابقة. غيّر المرشّحات أو أضف ملفات إلى المستودع.','Aucun sujet. Changez les filtres ou ajoutez des fichiers au dépôt.','No matching papers. Change the filters or add files to the repository.')}</p>`)+
    (all.length>shown.length?`<button type="button" class="secondary-btn tl-more" onclick="SM_V2950.more()">${tr('عرض المزيد','Plus','Show more')} (${all.length-shown.length})</button>`:'')+
    (S.err?`<p class="notice">${esc(S.err)}</p>`:'');
  }
  return `<section class="panel sm50-cert"><h3>📚 ${tr('فضاء '+T.label+': نماذج سابقة مع الحلول','Espace '+T.label+' : sujets corrigés','Space '+T.label+': past papers with solutions')}</h3>`+
   `<div class="sm50-seg" role="tablist">${seg}</div><p class="sm50-sub">${esc(T.full())} · ${esc(T.grade)}</p>${body}${papersHtml()}${topicsHtml()}</section>`;
 }
 function papersHtml(){
  const list=(S.papers||[]).filter(x=>x.track===S.track&&(!S.subject||x.subject===S.subject)&&(!S.year||String(x.year)===String(S.year)));
  if(!list.length)return '';
  const blk=t=>`<div class="sm50-txt">${esc(t)}</div>`;
  return `<details class="sm50-topics" open><summary><b>📝 ${tr('مواضيع مقترحة (نص مقروء)','Sujets proposés (texte)','Suggested papers (text)')}</b> · ${list.length}</summary>`+list.map(x=>`<details class="sm50-paper"><summary>${esc([x.subject,x.title].filter(Boolean).join(' · '))}${x.solution?' ✅':''}</summary>${blk(x.text)}${x.solution?`<details><summary><b>${tr('الحل','Corrigé','Solution')}</b></summary>${blk(x.solution)}</details>`:''}${x.source?`<small class="sm50-sub">${tr('المصدر: ','Source : ','Source: ')}${esc(x.source)}</small>`:''}</details>`).join('')+`</details>`;
 }
 function topicsHtml(){
  if(!S.topics)return '';
  const g=TRACKS[S.track].grade;
  const subs=Object.keys(S.topics).filter(k=>k.startsWith(g+'|')).map(k=>k.slice(g.length+1)).filter(s=>!S.subject||s===S.subject);
  const rows=subs.map(s=>({s,list:[...S.topics[g+'|'+s]].slice(0,12)})).filter(r=>r.list.length);
  if(!rows.length)return '';
  return `<details class="sm50-topics" open><summary><b>💡 ${tr('مواضيع مقترحة للمراجعة','Thèmes proposés pour réviser','Suggested topics to revise')}</b></summary>`+
   `<p class="sm50-sub">${tr('اقتراحات من المنصة حسب المادة، وليست مواضيع رسمية. اضغط على موضوع ليشرحه لك المعلم الذكي.','Suggestions de la plateforme, non officielles. Touchez un thème pour que le tuteur l’explique.','Platform suggestions, not official. Tap a topic and the smart teacher explains it.')}</p>`+
   rows.map(r=>`<div class="sm50-trow"><b>${esc(r.s)}</b><div class="tl-chips">${r.list.map(x=>`<button type="button" class="v240-chip" onclick="SM_V2950.ask(${esc(JSON.stringify(r.s))},${esc(JSON.stringify(x))})">${esc(x)}</button>`).join('')}</div></div>`).join('')+`</details>`;
 }
 function refresh(){const el=d.getElementById('sm50Cert');if(el)el.innerHTML=panelHtml()}
 w.SM_V2950={
  track(k){if(!TRACKS[k])return;S.track=k;S.subject='';S.year='';S.shown=15;refresh()},
  set(k,v){S[k]=v;S.shown=15;refresh()},
  more(){S.shown+=15;refresh()},
  async open(i){const x=(S.items||[])[i];if(!x)return;
   try{if(w.SM_RAJI3DZ&&w.SM_RAJI3DZ.openByFile)await w.SM_RAJI3DZ.openByFile(x.file);else if(typeof toast==='function')toast(tr('مكتبة الملفات غير جاهزة بعد.','Bibliothèque non prête.','Library not ready.'))}catch(e){if(typeof toast==='function')toast(tr('تعذّر فتح الملف.','Ouverture impossible.','Could not open the file.'))}},
  ask(subject,topic){
   const q=tr('اشرح لي درس «'+topic+'» في مادة '+subject+' للتحضير لامتحان '+TRACKS[S.track].label,'Explique-moi « '+topic+' » ('+subject+') pour préparer le '+TRACKS[S.track].label,'Explain “'+topic+'” ('+subject+') to prepare for the '+TRACKS[S.track].label);
   try{w.go('teacher')}catch(e){return}
   let n=0;const t=setInterval(()=>{const i=d.getElementById('chatInput');if(i||++n>20){clearInterval(t);if(i){i.value=q;try{i.dispatchEvent(new Event('input',{bubbles:true}))}catch(e){}i.focus()}}},150);
  },
  _s:S,_panel:panelHtml,_filtered:filtered
 };
 const pcss=d.createElement('style');
 pcss.textContent='.sm50-seg{display:flex;gap:6px;margin:8px 0}.sm50-seg button{flex:1;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:12px;padding:10px;font:inherit;font-weight:700;cursor:pointer}.sm50-seg button.on{background:var(--blue);border-color:var(--blue);color:#fff}.sm50-sub{color:var(--muted);font-size:12px;line-height:1.7;margin:4px 0}.sm50-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.sm50-filters select{flex:1 1 130px;font:inherit;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink)}.sm50-sol{font-size:13px;display:flex;gap:6px;align-items:center}.sm50-count{color:var(--muted)}.sm50-topics{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}.sm50-trow{margin:10px 0}.sm50-paper{margin:8px 0;border:1px solid var(--line);border-radius:12px;padding:8px 10px}.sm50-paper summary{cursor:pointer;font-weight:600}.sm50-txt{white-space:pre-wrap;line-height:1.9;font-size:14px;margin:8px 0;overflow-wrap:anywhere}.sm50-trow .tl-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}';
 (d.head||d.documentElement).appendChild(pcss);
 const _orig=w.examSimulatorPage;
 if(typeof _orig==='function'){
  w.examSimulatorPage=function(){setTimeout(()=>{try{loadData();refresh()}catch(e){}},0);return `<div id="sm50Cert">${panelHtml()}</div>`+_orig.apply(this,arguments)};
 }
})();
