(function(g){'use strict';
 var d=g.document;if(!d)return;
 try{if(g.localStorage.getItem('smKeepState')==='0')return}catch(e){}
 var K='smKeepState_v1',TTL=10*60*1000,tm=null,st={},ready=false;
 try{st=JSON.parse(g.localStorage.getItem(K)||'{}')||{}}catch(e){st={}}
 var fresh=!!(st.t&&Date.now()-st.t<TTL);
 if(!fresh)st={};
 var drafts=st.drafts||{};
 function cur(){try{return typeof page!=='undefined'?page:''}catch(e){return ''}}
 function save(){try{if(ready)st.page=cur()||'home';st.drafts=drafts;st.t=Date.now();g.localStorage.setItem(K,JSON.stringify(st))}catch(e){}}
 var og=g.go;
 if(typeof og==='function'&&!og._sk){var w=function(){var r=og.apply(this,arguments);setTimeout(save,0);return r};w._sk=1;g.go=w}
 d.addEventListener('input',function(e){var t=e.target;if(!t||!t.id)return;var n=t.tagName,ty=(t.type||'').toLowerCase();
  if(n!=='TEXTAREA'&&!(n==='INPUT'&&(ty===''||ty==='text'||ty==='search'||ty==='password'||ty==='url'||ty==='email')))return;
  if(t.closest&&t.closest('#smStudentDlg'))return;drafts[t.id]=String(t.value||'').slice(0,4000);clearTimeout(tm);tm=setTimeout(save,300)},true);
 d.addEventListener('submit',function(e){if(e.target&&e.target.id==='chatForm'){delete drafts.chatInput;save()}},true);
 function fill(){if(!fresh)return;Object.keys(drafts).forEach(function(id){var el=d.getElementById(id);
  if(el&&!el._skf){el._skf=1;if(!el.value&&drafts[id]){el.value=drafts[id];try{el.dispatchEvent(new g.Event('input',{bubbles:true}))}catch(e){}}}})}
 var ob=new MutationObserver(function(){clearTimeout(ob._t);ob._t=setTimeout(fill,150)});
 ob.observe(d.body,{childList:true,subtree:true});
 d.addEventListener('visibilitychange',function(){if(d.visibilityState==='hidden')save()});
 g.addEventListener('pagehide',save);
 function restore(){
  if(fresh&&st.page&&st.page!=='home'&&cur()==='home'&&typeof g.go==='function'){try{g.go(st.page)}catch(e){}}
  ready=true;fill()}
 if(d.readyState==='complete')setTimeout(restore,700);else g.addEventListener('load',function(){setTimeout(restore,700)});
})(window);
