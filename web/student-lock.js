/* SM EDUCATION — وضع التلميذ: قفل المستوى + رمز الأولياء (محلي). */
(function(){'use strict';
 const K={lock:'smStudentLock',pin:'smStudentPinHash',name:'smStudentName',photo:'smStudentPhoto'};
 const get=k=>{try{return localStorage.getItem(k)||''}catch(e){return ''}};
 const set=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
 const locked=()=>get(K.lock)==='1';
 const say=m=>{try{if(typeof toast==='function')toast(m)}catch(e){}};
 const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function hash(p){try{const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('sm-edu:'+p));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return 'b:'+btoa(unescape(encodeURIComponent(p)))}}
 ['setGrade','selectLearner','showGrades'].forEach(n=>{const f=window[n];if(typeof f!=='function'||f.__orig)return;const w=function(){if(locked()){say('🔒 المستوى مقفل — يلزم رمز الأولياء');return}return f.apply(this,arguments)};w.__orig=f;window[n]=w});

 function shrink(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const S=160,c=document.createElement('canvas');c.width=c.height=S;const m=Math.min(im.width,im.height);c.getContext('2d').drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,S,S);res(c.toDataURL('image/jpeg',0.8))};im.onerror=rej;im.src=r.result};r.onerror=rej;r.readAsDataURL(file)})}
 function sideCard(){
  const a=document.querySelector('.profile-mini .avatar'),b=document.querySelector('.profile-mini b');
  const ph=get(K.photo),nm=get(K.name);
  if(a&&ph)a.innerHTML='<img src="'+ph+'" alt="" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;display:block">';
  if(b&&nm)b.textContent=nm;
 }
 function apply(){sideCard();const s=document.getElementById('gradeSwitch');if(s)s.disabled=locked();const b=document.getElementById('smStudentBtn');if(b){const ph=get(K.photo);b.innerHTML=(ph?'<img src="'+ph+'" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-inline-end:6px">':'')+esc(locked()?('🔒 وضع التلميذ'+(get(K.name)?' — '+get(K.name):'')):'👤 تفعيل وضع التلميذ')}}
 function openDlg(){
  const old=document.getElementById('smStudentDlg');if(old)old.remove();
  const o=document.createElement('div');o.id='smStudentDlg';o.dir='rtl';
  o.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(11,30,51,.6);display:flex;align-items:center;justify-content:center;padding:16px';
  const lv=(typeof levels!=='undefined')?levels:{};
  const cur=(typeof level!=='undefined'?level:'')+'|'+(typeof grade!=='undefined'?grade:'');
  const opts=Object.keys(lv).map(g=>lv[g].map(n=>'<option value="'+esc(g)+'|'+esc(n)+'"'+(g+'|'+n===cur?' selected':'')+'>'+esc(n)+'</option>').join('')).join('');
  const st='width:100%;padding:12px;margin:6px 0 12px;border:1px solid #cbd5e1;border-radius:12px;font-size:16px;box-sizing:border-box';
  const btn='width:100%;padding:12px;border:0;border-radius:12px;font-size:16px;margin-top:6px;';
  const pin='<input id="smPin" type="password" inputmode="numeric" maxlength="6" style="'+st+'">';
  const ph0=get(K.photo);
  const photoBox='<div style="text-align:center"><img id="smPh" src="'+ph0+'" alt="" style="width:84px;height:84px;border-radius:50%;object-fit:cover;background:#e2e8f0;display:'+(ph0?'inline-block':'none')+'"><div><label style="display:inline-block;margin:8px 0;padding:8px 14px;border-radius:12px;background:#eef2f7;cursor:pointer">📷 صورة التلميذ<input id="smFile" type="file" accept="image/*" style="display:none"></label></div></div>';
  const body=locked()
   ?'<h3>🔒 وضع التلميذ مفعّل</h3>'+photoBox+'<p>أدخل رمز الأولياء لعرض كل المستويات.</p>'+pin
   :'<h3>👤 وضع التلميذ</h3>'+photoBox+'<label>اسم التلميذ</label><input id="smNm" value="'+esc(get(K.name))+'" style="'+st+'"><label>السنة الدراسية</label><select id="smLv" style="'+st+'">'+opts+'</select><label>رمز الأولياء (4 إلى 6 أرقام)</label>'+pin;
  o.innerHTML='<div style="background:#fff;color:#172b4d;border-radius:18px;padding:20px;width:100%;max-width:380px">'+body+'<div id="smMsg" style="color:#b42318;min-height:20px;font-size:14px"></div><button id="smOk" style="'+btn+'background:#2463eb;color:#fff">'+(locked()?'فتح وضع الأولياء':'تفعيل وضع التلميذ')+'</button><button id="smNo" style="'+btn+'background:#eef2f7;color:#172b4d">إلغاء</button></div>';
  document.body.appendChild(o);
  const $=id=>o.querySelector('#'+id),msg=t=>{$('smMsg').textContent=t};
  $('smNo').onclick=()=>o.remove();
  $('smFile').onchange=async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;try{const d=await shrink(f);set(K.photo,d);const im=$('smPh');im.src=d;im.style.display='inline-block';apply()}catch(x){msg('تعذر قراءة الصورة')}};
  $('smOk').onclick=async()=>{
   const p=$('smPin').value.trim();
   if(locked()){if(await hash(p)!==get(K.pin)){msg('الرمز غير صحيح');return}set(K.lock,'0');apply();say('تم فتح وضع الأولياء');o.remove();return}
   if(!/^\d{4,6}$/.test(p)){msg('أدخل رمزاً من 4 إلى 6 أرقام');return}
   const nm=$('smNm').value.trim();if(!nm){msg('أدخل اسم التلميذ');return}
   const [g,n]=$('smLv').value.split('|');
   try{window.setGrade.__orig(g,n)}catch(e){}
   try{const c=activeLearner();saveLearners(getLearners().map(x=>x.id===c.id?Object.assign({},x,{name:nm}):x))}catch(e){}
   set(K.name,nm);set(K.pin,await hash(p));set(K.lock,'1');apply();say('🔒 '+nm);o.remove()};
 }
 function init(){
  const bar=document.getElementById('gradeBar');if(!bar||document.getElementById('smStudentBtn'))return;
  const b=document.createElement('button');b.id='smStudentBtn';b.type='button';b.className='secondary-btn';b.style.marginTop='8px';b.onclick=openDlg;bar.appendChild(b);
  const r=window.render;if(typeof r==='function'&&!r.__sl){const w=function(){const x=r.apply(this,arguments);apply();return x};w.__sl=true;window.render=w}
  apply();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
