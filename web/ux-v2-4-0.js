/* SM éducation v2.4.0 — chat-style AI tutor, exercise bank upgrades, simpler navigation.
   Loaded last: it wraps tutor(), appendMessage(), exerciseBankHomePage() and testBankHomePage(). */
(function(){
 'use strict';
 const cur=()=>{try{return typeof lang!=='undefined'?lang:'ar'}catch(e){return 'ar'}};
 const tr=(a,f,e)=>{const l=cur();return l==='fr'?f:l==='en'?e:a};
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const gradeNow=()=>{try{return typeof grade!=='undefined'?grade:''}catch(e){return ''}};
 const records=()=>{try{return typeof exerciseBankRecords!=='undefined'&&Array.isArray(exerciseBankRecords)?exerciseBankRecords:[]}catch(e){return []}};
 const hasDom=typeof document!=='undefined';

 /* ---------- 1) Chat: safe lightweight formatting (escape first, then allow a few tags) ---------- */
 const inline=s=>s.replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*\n]*)\*(?=[\s).,!?؟،:;]|$)/g,'$1<em>$2</em>');
 window.sm240FormatChat=function(text){
  const lines=String(text==null?'':text).replace(/\r\n?/g,'\n').split('\n');
  let out='',list=null;const close=()=>{if(list){out+='</'+list+'>';list=null}};
  for(const raw of lines){
   const line=esc(raw);let m;
   if((m=line.match(/^\s*[-•*]\s+(.*)$/))){if(list!=='ul'){close();out+='<ul>';list='ul'}out+='<li>'+inline(m[1])+'</li>';continue}
   if((m=line.match(/^\s*(\d{1,2})[.)]\s+(.*)$/))){if(list!=='ol'){close();out+='<ol>';list='ol'}out+='<li>'+inline(m[2])+'</li>';continue}
   close();
   if((m=line.match(/^\s*#{1,4}\s+(.*)$/))){out+='<p class="msg-h"><strong>'+inline(m[1])+'</strong></p>';continue}
   if(!line.trim()){out+='<div class="msg-gap"></div>';continue}
   out+='<p>'+inline(line)+'</p>';
  }
  close();
  const gap='<div class="msg-gap"></div>';
  out=out.split(gap+gap).join(gap);while(out.startsWith(gap))out=out.slice(gap.length);while(out.endsWith(gap))out=out.slice(0,-gap.length);
  return out;
 };
 const clock=at=>{try{const d=at?new Date(at):new Date();if(isNaN(d))return '';return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}catch(e){return ''}};
 const msgHtml=(text,who,at)=>`<div class="message ${who}"><div class="msg-body">${who==='bot'?window.sm240FormatChat(text):esc(text)}</div><time>${esc(clock(at))}</time></div>`;

 const oldTutor=window.tutor;
 function chatHtml(){
  const learner=activeLearner(),rows=readTutorHistory();
  const subj=typeof subjectsForCurrentGrade==='function'?subjectsForCurrentGrade():[];
  const modes=[['lesson',tr('شرح درس','Expliquer','Explain')],['practice',tr('5 تمارين','5 exercices','5 questions')],['evaluate',tr('تصحيح إجابتي','Corriger','Check my answer')]];
  const status=typeof smAiStatusCard==='function'?smAiStatusCard():'';
  const server=typeof tutorServerPanel==='function'?tutorServerPanel():'';
  const badge=typeof smAiBadge==='function'?smAiBadge():'';
  const privacy=tr('عند تفعيل Groq يُرسل السؤال وملخص الأداء التعليمي مباشرة إلى Groq؛ لا يُرسل اسم الطفل.','Avec Groq, la question et un résumé des résultats sont envoyés directement à Groq ; le nom de l’élève n’est pas transmis.','When Groq is enabled, the question and a learning summary are sent directly to Groq; the learner name is not sent.');
  const suggestions=rows.length?'':`<div class="v240-suggest" id="v240Suggest">${[
   ['lesson',tr('اشرح لي درساً من الصفر','Explique-moi une leçon depuis zéro','Explain a lesson from scratch')],
   ['practice',tr('أعطني 5 تمارين مع الحل','Donne-moi 5 exercices corrigés','Give me 5 questions with answers')],
   ['evaluate',tr('صحّح إجابتي','Corrige ma réponse','Check my answer')]
  ].map(([m,txt])=>`<button type="button" class="v240-chip" data-mode="${m}" data-text="${esc(txt)}">${esc(txt)}</button>`).join('')}</div>`;
  return `<section class="v240-chat" aria-label="${esc(t('ai'))}">
<header class="v240-chat-head"><div class="avatar" aria-hidden="true">✧</div><div class="v240-head-text"><b>${esc(t('ai'))}</b><small>${esc(learner.name)} · ${esc(gradeNow())} ${badge}</small></div><label class="v240-subject"><span class="sr-only">${tr('المادة','Matière','Subject')}</span><select id="tutorSubject">${subj.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label><button type="button" class="icon-btn" onclick="clearTutorHistory()" title="${tr('مسح المحادثة','Effacer la conversation','Clear conversation')}" aria-label="${tr('مسح المحادثة','Effacer la conversation','Clear conversation')}">🗑</button></header>
<details class="v240-settings"><summary>⚙ ${tr('إعدادات المساعد','Réglages de l’assistant','Assistant settings')}</summary>${status}${server}<p class="v240-privacy">${privacy}</p></details>
<div class="v240-msgs" id="messages" role="log" aria-live="polite"><div class="message bot"><div class="msg-body">${window.sm240FormatChat(t('aiWelcome'))}</div></div>${rows.map(x=>msgHtml(x.question,'user',x.at)+msgHtml(x.answer,'bot',x.at)).join('')}</div>
${suggestions}
<form class="v240-compose" id="chatForm" autocomplete="off">
<div class="v240-modes" role="radiogroup" aria-label="${tr('نوع المساعدة','Type d’aide','Help mode')}">${modes.map(([m,l],i)=>`<button type="button" role="radio" aria-checked="${i===0}" class="v240-mode${i===0?' on':''}" data-mode="${m}">${esc(l)}</button>`).join('')}</div>
<select id="tutorTask" hidden aria-hidden="true" tabindex="-1">${modes.map(([m,l])=>`<option value="${m}">${esc(l)}</option>`).join('')}</select>
<textarea id="studentAnswer" class="tutor-answer" rows="3" hidden placeholder="${tr('اكتب إجابتك هنا (مطلوب للتصحيح)','Saisissez votre réponse (requise)','Enter your answer (required)')}"></textarea>
<div class="v240-inputrow"><textarea id="chatInput" rows="1" required placeholder="${tr('اكتب اسم الدرس أو سؤالك','Saisissez le sujet ou la question','Type a topic or a question')}"></textarea><button class="v240-send" type="submit" aria-label="${esc(t('send'))}" title="${esc(t('send'))}"><span aria-hidden="true">➤</span></button></div>
</form></section>`;
 }
 window.tutor=function(){try{return chatHtml()}catch(e){return typeof oldTutor==='function'?oldTutor.apply(this,arguments):''}};

 const THINK=()=>['جارٍ التفكير...','Réflexion...','Thinking...'];
 window.appendMessage=function(text,who,actions){
  if(!hasDom)return null;
  const box=document.getElementById('messages');if(!box)return document.createElement('div');
  if(who==='user'){const s=document.getElementById('v240Suggest');if(s)s.remove()}
  const el=document.createElement('div');el.className='message '+who;
  const body=document.createElement('div');body.className='msg-body';
  const thinking=who==='bot'&&THINK().includes(text);
  if(thinking){el.classList.add('typing');body.innerHTML='<span class="v240-dots" role="status" aria-label="'+esc(text)+'"><i></i><i></i><i></i></span>'}
  else if(who==='bot')body.innerHTML=window.sm240FormatChat(text);
  else body.textContent=text;
  el.appendChild(body);
  if(!thinking){const tm=document.createElement('time');tm.textContent=clock();el.appendChild(tm)}
  if(actions&&!thinking){
   const tools=document.createElement('div');tools.className='message-tools';
   const copy=document.createElement('button');copy.type='button';copy.textContent=tr('نسخ','Copier','Copy');
   copy.onclick=()=>{try{navigator.clipboard.writeText(text).then(()=>toast(tr('تم النسخ','Copié','Copied'))).catch(()=>toast(tr('تعذر النسخ','Échec de la copie','Copy failed')))}catch(e){}};
   const retry=document.createElement('button');retry.type='button';retry.textContent=tr('إعادة المحاولة','Réessayer','Retry');
   retry.onclick=()=>{try{if(lastQuestion){const i=document.getElementById('chatInput');if(i)i.value=lastQuestion;sendChat({preventDefault(){}})}}catch(e){}};
   tools.appendChild(copy);tools.appendChild(retry);el.appendChild(tools);
  }
  box.appendChild(el);box.scrollTop=box.scrollHeight;return el;
 };

 /* ---------- 2) Exercise bank ---------- */
 const shuffle=a=>{const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]]}return r};
 /* round-robin across subjects so a mixed session covers as many subjects as possible */
 window.sm240MixedPick=function(rows,n){
  const by={};(rows||[]).forEach(r=>{(by[r.subject]=by[r.subject]||[]).push(r)});
  const subs=shuffle(Object.keys(by));subs.forEach(s=>{by[s]=shuffle(by[s])});
  const out=[];let i=0;
  while(out.length<(n||10)&&subs.some(s=>by[s].length)){const s=subs[i%subs.length];if(by[s].length)out.push(by[s].pop());i++}
  return out;
 };
 window.sm240Mastery=function(items,g){
  const m={};(items||[]).forEach(x=>{if(!x||x.grade!==g||x.mode!=='exercises')return;const v=m[x.subject]||(m[x.subject]={correct:0,total:0,pct:0});v.correct+=x.correct||0;v.total+=x.total||0});
  Object.values(m).forEach(v=>{v.pct=v.total?Math.round(v.correct/v.total*100):0});return m;
 };
 const mistakesCount=s=>{try{const v=JSON.parse(localStorage.getItem('smSchoolExerciseMistakes:'+gradeNow()+':'+s)||'[]');return Array.isArray(v)?v.length:0}catch(e){return 0}};
 const toItem=x=>({q:x.question,choices:x.choices,a:x.answer_index,why:x.explanation,solution:x.solution,solution_steps:x.solution_steps,id:x.id,topic:x.topic,lesson:x.lesson,difficulty:x.difficulty,term:x.term,question_type:x.question_type,accepted_answers:x.accepted_answers,cognitive_process:x.cognitive_process,estimated_minutes:x.estimated_minutes});
 window.sm240QuickPractice=function(){
  const rows=records().filter(x=>x.grade===gradeNow());if(!rows.length)return;
  const mapped=window.sm240MixedPick(rows,10).map(toItem);
  exerciseBankSubject=tr('تدريب مختلط','Entraînement mixte','Mixed practice');
  window.currentPractice={items:mapped,mode:'exercises',subject:exerciseBankSubject,answered:{},results:{},grade:gradeNow()};
  startExerciseSession('random');
  if(hasDom)document.querySelectorAll('#pageContent button').forEach(b=>{if((b.getAttribute('onclick')||'').indexOf('renderExerciseBank(exerciseBankSubject)')===0)b.setAttribute('onclick','renderExerciseBankHome()')});
 };
 const seg=active=>`<nav class="v240-seg" aria-label="${tr('التمارين والاختبارات','Exercices et tests','Exercises and tests')}"><button type="button" class="${active==='exercises'?'on':''}" onclick="go('exercises')" ${active==='exercises'?'aria-current="page"':''}>✎ ${tr('بنك التمارين','Exercices','Exercises')}</button><button type="button" class="${active==='tests'?'on':''}" onclick="go('tests')" ${active==='tests'?'aria-current="page"':''}>▣ ${tr('بنك الاختبارات','Tests','Tests')}</button></nav>`;
 const prevHome=window.exerciseBankHomePage;
 if(typeof prevHome==='function'){
  window.exerciseBankHomePage=function(){
   let html=prevHome.apply(this,arguments);
   const g=gradeNow(),rows=records().filter(x=>x.grade===g);
   if(rows.length){
    const quick=`<section class="v240-quick panel"><div><b>⚡ ${tr('تدريب سريع','Entraînement rapide','Quick practice')}</b><small>${tr('10 أسئلة مختلطة من مواد هذه السنة','10 questions mixtes de toutes les matières','10 mixed questions across this grade’s subjects')}</small></div><button type="button" class="primary-btn" onclick="sm240QuickPractice()">${tr('ابدأ','Commencer','Start')}</button></section>`;
    html=quick+html; /* right under the exercises/tests switcher so it is visible without scrolling */
    let mastery={};try{mastery=typeof progressStats==='function'?window.sm240Mastery(progressStats().items,g):{}}catch(e){}
    const parts=html.split('<div class="subject-card"');
    for(let i=1;i<parts.length;i++){
     const m=parts[i].match(/renderExerciseBank\('((?:\\'|[^'])*)'\)/);if(!m)continue;
     const sub=m[1].replace(/\\'/g,"'"),ms=mastery[sub],rv=mistakesCount(sub);
     let badge='';
     if(ms&&ms.total)badge+=`<span class="v240-mastery" data-level="${ms.pct>=75?'hi':ms.pct>=50?'mid':'lo'}" title="${tr('نسبة الإجابات الصحيحة','Bonnes réponses','Correct answers')}">${ms.pct}%</span>`;
     if(rv)badge+=`<span class="v240-review" title="${tr('أسئلة للمراجعة','À revoir','To review')}">🔁 ${rv}</span>`;
     if(badge)parts[i]=parts[i].replace('</span></div>','</span>'+badge+'</div>');
    }
    html=parts.join('<div class="subject-card"');
   }
   return seg('exercises')+html;
  };
 }
 const prevTests=window.testBankHomePage;
 if(typeof prevTests==='function'){window.testBankHomePage=function(){return seg('tests')+prevTests.apply(this,arguments)}}

 /* ---------- 3) DOM wiring (skipped when there is no document, e.g. unit tests) ---------- */
 if(!hasDom)return;
 const $id=i=>document.getElementById(i);
 const MODE_HINT=()=>({lesson:tr('اكتب اسم الدرس أو سؤالك','Saisissez le sujet ou la question','Type a topic or a question'),practice:tr('اكتب الدرس الذي تريد تمارين عنه','Sur quelle leçon voulez-vous des exercices ?','Which lesson do you want questions on?'),evaluate:tr('اكتب السؤال، ثم إجابتك في الحقل أعلاه','Écrivez la question, puis votre réponse ci-dessus','Write the question, then your answer above')});
 function setMode(m){
  const sel=$id('tutorTask');if(!sel)return;
  sel.value=m;sel.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelectorAll('.v240-mode').forEach(b=>{const on=b.dataset.mode===m;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on))});
  const i=$id('chatInput');if(i)i.placeholder=MODE_HINT()[m]||i.placeholder;
  const a=$id('studentAnswer');if(a&&m==='evaluate')a.focus();
 }
 document.addEventListener('click',e=>{
  const mode=e.target.closest&&e.target.closest('.v240-mode');
  if(mode){setMode(mode.dataset.mode);return}
  const chip=e.target.closest&&e.target.closest('.v240-chip');
  if(chip){setMode(chip.dataset.mode);const i=$id('chatInput');if(i){i.value=chip.dataset.text||'';i.focus();i.dispatchEvent(new Event('input',{bubbles:true}))}return}
  if(e.target.closest&&e.target.closest('button[onclick^="checkOne"]'))setTimeout(updateBar,60);
 });
 document.addEventListener('keydown',e=>{
  if(e.target&&e.target.id==='chatInput'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
   const coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
   if(coarse)return;
   e.preventDefault();const f=$id('chatForm');if(f&&f.requestSubmit)f.requestSubmit();
  }
 });
 document.addEventListener('input',e=>{
  if(e.target&&e.target.id==='chatInput'){e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'}
 });
 document.addEventListener('submit',e=>{
  if(e.target&&e.target.id==='chatForm')setTimeout(()=>{const i=$id('chatInput');if(i)i.style.height='auto'},0);
 });

 /* session progress bar for exercise practice */
 function updateBar(){
  const bar=$id('v240SessionBar'),p=window.currentPractice;if(!bar||!p||!p.items)return;
  const total=p.items.length,done=Object.keys(p.results||{}).length,ok=Object.values(p.results||{}).filter(Boolean).length;
  bar.querySelector('.v240-sbar-text').textContent=tr(`${done} من ${total} · صحيحة ${ok}`,`${done} sur ${total} · ${ok} justes`,`${done} of ${total} · ${ok} correct`);
  bar.querySelector('.v240-sbar-fill').style.width=(total?Math.round(done/total*100):0)+'%';
 }
 function fit(){
  const root=document.documentElement,top=document.querySelector('.topbar'),bn=$id('bottomNav');
  const mobile=window.matchMedia&&window.matchMedia('(max-width:720px)').matches;
  const sticky=top&&['sticky','fixed'].includes(getComputedStyle(top).position);
  root.style.setProperty('--v240-sticky',(sticky&&top?top.offsetHeight:0)+'px');
  if(document.querySelector('.v240-chat')&&mobile){
   window.scrollTo(0,0);
   root.style.setProperty('--v240-top',(top?top.offsetHeight:56)+'px');
   root.style.setProperty('--v240-bottom',(bn&&getComputedStyle(bn).display!=='none'?bn.offsetHeight:0)+'px');
  }
 }
 function enhance(){
  fit();
  const p=window.currentPractice;
  if(p&&p.mode==='exercises'&&typeof page!=='undefined'&&page==='exercises'&&!$id('v240SessionBar')){
   const first=document.querySelector('#pageContent .question-card');
   if(first&&first.parentElement){
    const bar=document.createElement('div');bar.id='v240SessionBar';bar.className='v240-sbar';
    bar.innerHTML='<span class="v240-sbar-text"></span><span class="v240-sbar-track"><span class="v240-sbar-fill"></span></span>';
    first.parentElement.insertBefore(bar,first.parentElement.querySelector('.question-card'));updateBar();
   }
  }
 }
 const pc=$id('pageContent');
 if(pc&&typeof MutationObserver!=='undefined')new MutationObserver(enhance).observe(pc,{childList:true});
 window.addEventListener('resize',fit);

 /* ---------- 4) Navigation: "More" in the bottom bar opens the full menu in one tap ---------- */
 const more=$id('bnMore'),sidebar=$id('sidebar');
 const moreLabel=()=>{const s=more&&more.querySelector('small');if(s)s.textContent=tr('المزيد','Plus','More')};
 if(more&&sidebar){
  more.addEventListener('click',e=>{
   e.stopPropagation(); /* the shell's outside-click handler would otherwise close the menu we just opened */
   const open=sidebar.classList.toggle('open');
   const box=$id('navMoreBox'),tog=$id('navMoreToggle');
   if(open&&box&&box.hidden){box.hidden=false;const chev=tog&&tog.querySelector('.chev');if(chev)chev.textContent='▴'}
  });
  new MutationObserver(()=>more.setAttribute('aria-expanded',String(sidebar.classList.contains('open')))).observe(sidebar,{attributes:true,attributeFilter:['class']});
  moreLabel();
  const ls=$id('languageSelect');if(ls)ls.addEventListener('change',()=>setTimeout(moreLabel,0));
 }
 enhance();
})();
