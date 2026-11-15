/* SM EDUCATION — engine-bridge: يوجّه أسئلة الرياضيات الصريحة (اشتقاق، تكامل، معادلات، حساب) إلى SM_ENGINE.math
   محلياً وبلا إنترنت، ويمرّر كل ما عداه دون أي تغيير. يلفّ fetch لمسار /api/v1/ai/(tutor|chat). */
(function(g){'use strict';
 const TUTOR=/\/api\/v1\/ai\/(tutor|chat)$/,_fetch=g.fetch?g.fetch.bind(g):null;
 if(!_fetch||g.__SM_ENGINE_BRIDGE)return;g.__SM_ENGINE_BRIDGE=true;
 const AD='٠١٢٣٤٥٦٧٨٩',FN=new Set(['sin','cos','exp','ln','sqrt']);
 const norm=s=>String(s==null?'':s).replace(/[٠-٩]/g,d=>AD.indexOf(d)).replace(/[٫]/g,'.').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/[−–]/g,'-')
  .replace(/²/g,'^2').replace(/³/g,'^3').replace(/[؟?!؛:،]+/g,' ').replace(/\s+/g,' ').trim();
 const NUM='-?\\d+(?:\\.\\d+)?';
 const KD=/(اشتق|مشتق|derivative|d[ée]riv|f\s*'\s*\(x\))/i,KI=/(تكامل|أصلية|اصلية|primitive|integr|∫)/i,KS=/(^|\s)(حل|حلّ|solve|r[ée]soudre|résous)(\s|$)/i,KC=/(احسب|calcul|compute|evaluate)/i;
 function cleanExpr(s){
  s=s.replace(/[A-Za-z]\s*\(\s*x\s*\)\s*=/g,' ').replace(/[\u0600-\u06FF]+/g,' ');
  s=s.replace(/[A-Za-z]{2,}/g,w=>FN.has(w.toLowerCase())?w:' ').replace(/\s+/g,' ').trim().replace(/^[=,.\s]+|[=,.\s]+$/g,'');
  return /^[0-9xX+\-*\/^().\sa-z]+$/.test(s)&&/[x\d]/i.test(s)?s.replace(/X/g,'x'):null}
 const after=(q,re)=>{const m=q.match(re);return m?q.slice(m.index+m[0].length):q};
 const frac=v=>{for(let d=1;d<=12;d++){const n=Math.round(v*d);if(Math.abs(v-n/d)<1e-8)return d===1?String(n):'('+n+'/'+d+')'}return null};
 const pretty=s=>String(s).replace(/ \* /g,'·').replace(/\d+\.\d{6,}/g,x=>frac(+x)||x).replace(/\^(\d)/g,(m,d)=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
 const rnd=v=>{if(!Number.isFinite(v))return String(v);const r=Math.round(v);return Math.abs(v-r)<1e-6?String(r):String(+v.toFixed(6))};
 const steps=a=>(a&&a.length?'\n\n**الخطوات:**\n'+a.map((x,i)=>(i+1)+'. '+x).join('\n'):'');
 const FOOT='\n\n🧮 حُسب محلياً بمحرك الرياضيات دون إنترنت.';
 function solve(raw){
  const E=g.SM_ENGINE&&g.SM_ENGINE.math;if(!E)return null;
  const q=norm(raw);if(!q||q.length>300)return null;const S=E.symbolic;let m;
  if(KI.test(q)){
   const b=q.match(new RegExp('(?:من|from|de|entre)\\s*('+NUM+')\\s*(?:إلى|الى|to|à|a|et|and)\\s*('+NUM+')','i'));
   const body=cleanExpr(after(b?q.replace(b[0],' '):q,KI));if(!body||!/x/i.test(body))return null;
   const ind=S.integrate(body);
   if(b){const lo=+b[1],hi=+b[2],d=S.definiteIntegral(body,lo,hi);
    return '📐 **التكامل المحدد** ∫ من '+lo+' إلى '+hi+' للدالة '+pretty(body)+'\n\nالدالة الأصلية: '+pretty(ind.antiderivative)+'\n\n**النتيجة: '+rnd(d.value)+'**'+steps(ind.steps)+FOOT}
   return '📐 **الدالة الأصلية** للدالة '+pretty(body)+'\n\n**'+pretty(ind.antiderivative)+'**'+steps(ind.steps)+FOOT}
  if(KD.test(q)){const body=cleanExpr(after(q,KD));if(!body||!/x/i.test(body))return null;const d=S.derivative(body);
   return '📐 **المشتقة** للدالة '+pretty(body)+'\n\n**f′(x) = '+pretty(d.derivative)+'**'+steps(d.steps)+(/sin|cos/i.test(body)?'\n\nملاحظة: الدوال المثلثية بالراديان.':'')+FOOT}
  m=q.match(/([0-9xX+\-*\/^().\s]+=[0-9xX+\-*\/^().\s]+)/);
  if(m&&/x/i.test(m[1])&&(KS.test(q)||/^[0-9xX+\-*\/^().=\s]+$/.test(q))){
   const eq=m[1].replace(/X/g,'x').trim();let r;
   try{r=E.solveLinear(eq);if(r&&r.kind==='solution')return '📐 **حل المعادلة** '+pretty(eq)+'\n\n**x = '+r.exact+'**'+steps(r.steps)+FOOT}catch(e){}
   r=E.solvePolynomial(eq);const roots=r&&r.roots;if(!roots)return null;
   return '📐 **حل المعادلة** '+pretty(eq)+'\n\n**'+(roots.length?roots.map((v,i)=>'x'+(roots.length>1?(i+1):'')+' = '+rnd(v)).join('،  '):'لا حلول حقيقية')+'**'+steps(r.steps)+FOOT}
  if(KC.test(q)||/^[\d+\-*\/().\s]+$/.test(q)){const e=cleanExpr(after(q,KC));
   if(e&&/\d\s*[+\-*\/^]\s*\(?\d/.test(e)&&!/x/i.test(e)){const v=E.evaluate(e);return '📐 **'+e+' = '+rnd(v)+'**'+FOOT}}
  return null}
 g.SM_ENGINE_BRIDGE={solve,norm,cleanExpr};
 g.fetch=async function(input,init){
  try{
   let url='';try{url=typeof input==='string'?input:(input&&input.url)||''}catch(e){}
   if(TUTOR.test(url.split('?')[0])&&init&&init.body){
    const p=JSON.parse(init.body);
    if(p.strict_json!==true&&!(Array.isArray(p.vision_images)&&p.vision_images.length)&&p.task!=='evaluate'&&p.task!=='practice'){
     const a=solve(p.message);
     if(a){const body=JSON.stringify({mode:'local',task:p.task||'lesson',answer:a,remaining:null});
      return typeof g.Response==='function'?new g.Response(body,{status:200,headers:{'Content-Type':'application/json'}}):{ok:true,status:200,json:async()=>JSON.parse(body),text:async()=>body}}}}
  }catch(e){}
  return _fetch(input,init)};
})(typeof window!=='undefined'?window:globalThis);
