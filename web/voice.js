/* v2.9.45 — Voice: microphone dictation + read-aloud, in the smart teacher chat and in the translator.
   Dictation: records on the device, converts to 16 kHz WAV, and sends the audio to Gemini (key rotation) only when the user taps the mic.
   Falls back to the browser's SpeechRecognition when no Gemini key is saved and the browser has it.
   Read-aloud: the device's own speech synthesis (no data leaves the phone). */
(function(){
'use strict';
const g=window,d=document;
const L=()=>{try{return typeof lang!=='undefined'?lang:'ar'}catch(e){return 'ar'}};
const tr=(ar,fr,en)=>L()==='ar'?ar:L()==='fr'?fr:en;
const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
const VOICE={ar:'ar-SA',fr:'fr-FR',en:'en-US',es:'es-ES',de:'de-DE'};
const AUTO='smVoiceAutoRead',MAX_SEC=60;
const store={get:k=>{try{return localStorage.getItem(k)||''}catch(e){return ''}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};

/* ---------- helpers (also exposed for tests) ---------- */
function clean(t){return String(t||'').replace(/```[\s\S]*?```/g,' ').replace(/<[^>]+>/g,' ').replace(/[*_#>`~|$\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,3000)}
function guess(text,fallback){const t=String(text||'');const ar=(t.match(/[\u0600-\u06FF]/g)||[]).length,lat=(t.match(/[A-Za-z\u00C0-\u00FF]/g)||[]).length;if(ar>lat)return 'ar';if(lat>ar){const f=fallback||L();return f==='ar'?'fr':f}return fallback||L()}
function encodeWav(f32,rate){
 const n=f32.length,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
 const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
 w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){const x=Math.max(-1,Math.min(1,f32[i]));v.setInt16(44+i*2,x<0?x*0x8000:x*0x7FFF,true)}
 return new Uint8Array(buf);
}
async function toWav16k(blob){
 const buf=await blob.arrayBuffer(),AC=g.AudioContext||g.webkitAudioContext,ctx=new AC();let ab;
 try{ab=await new Promise((res,rej)=>{const p=ctx.decodeAudioData(buf,res,rej);if(p&&p.catch)p.catch(rej)})}finally{try{ctx.close()}catch(e){}}
 const rate=16000,OAC=g.OfflineAudioContext||g.webkitOfflineAudioContext,oc=new OAC(1,Math.max(1,Math.ceil(ab.duration*rate)),rate);
 const src=oc.createBufferSource();src.buffer=ab;src.connect(oc.destination);src.start();
 const out=await oc.startRendering();
 return encodeWav(out.getChannelData(0),rate);
}
function b64(u8){let s='';const k=0x8000;for(let i=0;i<u8.length;i+=k)s+=String.fromCharCode.apply(null,u8.subarray(i,i+k));return btoa(s)}

/* ---------- read aloud ---------- */
let speakingBtn=null;
function stopSpeak(){try{g.speechSynthesis&&speechSynthesis.cancel()}catch(e){}if(speakingBtn){speakingBtn.classList.remove('on');speakingBtn=null}}
function speak(text,lg,btn){
 if(!g.speechSynthesis||!g.SpeechSynthesisUtterance){say(tr('القراءة الصوتية غير متاحة على هذا الجهاز','Lecture vocale indisponible sur cet appareil','Read-aloud is not available on this device'));return false}
 if(btn&&speakingBtn===btn){stopSpeak();return false}
 stopSpeak();
 const t=clean(text);if(!t)return false;
 const lg2=lg||guess(t),parts=t.match(/[^.!?؟۔\n]{1,400}[.!?؟۔]?/g)||[t];
 if(btn){btn.classList.add('on');speakingBtn=btn}
 parts.forEach((p,i)=>{const u=new SpeechSynthesisUtterance(p.trim());u.lang=VOICE[lg2]||'en-US';u.rate=0.95;
  if(i===parts.length-1)u.onend=u.onerror=()=>{if(speakingBtn===btn&&btn){btn.classList.remove('on');speakingBtn=null}};
  speechSynthesis.speak(u)});
 return true;
}

/* ---------- dictation ---------- */
let rec=null;
function mkBtn(id,label,title){const b=d.createElement('button');b.type='button';b.id=id;b.className='v243-btn';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);return b}
function setState(btn,st){if(!btn)return;btn.classList.toggle('rec',st==='rec');btn.classList.toggle('busy',st==='busy');btn.textContent=st==='rec'?'⏹':st==='busy'?'⏳':'🎤'}
function engine(){
 if(g.SM_AI&&g.SM_AI.enabled&&g.SM_AI.enabled()&&g.SM_AI.transcribe&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&g.MediaRecorder&&(g.AudioContext||g.webkitAudioContext))return 'gemini';
 if(g.SpeechRecognition||g.webkitSpeechRecognition)return 'sr';
 return '';
}
function stopRec(){
 if(!rec)return;
 const r=rec;
 if(r.timer)clearTimeout(r.timer);
 try{if(r.sr)r.sr.stop();else if(r.mr&&r.mr.state!=='inactive')r.mr.stop()}catch(e){}
}
async function toggleMic(btn,onText,hint){
 if(rec){stopRec();return}
 stopSpeak();
 const eng=engine();
 if(!eng){say(tr('الإملاء الصوتي يحتاج مفتاح Gemini (في إعدادات المعلم الذكي)','La dictée vocale nécessite une clé Gemini (réglages du tuteur)','Voice dictation needs a Gemini key (in the teacher settings)'));return}
 if(eng==='sr'){
  const SR=g.SpeechRecognition||g.webkitSpeechRecognition,r=new SR();
  r.lang=VOICE[hint]||VOICE[L()]||'ar-SA';r.interimResults=false;r.maxAlternatives=1;
  r.onresult=e=>{const t=Array.from(e.results).map(x=>x[0].transcript).join(' ').trim();if(t)onText(t)};
  r.onerror=e=>{say(tr('تعذر الإملاء الصوتي: ','Dictée impossible : ','Dictation failed: ')+(e&&e.error||''))};
  r.onend=()=>{setState(btn,'');rec=null};
  try{r.start();rec={sr:r,btn};setState(btn,'rec')}catch(e){setState(btn,'');rec=null}
  return;
 }
 let stream;
 try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}
 catch(e){say(tr('لم يُسمح باستعمال الميكروفون. فعّل إذن الميكروفون للتطبيق من إعدادات الهاتف.','Micro refusé. Autorisez le micro pour l’application dans les réglages du téléphone.','Microphone blocked. Allow the microphone for the app in the phone settings.'));return}
 const chunks=[];let mr;
 try{mr=new MediaRecorder(stream)}catch(e){stream.getTracks().forEach(t=>t.stop());say(tr('التسجيل غير مدعوم على هذا الجهاز','Enregistrement non pris en charge','Recording is not supported on this device'));return}
 mr.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
 mr.onstop=async()=>{
  stream.getTracks().forEach(t=>t.stop());
  if(rec&&rec.timer)clearTimeout(rec.timer);
  setState(btn,'busy');
  try{
   if(!chunks.length)throw new Error('empty');
   const wav=await toWav16k(new Blob(chunks,{type:mr.mimeType||'audio/webm'}));
   const res=await g.SM_AI.transcribe(b64(wav),'audio/wav');
   if(res.ok&&res.text)onText(res.text);
   else say(res.ok?tr('لم أسمع كلاماً، حاول مجدداً','Aucune parole détectée','No speech detected'):(res.detail||tr('تعذر التفريغ الصوتي','Transcription impossible','Transcription failed')));
  }catch(e){say(tr('تعذر معالجة التسجيل','Traitement de l’audio impossible','Could not process the recording'))}
  finally{setState(btn,'');rec=null}
 };
 mr.start();
 rec={mr,btn,timer:setTimeout(stopRec,MAX_SEC*1000)};
 setState(btn,'rec');
}

/* ---------- teacher chat ---------- */
function autoOn(){return store.get(AUTO)==='1'}
function updateAuto(b){b.textContent=autoOn()?'🔊':'🔇';b.classList.toggle('on',autoOn());b.title=autoOn()?tr('القراءة التلقائية للردود: مفعّلة','Lecture automatique : activée','Auto-read: on'):tr('القراءة التلقائية للردود: متوقفة','Lecture automatique : désactivée','Auto-read: off')}
function scan(){
 const row=d.querySelector('.v240-inputrow');
 if(row&&!d.getElementById('v243Mic')){
  const mic=mkBtn('v243Mic','🎤',tr('إملاء صوتي','Dictée vocale','Voice dictation'));
  mic.onclick=()=>toggleMic(mic,t=>{const i=d.getElementById('chatInput');if(!i)return;i.value=(i.value?i.value+' ':'')+t;i.dispatchEvent(new Event('input',{bubbles:true}));i.focus()},L());
  const au=mkBtn('v243Auto','🔇','');updateAuto(au);au.onclick=()=>{store.set(AUTO,autoOn()?'0':'1');updateAuto(au);if(!autoOn())stopSpeak()};
  const send=row.querySelector('.v240-send');row.insertBefore(au,send||null);row.insertBefore(mic,au);
 }
 const box=d.getElementById('messages');if(!box)return;
 const fresh=[],seeded=box.dataset.v243seed==='1';
 box.querySelectorAll('.message.bot').forEach(m=>{
  if(m.classList.contains('typing')||m.querySelector('.v243-speak')||m.dataset.v243)return;
  const body=m.querySelector('.msg-body')||m;if(!clean(body.textContent))return;
  m.dataset.v243='1';
  const b=d.createElement('button');b.type='button';b.className='v243-speak';b.textContent='🔊';b.title=tr('استمع','Écouter','Listen');b.setAttribute('aria-label',b.title);
  b.onclick=()=>speak(body.textContent,guess(body.textContent),b);m.appendChild(b);
  if(seeded)fresh.push([body,b]);
 });
 box.dataset.v243seed='1';
 if(fresh.length&&autoOn()){const [body,b]=fresh[fresh.length-1];speak(body.textContent,guess(body.textContent),b)}
}

/* ---------- translator ---------- */
function scanTranslator(){
 const inp=d.getElementById('trIn');
 if(inp&&!d.getElementById('v243TrMic')){
  const mic=mkBtn('v243TrMic','🎤',tr('إملاء صوتي','Dictée vocale','Voice dictation'));
  mic.style.marginTop='6px';
  mic.onclick=()=>toggleMic(mic,t=>{inp.value=(inp.value?inp.value+' ':'')+t;inp.dispatchEvent(new Event('input',{bubbles:true}));inp.focus()},(d.getElementById('trFrom')||{}).value==='auto'?L():(d.getElementById('trFrom')||{}).value);
  const listen=mkBtn('v243TrListen','🔊',tr('استمع إلى النص الأصلي','Écouter le texte source','Listen to the source text'));listen.style.margin='6px 6px 0 0';
  listen.onclick=()=>{const f=(d.getElementById('trFrom')||{}).value;speak(inp.value,f&&f!=='auto'?f:guess(inp.value),listen)};
  inp.insertAdjacentElement('afterend',listen);listen.insertAdjacentElement('afterend',mic);
 }
 const out=d.getElementById('trFileOutput');
 if(out&&!d.getElementById('v243TrFileSpeak')){
  const b=mkBtn('v243TrFileSpeak','🔊',tr('استمع إلى الترجمة','Écouter la traduction','Listen to the translation'));b.style.margin='6px 0';
  b.onclick=()=>{const to=(d.getElementById('trFileTo')||{}).value;speak(out.textContent,to||guess(out.textContent),b)};
  out.insertAdjacentElement('beforebegin',b);
 }
}

/* ---------- boot ---------- */
const css=d.createElement('style');
css.textContent='.v243-btn,.v243-speak{border:0;border-radius:50%;background:var(--soft,#eef2ff);cursor:pointer;font-size:18px;width:40px;height:40px;line-height:1;flex:0 0 auto}.v243-btn.rec{background:#e53935;color:#fff;animation:v243p 1s infinite}.v243-btn.busy{opacity:.6}.v243-btn.on,.v243-speak.on{outline:2px solid #1d4ed8}.v243-speak{width:30px;height:30px;font-size:14px;margin-top:6px;display:block}@keyframes v243p{50%{opacity:.55}}';
d.head.appendChild(css);
let tm=null;const run=()=>{tm=null;try{scan();scanTranslator()}catch(e){}};
new MutationObserver(()=>{if(!tm)tm=setTimeout(run,250)}).observe(d.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
run();
g.SMVoice={clean,guess,encodeWav,speak};
})();
