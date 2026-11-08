/* v2.9.0 — local exam generator (no backend needed).
   1) Primary-school mathematics (1AP–5AP): unlimited exercises built on the exam patterns seen in the
      downloaded papers, with answers computed by code (never typed by hand).
   2) Any other subject: when no backend is configured, builds the paper from the built-in exercise bank.
   Output has the same shape the existing exam-builder UI already renders. */
(function(g){'use strict';
const prior=g.SM_EDUCATION_RELEASE||{};
g.SM_EDUCATION_RELEASE=Object.assign({},prior,{version:'2.9.0',focus:'local-exam-generator',features:(prior.features||[]).concat(['local-math-generator-primary','local-generator-middle-secondary','offline-exam-builder'])});

const ri=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const pick=a=>a[ri(0,a.length-1)];
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=ri(0,i);[a[i],a[j]]=[a[j],a[i]]}return a};
const gcd=(a,b)=>b?gcd(b,a%b):a;
const ltr=s=>'\u2066'+s+'\u2069';               // keep digits and operators in reading order inside Arabic text
const num=n=>String(Math.round(n*1000)/1000).replace('.',',');
const fr=(n,d)=>{const k=gcd(n,d);n/=k;d/=k;return d===1?String(n):n+'/'+d};
const sep=a=>a.join(' ، ');
const NAMES=['أحمد','سارة','ياسين','ليلى','يوسف','مريم','أنس','إيمان'];
const THINGS=[['القلم','أقلام'],['الكرّاس','كراريس'],['الكتاب','كتب']];
const EMOJI=['🍎','⭐','🎈','🐟','🌸','⚽','🚗','🍊'];
const mk=(topic,question,answer,steps,explanation)=>({topic,question,answer:String(answer),explanation:explanation||steps[steps.length-1]||'',solution_steps:steps});
const scale=(base,lv)=>base+lv*Math.round(base*0.25);
const rows=(n,fn)=>Array.from({length:n},fn);

/* ---- generators: (term 1..3, level 0..2) -> question ---- */
const G1={
 ops(t,lv){const mx=scale([10,20,30][t-1],lv);const r=rows(6,()=>{if(Math.random()<.5){const a=ri(0,mx-1),b=ri(0,mx-a);return[`${a} + ${b}`,a+b]}const a=ri(1,mx),b=ri(0,a);return[`${a} − ${b}`,a-b]});
  return mk('العمليات','أنجز العمليات: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>x[1])),r.map(x=>`${x[0]} = ${x[1]}`),'نجري كل عملية على حدة.')},
 count(t,lv){const mx=Math.min(scale([8,12,15][t-1],lv),20),n=ri(3,mx),e=pick(EMOJI);
  return mk('العدّ',`عُدّ ثم اكتب العدد: ${rows(n,()=>e).join(' ')}`,n,[`نعدّ الأشياء واحداً واحداً فنجد ${n}.`])},
 strip(t,lv){const top=scale([10,20,30][t-1],lv),s=ri(1,top-9),seq=rows(10,(_,i)=>s+i);const hid=shuffle([1,2,3,4,5,6,7,8]).slice(0,4+(lv>0?1:0)).sort((a,b)=>a-b);
  return mk('الشريط العددي','أكمل الشريط العددي: '+ltr(seq.map((v,i)=>hid.includes(i)?'…':v).join(' , ')),sep(hid.map(i=>seq[i])),[`الأعداد المتتالية تزيد بواحد: ${seq.join(' , ')}.`])},
 compare(t,lv){const mx=scale([10,20,30][t-1],lv);const r=rows(4,()=>{const a=ri(0,mx),b=Math.random()<.2?a:ri(0,mx);return[a,b,a>b?'>':a<b?'<':'=']});
  return mk('المقارنة','ضع العلامة المناسبة (>) أو (<) أو (=): '+sep(r.map(x=>ltr(`${x[0]} … ${x[1]}`))),sep(r.map(x=>x[2])),r.map(x=>`${x[0]} ${x[2]} ${x[1]}`))},
 neighbors(t,lv){const mx=scale([10,20,30][t-1],lv),ns=rows(3,()=>ri(1,mx-1));
  return mk('السابق واللاحق','اكتب العدد السابق والعدد اللاحق لكل عدد: '+sep(ns.map(String)),sep(ns.map(n=>`${n-1} و ${n+1}`)),ns.map(n=>`قبل ${n} نجد ${n-1}، وبعده ${n+1}.`))},
 decomp(t,lv){const mx=Math.min(scale([10,15,20][t-1],lv),20),r=rows(3,()=>{const T=ri(4,mx),a=ri(1,T-1);return[T,a,T-a]});
  return mk('تفكيك العدد','أكمل: '+sep(r.map(x=>ltr(`${x[0]} = ${x[1]} + …`))),sep(r.map(x=>x[2])),r.map(x=>`${x[0]} − ${x[1]} = ${x[2]}`))},
 order(t,lv){const mx=scale([10,20,30][t-1],lv),set=shuffle(rows(mx+1,(_,i)=>i)).slice(0,5),asc=Math.random()<.5,sorted=set.slice().sort((a,b)=>asc?a-b:b-a);
  return mk('الترتيب',`رتّب الأعداد ${asc?'تصاعدياً':'تنازلياً'}: ${sep(set)}`,sorted.join(' ، '),[`الترتيب ${asc?'من الأصغر إلى الأكبر':'من الأكبر إلى الأصغر'}: ${sorted.join(' ، ')}.`])}
};
const G2={
 ops(t,lv){const mx=scale([50,100,200][t-1],lv);const r=rows(4,(_,i)=>{if(i%2===0){const a=ri(10,mx-10),b=ri(5,mx-a);return[`${a} + ${b}`,a+b]}const a=ri(20,mx),b=ri(5,a);return[`${a} − ${b}`,a-b]});
  return mk('العمليات','أنجز العمليات: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>x[1])),r.map(x=>`${x[0]} = ${x[1]}`))},
 mult(t,lv){const tabs=t===1?[2,5,10]:t===2?[2,3,4,5,10]:[2,3,4,5,6,10];const r=rows(4,()=>{const a=pick(tabs),b=ri(1,lv?10:6);return[`${a} × ${b}`,a*b]});
  return mk('جدول الضرب','أنجز العمليات: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>x[1])),r.map(x=>`${x[0]} = ${x[1]}`))},
 word(t,lv){const mx=scale([50,100,200][t-1],lv),a=ri(10,mx-10),b=ri(5,mx-a),n=pick(NAMES);
  return Math.random()<.5?mk('مسألة',`كان مع ${n} ${a} دج، فأعطاه والده ${b} دج. ما مجموع ما معه الآن؟`,a+b,[`المجموع = ${a} + ${b} = ${a+b} دج.`])
   :mk('مسألة',`كان مع ${n} ${a+b} دج، فأنفق ${b} دج. كم بقي معه؟`,a,[`الباقي = ${a+b} − ${b} = ${a} دج.`])},
 compare(t,lv){const mx=scale([50,100,200][t-1],lv),set=shuffle(rows(mx,(_,i)=>i+1)).slice(0,4),asc=Math.random()<.5,s=set.slice().sort((a,b)=>asc?a-b:b-a);
  return mk('الترتيب',`رتّب الأعداد ${asc?'تصاعدياً':'تنازلياً'}: ${sep(set)}`,s.join(' ، '),[`الترتيب: ${s.join(' ، ')}.`])},
 doubles(t,lv){const mx=Math.min(scale([20,50,100][t-1],lv),100),a=ri(2,mx/2|0),b=ri(1,mx/2|0)*2;
  return mk('الضعف والنصف',`أوجد ضعف العدد ${a} ثم نصف العدد ${b}.`,`${a*2} ، ${b/2}`,[`ضعف ${a} = ${a} × 2 = ${a*2}.`,`نصف ${b} = ${b} ÷ 2 = ${b/2}.`])},
 tens(t,lv){const mx=scale([50,100,200][t-1],lv),n=ri(11,Math.min(mx,99));
  return mk('العشرات والوحدات',`فكّك العدد ${n} إلى عشرات ووحدات.`,`${Math.floor(n/10)} عشرات و ${n%10} وحدات`,[`${n} = ${Math.floor(n/10)*10} + ${n%10}.`])}
};
const G3={
 ops(t,lv){const mx=scale([500,1000,9999][t-1],lv);const r=rows(4,(_,i)=>{if(i%2===0){const a=ri(100,mx-100),b=ri(50,mx-a);return[`${a} + ${b}`,a+b]}const a=ri(200,mx),b=ri(50,a);return[`${a} − ${b}`,a-b]});
  return mk('العمليات','أنجز العمليات: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>x[1])),r.map(x=>`${x[0]} = ${x[1]}`))},
 mult(t,lv){const r=rows(4,()=>{const a=ri(2,9),b=ri(2,lv?12:9);return[`${a} × ${b}`,a*b]});
  return mk('جدول الضرب','أنجز العمليات: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>x[1])),r.map(x=>`${x[0]} = ${x[1]}`))},
 div(t,lv){const r=rows(4,()=>{const d=ri(2,9),q=ri(2,lv?12:9);return[`${d*q} ÷ ${d}`,q]});
  return mk('القسمة','أنجز القسمة: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>x[1])),r.map(x=>`${x[0]} = ${x[1]}`))},
 perim(t,lv){if(Math.random()<.5){const a=ri(3,lv?25:12);return mk('المحيط',`مربع طول ضلعه ${a} سم. احسب محيطه.`,`${a*4} سم`,[`محيط المربع = 4 × ${a} = ${a*4} سم.`])}
  const L=ri(5,lv?30:15),l=ri(2,L-1);return mk('المحيط',`مستطيل طوله ${L} سم وعرضه ${l} سم. احسب محيطه.`,`${2*(L+l)} سم`,[`المحيط = 2 × (${L} + ${l}) = 2 × ${L+l} = ${2*(L+l)} سم.`])},
 word(t,lv){const [sg,pl]=pick(THINGS),p=ri(2,lv?60:20),n=ri(3,10);
  return mk('مسألة',`ثمن ${sg} الواحد ${p} دج. ما ثمن ${n} ${pl}؟`,`${p*n} دج`,[`الثمن = ${n} × ${p} = ${p*n} دج.`])},
 time(t,lv){const h=ri(2,9),m=ri(2,6)*30;return Math.random()<.5?mk('الزمن',`حوّل ${h} ساعات إلى دقائق. (الساعة = 60 دقيقة)`,`${h*60} دقيقة`,[`${h} × 60 = ${h*60} دقيقة.`])
  :mk('الزمن',`حوّل ${m} دقيقة إلى ساعات. (الساعة = 60 دقيقة)`,`${m/60} ساعة`.replace('.',','),[`${m} ÷ 60 = ${num(m/60)} ساعة.`])}
};
const G4={
 ops(t,lv){const mx=scale([5000,50000,99999][t-1],lv);const r=rows(4,(_,i)=>{if(i%2===0){const a=ri(500,mx-500),b=ri(200,mx-a);return[`${a} + ${b}`,a+b]}const a=ri(1000,mx),b=ri(200,a);return[`${a} − ${b}`,a-b]});
  return mk('العمليات','أنجز العمليات: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>x[1])),r.map(x=>`${x[0]} = ${x[1]}`))},
 mult(t,lv){const r=rows(3,()=>{const a=lv?ri(11,99):ri(100,999),b=lv?ri(11,50):ri(2,9);return[`${a} × ${b}`,a*b]});
  return mk('الضرب','أنجز عمليات الضرب: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>x[1])),r.map(x=>`${x[0]} = ${x[1]}`))},
 div(t,lv){const d=ri(2,9),q=ri(10,lv?99:50),r0=ri(0,d-1),D=d*q+r0;
  return mk('القسمة',`أنجز القسمة الإقليدية: ${ltr(D+' ÷ '+d)} ثم اكتب الخارج والباقي.`,`الخارج ${q} والباقي ${r0}`,[`${d} × ${q} = ${d*q}.`,`${D} − ${d*q} = ${r0}.`,`إذن ${D} = ${d} × ${q} + ${r0}.`])},
 frac(t,lv){const d=ri(3,12),a=ri(1,d-2),b=ri(1,d-a-1);return Math.random()<.5?mk('الكسور',`أنجز: ${ltr(a+'/'+d+' + '+b+'/'+d)} = …`,fr(a+b,d),[`المقامان متساويان، نجمع البسطين: ${a} + ${b} = ${a+b}.`,`الناتج ${a+b}/${d}${fr(a+b,d)!==(a+b)+'/'+d?' = '+fr(a+b,d):''}.`])
  :mk('الكسور',`أنجز: ${ltr((a+b)+'/'+d+' − '+b+'/'+d)} = …`,fr(a,d),[`نطرح البسطين: ${a+b} − ${b} = ${a}.`])},
 area(t,lv){const L=ri(4,lv?30:15),l=ri(2,L);return mk('المساحة',`مستطيل طوله ${L} م وعرضه ${l} م. احسب مساحته.`,`${L*l} م²`,[`المساحة = ${L} × ${l} = ${L*l} م².`])},
 conv(t,lv){const k=pick([['م','سم',100],['كغ','غ',1000],['كلم','م',1000]]),v=ri(2,lv?90:20);return mk('التحويل',`حوّل: ${v} ${k[0]} = … ${k[1]}`,`${v*k[2]} ${k[1]}`,[`1 ${k[0]} = ${k[2]} ${k[1]}، إذن ${v} × ${k[2]} = ${v*k[2]} ${k[1]}.`])},
 round(t,lv){const n=ri(1000,lv?99999:9999),to=pick([10,100]),r=Math.round(n/to)*to;return mk('التقريب',`اكتب تقريب العدد ${n} إلى أقرب ${to===10?'عشرة':'مئة'}.`,r,[`ننظر إلى رقم ${to===10?'الآحاد':'العشرات'}: ${Math.floor(n/(to/10))%10}.`,`التقريب = ${r}.`])}
};
const G5={
 dec(t,lv){const r=rows(3,(_,i)=>{const a=ri(10,lv?9999:999)/10,b=ri(10,lv?999:99)/10;return i===1&&a>=b?[`${num(a)} − ${num(b)}`,a-b]:[`${num(a)} + ${num(b)}`,a+b]});
  return mk('الأعداد العشرية','أنجز العمليات: '+sep(r.map(x=>ltr(x[0]+' = …'))),sep(r.map(x=>num(x[1]))),r.map(x=>`${x[0]} = ${num(x[1])}`))},
 decmult(t,lv){const a=ri(11,lv?999:99)/10,b=ri(2,9);return mk('الأعداد العشرية',`احسب: ${ltr(num(a)+' × '+b)} = …`,num(a*b),[`${num(a)} × ${b} = ${num(a*b)}.`])},
 frac(t,lv){const d=pick([2,3,4,5]),m=ri(2,3),a=ri(1,d-1),b=ri(1,d*m-1);const n=a*m+b,D=d*m;
  return mk('الكسور',`احسب: ${ltr(a+'/'+d+' + '+b+'/'+D)} = … (اكتب الناتج في أبسط صورة)`,fr(n,D),[`نوحّد المقامين: ${a}/${d} = ${a*m}/${D}.`,`${a*m}/${D} + ${b}/${D} = ${n}/${D}.`,`في أبسط صورة: ${fr(n,D)}.`])},
 percent(t,lv){const p=pick([10,20,25,50]),base=pick([40,60,80,100,120,200]);return mk('النسبة المئوية',`احسب ${p}٪ من ${base}.`,base*p/100,[`${p}٪ من ${base} = ${base} × ${p} ÷ 100 = ${base*p/100}.`])},
 tri(t,lv){const b=ri(2,lv?20:10)*2,h=ri(2,lv?20:10);return mk('المساحة',`مثلث قاعدته ${b} سم وارتفاعه ${h} سم. احسب مساحته.`,`${b*h/2} سم²`,[`المساحة = (${b} × ${h}) ÷ 2 = ${b*h/2} سم².`])},
 avg(t,lv){const m=ri(5,lv?40:20),xs=[m-2,m+1,m-1,m+2].map(x=>Math.max(1,x));const mean=xs.reduce((s,x)=>s+x,0)/4;
  return mk('المتوسط',`احسب المتوسط الحسابي للأعداد: ${sep(xs)}.`,num(mean),[`المجموع = ${xs.join(' + ')} = ${xs.reduce((s,x)=>s+x,0)}.`,`المتوسط = ${xs.reduce((s,x)=>s+x,0)} ÷ 4 = ${num(mean)}.`])},
 prop(t,lv){const u=ri(5,lv?90:40),a=ri(2,5),b=ri(6,12);return mk('التناسبية',`ثمن ${a} كغ من الفاكهة ${u*a} دج. ما ثمن ${b} كغ بالسعر نفسه؟`,`${u*b} دج`,[`ثمن 1 كغ = ${u*a} ÷ ${a} = ${u} دج.`,`ثمن ${b} كغ = ${u} × ${b} = ${u*b} دج.`])}
};
const BY_GRADE={'الأولى ابتدائي':G1,'الثانية ابتدائي':G2,'الثالثة ابتدائي':G3,'الرابعة ابتدائي':G4,'الخامسة ابتدائي':G5};
/* ---- middle & secondary generators (math-middle-gen.js): 1AM..4AM and 1AS..3AS math, plus physics 2AS/3AS ---- */
const MM_CODE={'الأولى متوسط':'1AM','الثانية متوسط':'2AM','الثالثة متوسط':'3AM','الرابعة متوسط':'4AM','الأولى ثانوي':'1AS','الثانية ثانوي':'2AS','الثالثة ثانوي':'3AS'};
const MM_TOPIC={'divisibility':'قابلية القسمة','euclid':'القسمة الإقليدية','decimal-div':'القسمة العشرية','angle-sum':'الزوايا',
 'order-of-ops':'ترتيب العمليات','relative-numbers':'الأعداد النسبية','decimal-div-approx':'القسمة والتقريب','fraction-shares':'الكسور','distance-abscissa':'المسافة على مستقيم',
 'scientific':'الكتابة العلمية','power-simplify':'القوى','numeric-expr':'العبارات العددية','frame':'الحصر',
 'identity':'المتطابقات الشهيرة','factor':'التحليل','quadratic-roots':'المعادلات','rect-system':'مسألة المستطيل',
 'linear-system':'جملة معادلتين','parallelogram':'متوازي الأضلاع','canonical-form':'الشكل النموذجي','composition':'تركيب الدوال','arith-seq':'متتالية حسابية','geom-seq':'متتالية هندسية',
 'phys-molarity':'التركيز المولي','phys-dilution':'التمديد','phys-dissolution':'الإذابة','phys-incline':'المستوي المائل'};
const mmSubject=(gr,subject)=>{const c=MM_CODE[gr];if(!c||!g.SMMathMiddle)return null;
  if(subject==='الرياضيات'&&g.SMMathMiddle.has(c,'math'))return{code:c,kind:'math'};
  if(subject==='العلوم الفيزيائية'&&g.SMMathMiddle.has(c,'physics'))return{code:c,kind:'physics'};
  return null};
const mmQuestions=(gr,subject,count)=>{const m=mmSubject(gr,subject);if(!m)return[];
  return g.SMMathMiddle.generate(m.code,count,null,m.kind).map(x=>mk(MM_TOPIC[x.type]||'تمرين',x.q,ltr(x.a),x.steps||[],(x.steps||[]).slice(-1)[0]||''))};
const LEVELS={easy:()=>0,medium:()=>1,hard:()=>2,mixed:i=>i%3};

function mathQuestions(gradeLabel,term,count,diff){
  const set=BY_GRADE[gradeLabel],names=Object.keys(set),order=shuffle(names),out=[],seen=new Set();
  for(let i=0;i<count;i++){
    const lv=(LEVELS[diff]||LEVELS.mixed)(i);let q=null;
    for(let tries=0;tries<12;tries++){q=set[order[i%order.length]](Math.min(3,Math.max(1,term||1)),lv);if(!seen.has(q.question))break}
    seen.add(q.question);out.push(q);
  }
  return out;
}
const DIFF_AR={easy:'مبتدئ',medium:'متوسط',hard:'متقدم'};
const LET=['أ','ب','ج','د','هـ'];
const rec=x=>({id:x.id,topic:x.topic||'',question:x.question,choices:x.choices||[],answer_index:x.answer_index,answer:x.solution||'',explanation:x.explanation||'',solution_steps:x.solution_steps||[]});
const good=x=>Array.isArray(x.choices)&&x.choices.length>=2&&Number.isInteger(x.answer_index)&&x.choices[x.answer_index];
function tfExercise(rs){
  const items=rs.map(r=>{const ok=r.choices[r.answer_index],isTrue=Math.random()<.5,shown=isTrue?ok:pick(r.choices.filter((_,i)=>i!==r.answer_index));return{r,ok,isTrue,shown}});
  return{id:rs.map(r=>r.id).join('+'),topic:'صح أو خطأ',
    question:'ضع (ص) أمام الإجابة الصحيحة و(خ) أمام الإجابة الخاطئة: '+items.map((it,i)=>`(${i+1}) ${it.r.question} الإجابة: «${it.shown}»`).join(' — '),
    choices:[],answer:items.map((it,i)=>`${i+1}: ${it.isTrue?'ص':'خ'}`).join(' ، '),
    explanation:'الإجابة الصحيحة للعبارات الخاطئة: '+(items.filter(it=>!it.isTrue).map(it=>`(${items.indexOf(it)+1}) ${it.ok}`).join(' ، ')||'لا توجد عبارة خاطئة.'),
    solution_steps:items.map((it,i)=>`${i+1}) ${it.isTrue?'صحيحة':'خاطئة، والصواب «'+it.ok+'»'}`)};
}
function matchExercise(rs){
  const ans=shuffle(rs.map(r=>r.choices[r.answer_index])),map=rs.map(r=>LET[ans.indexOf(r.choices[r.answer_index])]);
  return{id:rs.map(r=>r.id).join('+'),topic:'الربط',
    question:'اربط كل سؤال بإجابته الصحيحة: '+rs.map((r,i)=>`(${i+1}) ${r.question}`).join(' — ')+' ؛ الإجابات: '+ans.map((a,i)=>`(${LET[i]}) ${a}`).join(' ، '),
    choices:[],answer:map.map((l,i)=>`${i+1} ← ${l}`).join(' ، '),explanation:'نربط كل سؤال بالإجابة التي تناسبه.',
    solution_steps:rs.map((r,i)=>`(${i+1}) ← ${map[i]}: ${r.choices[r.answer_index]}`)};
}
function bankQuestions(grade,subject,term,count,diff,exclude){
  const all=(typeof exerciseBankRecords!=='undefined'?exerciseBankRecords:[]).filter(x=>x.grade===grade&&x.subject===subject&&(!term||Number(x.term)===Number(term)));
  let pool=all.filter(x=>!exclude.includes(x.id));if(pool.length<count)pool=all;
  const d=DIFF_AR[diff];const pref=d?pool.filter(x=>x.difficulty===d):[];if(pref.length>=count)pool=pref;
  const rs=shuffle(pool).map(rec),out=[],plan=['match','tf','mcq'];
  for(let i=0;i<count&&rs.length;i++){
    const fmt=plan[i%plan.length],okAll=rs.filter(good),spare=rs.length-(count-i-1);   // keep at least one record for each remaining exercise
    if(fmt==='match'&&spare>=3){const short=okAll.filter(r=>r.choices[r.answer_index].length<=30),seen=new Set(),pickd=[];
      for(const r of short){const a=r.choices[r.answer_index];if(!seen.has(a)&&pickd.length<Math.min(4,spare)){seen.add(a);pickd.push(r)}}
      if(pickd.length>=3){pickd.forEach(r=>rs.splice(rs.indexOf(r),1));out.push(matchExercise(pickd));continue}}
    if(fmt==='tf'&&spare>=3&&okAll.length>=3){const t=okAll.slice(0,3);t.forEach(r=>rs.splice(rs.indexOf(r),1));out.push(tfExercise(t));continue}
    out.push(rs.shift());
  }
  return out;
}
function buildPaper(grade,subject,term,count,diff,minutes,total,qs,note){
  const n=qs.length,base=Math.floor(total/n),extra=total-base*n;
  const pts=i=>base+(i<extra?1:0);
  const student=qs.map((q,i)=>({number:i+1,question:q.question,choices:q.choices||[],points:pts(i),question_id:q.id||''}));
  const key=qs.map((q,i)=>({number:i+1,question:q.question,choices:q.choices||[],points:pts(i),answer:q.answer,answer_index:q.answer_index,explanation:q.explanation,solution_steps:q.solution_steps||[]}));
  const title=`اختبار ${subject} — ${grade} — الفصل ${term}`;
  return {grade,subject,term,duration_minutes:minutes,total_points:total,difficulty_requested:diff,curriculum_policy_note:note,
    student_version:{title,questions:student},
    teacher_version:{title:title+' (نسخة الأستاذ)',answer_key:key,marking_scheme:qs.map((q,i)=>({question_number:i+1,points:pts(i),criteria:[{criterion:'الإجابة الصحيحة مع إظهار خطوات الحل',points:pts(i)}]}))}};
}
async function localGenerate(){
  const mount=document.getElementById('currExamResult');if(!mount)return;
  const grade_=bankTestSelection.grade||grade,subject=bankTestSelection.subject,term=Number(bankTestSelection.term);
  if(!subject||!term){mount.innerHTML='<p class="notice">اختر المادة والفصل أولاً من منشئ الاختبارات أعلاه.</p>';return}
  const val=id=>document.getElementById(id)?.value,count=Number(val('currExamCount')||3),diff=val('currExamDifficulty')||'mixed',minutes=Number(val('currExamDuration')||60),total=Number(val('currExamPoints')||20);
  const recentKey='smExamRecentQuestionIds:'+grade_+'|'+subject+'|'+term;let recent=[];try{recent=JSON.parse(localStorage.getItem(recentKey)||'[]')}catch(e){}
  let qs,note;
  if(subject==='الرياضيات'&&BY_GRADE[grade_]){qs=mathQuestions(grade_,term,count,diff);note='تمارين مولَّدة آلياً على نمط امتحانات الفصل، والحلول محسوبة بالبرنامج، وليست امتحاناً رسمياً.'}
  else if(mmSubject(grade_,subject)){qs=mmQuestions(grade_,subject,count);note='تمارين مولَّدة آلياً على نمط فروض الفصل الثاني، والحلول محسوبة بالبرنامج، وليست امتحاناً رسمياً.'}
  else{qs=bankQuestions(grade_,subject,term,count,diff,recent);note='أسئلة تدريبية من بنك المنصة، وليست امتحاناً رسمياً.'}
  if(!qs.length){mount.innerHTML='<p class="notice">لا توجد أسئلة مطابقة لهذه السنة والمادة والفصل.</p>';return}
  if(qs.length<count)note+=` توفّر ${qs.length} سؤالاً فقط من ${count} المطلوبة.`;
  const paper=buildPaper(grade_,subject,term,count,diff,minutes,total,qs,note);
  g.generatedCurriculumPaper=paper;
  try{localStorage.setItem(recentKey,JSON.stringify([...recent,...qs.map(q=>q.id).filter(Boolean)].slice(-120)))}catch(e){}
  renderCurriculumExamVersions(paper);
}
const original=g.generateCurriculumExam;
g.generateCurriculumExam=async function(){
  const grade_=(typeof bankTestSelection!=='undefined'&&bankTestSelection.grade)||(typeof grade!=='undefined'?grade:'');
  const isMath=typeof bankTestSelection!=='undefined'&&((bankTestSelection.subject==='الرياضيات'&&BY_GRADE[grade_])||!!mmSubject(grade_,bankTestSelection.subject));
  const hasBackend=typeof apiBase==='function'&&!!apiBase();
  if(isMath||!hasBackend||typeof original!=='function')return localGenerate();
  return original.apply(this,arguments);
};
g.SM_LOCAL_EXAM={mathQuestions,bankQuestions,buildPaper,grades:Object.keys(BY_GRADE)};

/* ---- practice mode: the exercise-bank landing page becomes "exercise generator" ---- */
const PS=g.SM_PRACTICE_STATE=g.SM_PRACTICE_STATE||{subject:'',term:1,diff:'mixed',count:5,seen:{}};
const curLang=()=>typeof lang!=='undefined'?lang:'ar';
const esc=s=>typeof escapeReviewText==='function'?escapeReviewText(s):String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const T={
 ar:{title:'مولّد التمارين',desc:'اختر المادة والفصل ثم ولّد تمارين جديدة مع حلولها. في رياضيات الابتدائي والمتوسط والثانوي (وفيزياء 2 و3 ثانوي) تتغير الأرقام في كل مرة، وفي باقي المواد تُسحب التمارين من بنك المنصة.',
  subject:'المادة',term:'الفصل',diff:'الصعوبة',count:'عدد التمارين',mixed:'متدرجة',easy:'سهلة',medium:'متوسطة',hard:'صعبة',go:'ولّد تمارين',more:'تمارين أخرى',exam:'ولّد اختباراً كاملاً',
  showAll:'إظهار كل الحلول',hideAll:'إخفاء الحلول',sol:'عرض الحل',ans:'الإجابة',q:'التمرين',none:'لا توجد تمارين لهذه السنة والمادة والفصل.',only:'توفّر {n} تمريناً فقط من {c} المطلوبة.',
  genNote:'تمارين مولَّدة آلياً وحلولها محسوبة بالبرنامج.',bankNote:'تمارين من بنك المنصة، وهي تدريبية وليست مواضيع وزارية رسمية.',loading:'جارٍ تحميل البنك…',mmNote:'أنماطها مأخوذة من فروض الفصل الثاني، ولا تتغير بتغيّر الفصل أو الصعوبة.'},
 fr:{title:'Générateur d’exercices',desc:'Choisissez la matière et le trimestre, puis générez de nouveaux exercices avec corrigé.',
  subject:'Matière',term:'Trimestre',diff:'Difficulté',count:'Nombre',mixed:'Mixte',easy:'Facile',medium:'Moyen',hard:'Difficile',go:'Générer',more:'Autres exercices',exam:'Générer un sujet complet',
  showAll:'Afficher les corrigés',hideAll:'Masquer les corrigés',sol:'Voir le corrigé',ans:'Réponse',q:'Exercice',none:'Aucun exercice pour cette sélection.',only:'Seulement {n} exercices sur {c}.',
  genNote:'Exercices générés automatiquement, corrigés calculés.',bankNote:'Exercices de la banque, non officiels.',loading:'Chargement…',mmNote:'Modèles issus des devoirs du 2e trimestre ; trimestre et difficulté sans effet.'},
 en:{title:'Exercise generator',desc:'Pick a subject and term, then generate fresh exercises with solutions.',
  subject:'Subject',term:'Term',diff:'Difficulty',count:'Count',mixed:'Mixed',easy:'Easy',medium:'Medium',hard:'Hard',go:'Generate',more:'More exercises',exam:'Generate a full exam',
  showAll:'Show all solutions',hideAll:'Hide solutions',sol:'Show solution',ans:'Answer',q:'Exercise',none:'No exercises for this selection.',only:'Only {n} of {c} available.',
  genNote:'Auto-generated exercises with computed answers.',bankNote:'Exercises from the platform bank, not official papers.',loading:'Loading…',mmNote:'Patterns come from term-2 papers; term and difficulty have no effect.'}
};
const tx=()=>T[curLang()]||T.en;
const bankFor=gr=>typeof exerciseBankRecords!=='undefined'?exerciseBankRecords.filter(x=>x.grade===gr):[];
const subjectsFor=gr=>{const s=[...new Set(bankFor(gr).map(x=>x.subject))];if(BY_GRADE[gr]&&!s.includes('الرياضيات'))s.unshift('الرياضيات');return s};

function practiceItems(gr,subject,term,count,diff){
  if(subject==='الرياضيات'&&BY_GRADE[gr]){
    return{gen:true,items:mathQuestions(gr,term,count,diff).map(q=>({topic:q.topic,question:q.question,choices:[],answer:q.answer,steps:q.solution_steps||[],explanation:q.explanation||''}))};
  }
  if(mmSubject(gr,subject)){
    return{gen:true,mm:true,items:mmQuestions(gr,subject,count).map(q=>({topic:q.topic,question:q.question,choices:[],answer:q.answer,steps:q.solution_steps||[],explanation:q.explanation||''}))};
  }
  const key=gr+'|'+subject+'|'+term,seen=PS.seen[key]||(PS.seen[key]=[]);
  let all=bankFor(gr).filter(x=>x.subject===subject&&Number(x.term)===Number(term));
  const d=DIFF_AR[diff];if(d){const p=all.filter(x=>x.difficulty===d);if(p.length>=Math.min(count,all.length))all=p}
  let pool=all.filter(x=>!seen.includes(x.id));if(pool.length<Math.min(count,all.length)){seen.length=0;pool=all}
  const chosen=shuffle(pool).slice(0,count);chosen.forEach(x=>seen.push(x.id));
  return{gen:false,total:all.length,items:chosen.map(x=>{
    let ch=Array.isArray(x.choices)?x.choices.slice():[],ans=x.solution||x.answer||'';
    if(ch.length&&Number.isInteger(x.answer_index)&&ch[x.answer_index]!==undefined){const right=ch[x.answer_index];ch=shuffle(ch);ans=LET[ch.indexOf(right)]+') '+right}
    return{topic:x.topic||'',question:x.question,choices:ch,answer:ans,steps:x.solution_steps||[],explanation:x.explanation||''};
  })};
}
function practiceCard(it,i,L){
  const ch=it.choices.length?`<div class="gen-choices">${it.choices.map((c,j)=>`<div>${LET[j]||j+1}) ${esc(c)}</div>`).join('')}</div>`:'';
  const steps=(it.steps||[]).length?`<ol>${it.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:'';
  const why=it.explanation&&!(it.steps||[]).includes(it.explanation)?`<p>${esc(it.explanation)}</p>`:'';
  return `<article class="question-card"><div class="learning-meta"><b>${L.q} ${i+1}</b><span>${esc(it.topic)}</span></div><p>${esc(it.question)}</p>${ch}<details class="gen-solution"><summary>${L.sol}</summary><p><b>${L.ans}:</b> ${esc(it.answer)}</p>${steps}${why}</details></article>`;
}
function ensureState(){
  const gr=typeof grade!=='undefined'?grade:'',subs=subjectsFor(gr);
  if(!subs.includes(PS.subject))PS.subject=subs.includes('الرياضيات')?'الرياضيات':(subs[0]||'');
  return{gr,subs};
}
const SMP=g.SM_PRACTICE={
  set(k,v){PS[k]=(k==='term'||k==='count')?Number(v):v;if(k==='subject'||k==='term'){const m=document.getElementById('genPracticeResult');if(m)m.innerHTML=''}},
  run(){
    const mount=document.getElementById('genPracticeResult');if(!mount)return;
    const L=tx(),{gr}=ensureState();
    if(!PS.subject){mount.innerHTML=`<p class="notice">${L.none}</p>`;return}
    const r=practiceItems(gr,PS.subject,PS.term,PS.count,PS.diff);
    if(!r.items.length){mount.innerHTML=`<p class="notice">${L.none}</p>`;return}
    const short=r.items.length<PS.count?' '+L.only.replace('{n}',r.items.length).replace('{c}',PS.count):'';
    mount.innerHTML=`<div class="learning-meta"><b>${esc(PS.subject)} · ${esc(gr)}</b><span class="pill">${L.term} ${PS.term}</span></div>`+r.items.map((it,i)=>practiceCard(it,i,L)).join('')+
      `<p class="notice">${r.gen?L.genNote+(r.mm?' '+L.mmNote:''):L.bankNote}${short}</p><div class="exam-version-actions"><button class="primary-btn" onclick="SM_PRACTICE.run()">${L.more}</button><button class="secondary-btn" onclick="SM_PRACTICE.toggleAll(this)">${L.showAll}</button></div>`;
  },
  toggleAll(btn){
    const L=tx(),ds=document.querySelectorAll('#genPracticeResult details.gen-solution'),open=!(ds.length&&ds[0].open);
    ds.forEach(d=>{d.open=open});if(btn)btn.textContent=open?L.hideAll:L.showAll;
  },
  exam(){
    const {gr}=ensureState();
    if(typeof bankTestSelection!=='undefined'){bankTestSelection.grade=gr;bankTestSelection.subject=PS.subject;bankTestSelection.term=String(PS.term)}
    if(typeof go==='function')go('tests');
  },
  panelHtml(){
    const L=tx(),{gr,subs}=ensureState();
    if(!subs.length)return `<section class="panel"><div class="notice">${L.loading}</div></section>`;
    const opt=(v,t,cur)=>`<option value="${esc(v)}"${String(v)===String(cur)?' selected':''}>${esc(t)}</option>`;
    return `<section class="panel practice-generator"><div class="learning-meta"><b>✨ ${L.title}</b><span class="pill">${esc(gr)}</span></div><p>${L.desc}</p><div class="test-builder-grid">`+
      `<label>${L.subject}<select onchange="SM_PRACTICE.set('subject',this.value)">${subs.map(s=>opt(s,s,PS.subject)).join('')}</select></label>`+
      `<label>${L.term}<select onchange="SM_PRACTICE.set('term',this.value)">${[1,2,3].map(n=>opt(n,n,PS.term)).join('')}</select></label>`+
      `<label>${L.diff}<select onchange="SM_PRACTICE.set('diff',this.value)">${['mixed','easy','medium','hard'].map(k=>opt(k,L[k],PS.diff)).join('')}</select></label>`+
      `<label>${L.count}<select onchange="SM_PRACTICE.set('count',this.value)">${[3,5,8,10].map(n=>opt(n,n,PS.count)).join('')}</select></label></div>`+
      `<div class="exam-version-actions"><button class="primary-btn" onclick="SM_PRACTICE.run()">${L.go}</button><button class="secondary-btn" onclick="SM_PRACTICE.exam()">${L.exam}</button></div><div id="genPracticeResult"></div></section>`;
  }
};
(function(){
  if(typeof document==='undefined')return;
  const st=document.createElement('style');
  st.textContent='.gen-choices div{margin:.25rem 0}.gen-solution{margin-top:.6rem}.gen-solution summary{cursor:pointer;font-weight:700}.practice-generator #genPracticeResult{margin-top:1rem}';
  (document.head||document.documentElement).appendChild(st);
})();
const origHome=g.exerciseBankHomePage;
if(typeof origHome==='function'){
  g.exerciseBankHomePage=function(){
    let h=origHome.apply(this,arguments);
    if(curLang()==='ar')h=h.replace('بنك تمارين شامل لجميع المواد والأطوار','مولّد التمارين وبنك التمارين');
    const marker='<h3 class="bank-section-title">',i=h.indexOf(marker),panel=SMP.panelHtml();
    return i<0?h+panel:h.slice(0,i)+panel+h.slice(i);
  };
}
g.SM_EDUCATION_RELEASE=Object.assign({},g.SM_EDUCATION_RELEASE,{features:((g.SM_EDUCATION_RELEASE||{}).features||[]).concat(['practice-generator'])});
g.SM_LOCAL_EXAM.practiceItems=practiceItems;
})(window);
