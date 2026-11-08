/* SM éducation v2.2.1 — role-oriented home shortcuts and resilient mobile navigation. */
(function(){
 'use strict';
 const tr=(ar,fr,en)=>typeof lang!=='undefined'&&lang==='fr'?fr:typeof lang!=='undefined'&&lang==='en'?en:ar;
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const roles=[
  {page:'exercises',icon:'✎',ar:'فضاء التلميذ',fr:'Espace élève',en:'Student space',descAr:'تمارين ودروس ومتابعة التقدم',descFr:'Exercices, cours et suivi',descEn:'Practice, lessons and progress'},
  {page:'teacher',icon:'🎓',ar:'فضاء الأستاذ',fr:'Espace enseignant',en:'Teacher space',descAr:'تحضير الدروس والتقييم والتخطيط',descFr:'Préparer, évaluer et planifier',descEn:'Prepare, assess and plan'},
  {page:'parents',icon:'♧',ar:'فضاء الولي',fr:'Espace parent',en:'Parent space',descAr:'متابعة التعلم وتنظيم الدعم الأسري',descFr:'Suivi et accompagnement familial',descEn:'Follow learning and family support'}
 ];
 const oldHome=window.home;
 if(typeof oldHome==='function'){
  window.home=function(){
   const base=oldHome();
   const cards=roles.map(r=>`<button type="button" class="role-shortcut" data-role-page="${r.page}" aria-label="${tr(r.ar,r.fr,r.en)}"><span class="role-shortcut-icon" aria-hidden="true">${r.icon}</span><span class="role-shortcut-copy"><b>${tr(r.ar,r.fr,r.en)}</b><small>${tr(r.descAr,r.descFr,r.descEn)}</small></span><span class="role-shortcut-arrow" aria-hidden="true">←</span></button>`).join('');
   return base+`<section class="role-hub" aria-labelledby="roleHubTitle"><div class="role-hub-heading"><div><span class="eyebrow">${tr('مساحات المنصة','Espaces de la plateforme','Platform spaces')}</span><h3 id="roleHubTitle">${tr('اختر فضاء الاستخدام','Choisissez votre espace','Choose your space')}</h3></div><span class="role-hub-mark" aria-hidden="true">✦</span></div><div class="role-shortcuts">${cards}</div><p class="role-hub-note">${tr('هذه اختصارات إلى أدوات المنصة؛ لا تنشئ حسابات أو صلاحيات منفصلة.','Ces raccourcis ouvrent les outils existants ; ils ne créent pas de comptes ni de permissions.','These shortcuts open existing tools; they do not create separate accounts or permissions.')}</p></section>`;
  };
 }
 document.addEventListener('click',e=>{
  const card=e.target.closest('[data-role-page]');
  if(card&&typeof window.go==='function')window.go(card.getAttribute('data-role-page'));
 });
 const sidebar=document.getElementById('sidebar'),menu=document.getElementById('menuBtn');
 if(sidebar&&menu){
  const sync=()=>{const open=sidebar.classList.contains('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?tr('إغلاق القائمة','Fermer le menu','Close menu'):tr('فتح القائمة','Ouvrir le menu','Open menu'));};
  const close=()=>{sidebar.classList.remove('open');sync()};
  menu.addEventListener('click',()=>requestAnimationFrame(sync));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sidebar.classList.contains('open')){close();menu.focus()}});
  document.addEventListener('click',e=>{if(sidebar.classList.contains('open')&&!sidebar.contains(e.target)&&!menu.contains(e.target))close()});
  sidebar.addEventListener('click',e=>{if(e.target.closest('.nav-item'))close()});
  sync();
 }
})();
