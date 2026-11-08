/* SM éducation v2.1.9 — connection awareness and accessible shell refinements. */
(function(){
 'use strict';
 const root=document.getElementById('connectionStatus');
 if(!root)return;
 const label=root.querySelector('span:last-child');
 const dot=root.querySelector('.status-dot');
 const lang=()=>typeof window.lang==='string'?window.lang:'ar';
 const messages={
  ar:{online:'متصل بالإنترنت — المحتوى المحلي متاح أيضاً',offline:'غير متصل — يمكنك متابعة المحتوى المحمّل',unknown:'حالة الاتصال غير معروفة'},
  fr:{online:'Connecté — le contenu local reste disponible',offline:'Hors ligne — le contenu téléchargé reste disponible',unknown:'État de connexion inconnu'},
  en:{online:'Online — local content is also available',offline:'Offline — downloaded content remains available',unknown:'Connection state is unknown'}
 };
 function update(){
  const state=typeof navigator.onLine==='boolean'?(navigator.onLine?'online':'offline'):'unknown';
  const words=messages[lang()]||messages.ar;
  if(label)label.textContent=words[state];
  root.dataset.connection=state;
  if(dot){dot.classList.toggle('is-offline',state==='offline');dot.classList.toggle('is-online',state==='online')}
 }
 window.addEventListener('online',update);
 window.addEventListener('offline',update);
 document.getElementById('languageSelect')?.addEventListener('change',()=>setTimeout(update,0));
 update();
})();
