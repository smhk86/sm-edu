(function(g){'use strict';
 var d=g.document;if(!d)return;
 try{if(g.localStorage.getItem('smClaudeChat')==='0')return}catch(e){}
 var CSS=['@media(max-width:820px){',
 'body.sm-cc{overflow:hidden}',
 'body.sm-cc .bottom-nav{display:none!important}',
 'body.sm-cc main.main-content{position:fixed;left:0;right:0;top:0;height:var(--sm-vh,100%);display:flex;flex-direction:column;overflow:hidden;padding:0 12px;margin:0;box-sizing:border-box}',
 'body.sm-cc .topbar{flex:none;position:static;margin:0;padding:8px 0}',
 'body.sm-cc #backBtn{display:inline-flex!important}',
 'body.sm-cc .sm-cc-col{display:flex;flex-direction:column;min-height:0;overflow:hidden}',
 'body.sm-cc .sm-cc-col>*{flex:none}',
 'body.sm-cc .sm-cc-grow{flex:1 1 auto!important;min-height:0}',
 'body.sm-cc .sm-cc-scroll{overflow-y:auto!important;max-height:none!important;height:auto!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
 'body.sm-cc .sm-cc-fix{flex:none!important}',
 'body.sm-cc .v240-settings[open]{max-height:45%;overflow:auto}',
 '}'].join('\n');
 var st=d.createElement('style');st.id='smClaudeChatCss';st.textContent=CSS;d.head.appendChild(st);
 var vv=g.visualViewport,timer=null;
 function setVh(){var h=(vv&&vv.height)||g.innerHeight;d.documentElement.style.setProperty('--sm-vh',h+'px')}
 function path(el,stop){var a=[];while(el&&el!==stop&&el!==d.body){a.push(el);el=el.parentElement}return a}
 function mark(){
  var main=d.querySelector('main.main-content'),form=d.getElementById('chatForm'),msgs=d.getElementById('messages');
  var ok=!!(main&&form&&msgs&&main.contains(form)&&main.contains(msgs));
  d.body.classList.toggle('sm-cc',ok);
  if(!ok||msgs._smcc)return;
  var pm=path(msgs,main),pf=path(form,main),lca=null;
  for(var i=0;i<pm.length;i++){if(pf.indexOf(pm[i])>-1){lca=pm[i];break}}
  if(!lca)return;
  msgs._smcc=1;
  path(lca,main).forEach(function(n){n.classList.add('sm-cc-col','sm-cc-grow')});
  pm.slice(0,pm.indexOf(lca)).forEach(function(n){n.classList.add('sm-cc-grow');if(n!==msgs)n.classList.add('sm-cc-col')});
  msgs.classList.add('sm-cc-scroll');
  pf.slice(0,pf.indexOf(lca)).forEach(function(n){n.classList.add('sm-cc-fix')});
  setVh();msgs.scrollTop=msgs.scrollHeight}
 function onVv(){setVh();var m=d.getElementById('messages');if(m&&d.body.classList.contains('sm-cc')&&d.activeElement&&d.activeElement.id==='chatInput')m.scrollTop=m.scrollHeight}
 new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(mark,60)}).observe(d.body,{childList:true,subtree:true});
 if(vv){vv.addEventListener('resize',onVv);vv.addEventListener('scroll',setVh)}
 g.addEventListener('resize',onVv);setVh();mark();
})(window);
