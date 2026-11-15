/* SM Smart Teacher Engine — integration adapter for SM éducation / Capacitor 7.
 * No UI, auth, server, or database ownership. Uses existing SM knowledge modules when present.
 * CommonJS + browser global; ES2019 compatible. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SM_ENGINE = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const VERSION = '1.72.0';
  const clean = v => String(v == null ? '' : v).trim();
  const currentGrade = () => { try { return typeof root.grade !== 'undefined' ? root.grade : ''; } catch (_) { return ''; } };
  const currentLang = () => { try { return typeof root.lang !== 'undefined' ? root.lang : 'ar'; } catch (_) { return 'ar'; } };
  const modules = () => ({ core: root.SM_TEACHER_CORE || null, kb: root.SM_TUTOR_KB || null, books: root.SM_TEXTBOOK_KB || null, library: root.SM_TEACHER_BOOKS || null });

  function tokenize(text) {
    return clean(text).normalize('NFKC').toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }
  function retrieve(query, options) {
    options = options || {};
    const m = modules(), grade = options.grade == null ? currentGrade() : options.grade;
    const subject = options.subject || '';
    const hits = [];
    if (m.core && typeof m.core.search === 'function') {
      try { return Promise.resolve(m.core.search(query, { grade, subject, limit: options.limit || 6 })).then(x => x || []); } catch (_) {}
    }
    if (m.kb && typeof m.kb.search === 'function') {
      try { const x = m.kb.search(query, { grade, subject, k: options.limit || 6 }); return Promise.resolve(x || []).then(rows => rows.map(h => ({ source: h.d && h.d.src || 'SM_TUTOR_KB', title: h.d && h.d.title || '', grade: h.d && h.d.grade || '', subject: h.d && h.d.subject || '', score: h.s || 0, text: h.d && h.d.text || '', raw: h.d }))); } catch (_) {}
    }
    return Promise.resolve(hits);
  }
  async function answer(query, options) {
    options = options || {};
    const q = clean(query); if (!q) return { ok: false, mode: 'empty', answer: '', sources: [] };
    const m = modules();
    let hits = await retrieve(q, options);
    let bookHits = [];
    if (m.books && typeof m.books.search === 'function') {
      try { bookHits = await m.books.search(q, { grade: options.grade || currentGrade(), subject: options.subject || '' }); } catch (_) {}
    }
    let local = null;
    if (m.core && typeof m.core.localAnswer === 'function' && hits.length) {
      try { local = m.core.localAnswer(q, hits, { subject: options.subject || '' }); } catch (_) {}
    }
    if (!local && m.kb && typeof m.kb.contextFor === 'function') {
      try { const ctx = m.kb.contextFor(q, options.grade || currentGrade(), options.subject || ''); if (ctx && ctx.text) local = ctx.text; } catch (_) {}
    }
    if (!local && m.core && typeof m.core._t?.reply === 'function') {
      try { local = await m.core._t.reply(q, options.subject || '', 'lesson'); } catch (_) {}
    }
    const sources = hits.slice(0, 5).map(h => ({ title: h.d?.lesson || h.d?.title || '', grade: h.d?.grade || '', subject: h.d?.subject || '', type: h.d?.kind || 'platform' }));
    bookHits.slice(0, 5).forEach(h => sources.push({ title: h.book || h.title || 'كتاب مدرسي', grade: h.grade || '', subject: h.subject || '', page: h.page || null, type: 'textbook' }));
    return { ok: !!(local || hits.length || bookHits.length), mode: 'offline-retrieval', answer: local || (bookHits.length ? bookHits.map(h => `${h.book || 'كتاب مدرسي'} — ص ${h.page}: ${h.snippet || ''}`).join('\n\n') : 'لم أعثر على مادة محلية كافية للإجابة عن هذا السؤال.'), sources, coverage: { platform: hits.length, textbooks: bookHits.length }, language: currentLang() };
  }

  // Small, deterministic arithmetic parser. No eval/Function; supports + - * / and parentheses.
  function arithmetic(source) {
    const s = clean(source).replace(/٫/g, '.').replace(/,/g, '.').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    let i = 0;
    function ws() { while (/\s/.test(s[i] || '')) i++; }
    function expr() { let v = term(); for (;;) { ws(); if (s[i] === '+') { i++; v += term(); } else if (s[i] === '-') { i++; v -= term(); } else return v; } }
    function term() { let v = factor(); for (;;) { ws(); if (s[i] === '*') { i++; v *= factor(); } else if (s[i] === '/') { i++; const d = factor(); if (d === 0) throw Error('division-by-zero'); v /= d; } else return v; } }
    function factor() { ws(); if (s[i] === '+') { i++; return factor(); } if (s[i] === '-') { i++; return -factor(); } if (s[i] === '(') { i++; const v = expr(); ws(); if (s[i++] !== ')') throw Error('missing-close-parenthesis'); return v; } const m = s.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/); if (!m) throw Error('invalid-expression'); i += m[0].length; return Number(m[0]); }
    const value = expr(); ws(); if (i !== s.length || !Number.isFinite(value)) throw Error('invalid-expression'); return value;
  }
  // Parse affine expressions a*x+b without eval. Multiplication/division are
  // accepted only when the result remains linear (one factor must be constant).
  function affine(source, variable) {
    const s = clean(source).replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.').replace(/,/g, '.');
    let i = 0;
    const add = (u,v,k=1) => ({a:u.a+k*v.a,b:u.b+k*v.b});
    function ws(){while(/\s/.test(s[i]||''))i++;}
    function expr(){let v=term();for(;;){ws();if(s[i]==='+'){i++;v=add(v,term());}else if(s[i]==='-'){i++;v=add(v,term(),-1);}else return v;}}
    function term(){let v=factor();for(;;){ws();if(s[i]==='*'){i++;const w=factor();if(v.a&&w.a)throw Error('non-linear-expression');v=v.a?{a:v.a*w.b,b:v.b*w.b}: {a:w.a*v.b,b:w.b*v.b};}else if(s[i]==='/'){i++;const w=factor();if(w.a)throw Error('variable-denominator');if(Math.abs(w.b)<1e-12)throw Error('division-by-zero');v={a:v.a/w.b,b:v.b/w.b};}else if(s[i]==='x'||s[i]==='('){const w=factor();if(v.a&&w.a)throw Error('non-linear-expression');v=v.a?{a:v.a*w.b,b:v.b*w.b}:{a:w.a*v.b,b:w.b*v.b};}else return v;}}
    function factor(){ws();if(s[i]==='+'){i++;return factor();}if(s[i]==='-'){i++;const v=factor();return {a:-v.a,b:-v.b};}if(s[i]==='('){i++;const v=expr();ws();if(s[i++]!==')')throw Error('missing-close-parenthesis');return v;}if(s.slice(i,i+variable.length)===variable){i+=variable.length;return {a:1,b:0};}const m=s.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/);if(!m)throw Error('invalid-expression');i+=m[0].length;return {a:0,b:Number(m[0])};}
    const v=expr();ws();if(i!==s.length||!Number.isFinite(v.a)||!Number.isFinite(v.b))throw Error('invalid-expression');return v;
  }
  function solveLinear(equation, variable) {
    variable = variable || 'x';
    const parts=clean(equation).split('=');if(parts.length!==2)throw Error('expected-one-equals');
    const l=affine(parts[0],variable),r=affine(parts[1],variable),a=l.a-r.a,b=r.b-l.b;
    if(Math.abs(a)<1e-12)return {kind:Math.abs(b)<1e-12?'identity':'no-solution',variable,steps:[`${l.a}${variable} + ${l.b} = ${r.a}${variable} + ${r.b}`,`${a}${variable} = ${b}`]};
    const value=b/a;return {kind:'solution',variable,value,exact:Number.isInteger(value)?String(value):String(Number(value.toFixed(10))),steps:[`${l.a}${variable} + ${l.b} = ${r.a}${variable} + ${r.b}`,`${a}${variable} = ${b}`,`${variable} = ${b} / ${a}`,`${variable} = ${Number(value.toFixed(10))}`]};
  }
  function solveInequality(input, variable) {
    variable=variable||'x';const m=clean(input).match(/^(.*?)(<=|>=|<|>|≤|≥)(.*)$/);if(!m)throw Error('expected-inequality-sign');
    const l=affine(m[1],variable),r=affine(m[3],variable),a=l.a-r.a,b=r.b-l.b;
    let sign=m[2].replace('≤','<=').replace('≥','>=');
    if(Math.abs(a)<1e-12){const ok=sign==='< ' ? b>0 : sign==='<'?0<b:sign==='<='?0<=b:sign==='>'?0>b:0>=b;return {kind:ok?'all':'none',variable,relation:sign};}
    let relation=sign;if(a<0)relation=({'>':'<','<':'>','>=':'<=','<=':'>='})[sign];
    return {kind:'range',variable,relation,boundary:b/a,solution:`${variable} ${relation} ${Number((b/a).toFixed(10))}`,steps:[`${a}${variable} ${sign} ${b}`,`${variable} ${relation} ${Number((b/a).toFixed(10))}`]};
  }
  function solveLinearSystem(eq1,eq2) {
    const parse=e=>{const p=clean(e).split('=');if(p.length!==2)throw Error('expected-one-equals');const l=affine(p[0],'x'),r=affine(p[1],'x');return {a:l.a-r.a,b:l.b-r.b,c:r.b-l.b};};
    // Systems are entered as a*x+b*y=c; use a dedicated y-aware affine parser.
    const row=e=>{const p=clean(e).split('=');if(p.length!==2)throw Error('expected-one-equals');const left=affine2(p[0]),right=affine2(p[1]);return {a:left.x-right.x,b:left.y-right.y,c:right.k-left.k};};
    const u=row(eq1),v=row(eq2),det=u.a*v.b-v.a*u.b;
    if(Math.abs(det)<1e-12){const same=Math.abs(u.a*v.c-v.a*u.c)<1e-10&&Math.abs(u.b*v.c-v.b*u.c)<1e-10;return {kind:same?'dependent':'inconsistent'};}
    const x=(u.c*v.b-v.c*u.b)/det,y=(u.a*v.c-v.a*u.c)/det;
    return {kind:'unique',x,y,steps:[`${u.a}x + ${u.b}y = ${u.c}`,`${v.a}x + ${v.b}y = ${v.c}`,`x = ${Number(x.toFixed(10))}`,`y = ${Number(y.toFixed(10))}`]};
  }
  function affine2(source) {
    const s=clean(source).replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g,'.').replace(/,/g,'.');let i=0;
    const add=(u,v,k=1)=>({x:u.x+k*v.x,y:u.y+k*v.y,k:u.k+k*v.k});function ws(){while(/\s/.test(s[i]||''))i++;}
    function expr(){let v=term();for(;;){ws();if(s[i]==='+'){i++;v=add(v,term());}else if(s[i]==='-'){i++;v=add(v,term(),-1);}else return v;}}
    function term(){let v=factor();for(;;){ws();if(s[i]==='*'){i++;const w=factor();const vn=z=>Math.abs(z.x)+Math.abs(z.y)>1e-12;if(vn(v)&&vn(w))throw Error('non-linear-expression');if(vn(v)){const q=w.k;v={x:v.x*q,y:v.y*q,k:v.k*q};}else{const q=v.k;v={x:w.x*q,y:w.y*q,k:w.k*q};}}else if(s[i]==='/'){i++;const w=factor();if(Math.abs(w.x)+Math.abs(w.y)>1e-12)throw Error('variable-denominator');if(!w.k)throw Error('division-by-zero');v={x:v.x/w.k,y:v.y/w.k,k:v.k/w.k};}else if(s[i]==='x'||s[i]==='y'||s[i]==='('){const w=factor();const vn=z=>Math.abs(z.x)+Math.abs(z.y)>1e-12;if(vn(v)&&vn(w))throw Error('non-linear-expression');if(vn(v)){const q=w.k;v={x:v.x*q,y:v.y*q,k:v.k*q};}else{const q=v.k;v={x:w.x*q,y:w.y*q,k:w.k*q};}}else return v;}}
    function factor(){ws();if(s[i]==='+'){i++;return factor();}if(s[i]==='-'){i++;const q=factor();return {x:-q.x,y:-q.y,k:-q.k};}if(s[i]==='('){i++;const q=expr();ws();if(s[i++]!==')')throw Error('missing-close-parenthesis');return q;}if(s[i]==='x'){i++;return {x:1,y:0,k:0};}if(s[i]==='y'){i++;return {x:0,y:1,k:0};}const m=s.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/);if(!m)throw Error('invalid-expression');i+=m[0].length;return {x:0,y:0,k:Number(m[0])};}
    const q=expr();ws();if(i!==s.length)throw Error('invalid-expression');return q;
  }
  function parseLinearEquation(equation) {
    const parts=clean(equation).split('=');if(parts.length!==2)throw Error('expected-one-equals');
    const l=affine(parts[0],'x'),r=affine(parts[1],'x');
    return {a:l.a-r.a,b:l.b-r.b,c:r.b-l.b};
  }
  function equivalentLinearForms(u,v) {
    const x=[u.a,u.b,u.c],y=[v.a,v.b,v.c];
    const nx=Math.hypot(...x),ny=Math.hypot(...y);
    if(nx<1e-12||ny<1e-12)return nx<1e-12&&ny<1e-12;
    for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(Math.abs(x[i]*y[j]-x[j]*y[i])>1e-8*nx*ny)return false;
    return true;
  }
  function diagnoseLinearSteps(equation, studentSteps) {
    let previous;try{previous=parseLinearEquation(equation);}catch(e){return {ok:false,reason:e.message};}
    const rows=Array.isArray(studentSteps)?studentSteps:String(studentSteps||'').split(/\n+/);let checked=0,previousText=clean(equation);
    for(let i=0;i<rows.length;i++){
      const line=clean(rows[i]);if(!line)continue;
      try{
        const current=parseLinearEquation(line);checked++;
        if(!equivalentLinearForms(previous,current))return {ok:false,firstError:i+1,studentStep:line,previousStep:previousText,checked,explanation:'هذه الخطوة غيّرت مجموعة حلول المعادلة مقارنة بالخطوة السابقة. راجع العملية التي أجريتها على الطرفين.'};
        previous=current;previousText=line;
      }catch(e){return {ok:false,firstError:i+1,studentStep:line,checked,reason:e.message,explanation:'تعذّر تحليل هذه الخطوة. اكتبها على شكل معادلة خطية تحتوي على علامة = واحدة.'};}
    }
    return {ok:checked>0,checked,explanation:checked?'الخطوات المدخلة متكافئة جبريًا؛ لم يظهر انتقال يغيّر مجموعة الحلول.':'لم أتمكن من تحليل الخطوات؛ أرسل كل خطوة في سطر مستقل.'};
  }
  // Safe symbolic algebra for one-variable expressions. No eval/Function.
  function symbolicAlgebra() {
    const normalize = source => clean(source).replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g,'.').replace(/,/g,'.').replace(/\s+/g,'').toLowerCase();
    function parse(source) {
      const s=normalize(source); if(!s) throw Error('empty-expression');
      const tokens=[]; let i=0;
      while(i<s.length){const m=s.slice(i).match(/^(?:\d+\.?\d*|\.\d+|sqrt|sin|cos|exp|ln|x|[(),+\-*/^])/i);if(!m)throw Error('invalid-symbolic-token:'+s[i]);tokens.push(m[0]);i+=m[0].length;}
      let p=0; const peek=()=>tokens[p]; const take=()=>tokens[p++];
      const node=(type,fields)=>Object.assign({type},fields||{});
      function expr(){let a=term();while(peek()==='+'||peek()==='-'){const op=take(),b=term();a=node(op==='+'?'add':'sub',{a,b});}return a;}
      function term(){let a=unary();for(;;){if(peek()==='*'||peek()==='/'){const op=take(),b=unary();a=node(op==='*'?'mul':'div',{a,b});}else if(peek()==='x'||peek()==='('||['sqrt','sin','cos','exp','ln'].includes(peek())||/^\d/.test(peek()||'')){a=node('mul',{a,b:unary()});}else return a;}}
      function unary(){if(peek()==='+'){take();return unary();}if(peek()==='-'){take();return node('neg',{a:unary()});}return power();}
      function power(){let a=atom();if(peek()==='^'){take();let sign=1;if(peek()==='-'){take();sign=-1;}const t=take();if(!t||!/^\d+$/.test(t))throw Error('integer-exponent-required');const n=sign*Number(t);if(Math.abs(n)>12)throw Error('symbolic-exponent-limit');a=node('pow',{a,n});}return a;}
      function atom(){const t=take();if(t==='x')return node('var');if(['sqrt','sin','cos','exp','ln'].includes(t)){if(take()!=='(')throw Error('function-parentheses-required:'+t);const a=expr();if(take()!==')')throw Error('missing-close-parenthesis');return node('fn',{name:t,a});}if(t==='('){const a=expr();if(take()!==')')throw Error('missing-close-parenthesis');return a;}if(t&&/^(?:\d+\.?\d*|\.\d+)$/.test(t)){const v=Number(t);if(!Number.isFinite(v))throw Error('invalid-number');return node('num',{v});}throw Error('invalid-symbolic-expression');}
      const ast=expr();if(p!==tokens.length)throw Error('unexpected-symbol:'+tokens[p]);return ast;
    }
    const num=v=>({type:'num',v}), variable=()=>({type:'var'});
    function simplify(n){
      if(n.type==='num'||n.type==='var')return n;
      if(n.type==='fn'){const a=simplify(n.a);if(a.type==='num'){let v;if(n.name==='sqrt'){if(a.v<0)throw Error('sqrt-domain-error');v=Math.sqrt(a.v);}else if(n.name==='ln'){if(a.v<=0)throw Error('ln-domain-error');v=Math.log(a.v);}else if(n.name==='sin')v=Math.sin(a.v);else if(n.name==='cos')v=Math.cos(a.v);else v=Math.exp(a.v);if(!Number.isFinite(v))throw Error('non-finite-symbolic-value');return num(v);}return {type:'fn',name:n.name,a};}
      if(n.type==='neg'){const a=simplify(n.a);if(a.type==='num')return num(-a.v);if(a.type==='neg')return a.a;return mulNodes([num(-1),a]);}
      if(n.type==='pow'){const a=simplify(n.a);if(n.n===0)return num(1);if(n.n===1)return a;if(a.type==='num')return num(Math.pow(a.v,n.n));if(n.n===1)return a;return {type:'pow',a,n:n.n};}
      if(n.type==='div'){const a=simplify(n.a),b=simplify(n.b);if(b.type==='num'&&b.v===0)throw Error('division-by-zero');if(a.type==='num'&&b.type==='num')return num(a.v/b.v);if(b.type==='num'&&b.v===1)return a;if(a.type==='num'&&a.v===0)return num(0);if(key(a)===key(b))return num(1);return {type:'div',a,b};}
      if(n.type==='add'||n.type==='sub'){
        const items=[];function collect(x,sign){if(x.type==='add'){collect(x.a,sign);collect(x.b,sign);}else if(x.type==='sub'){collect(x.a,sign);collect(x.b,-sign);}else if(x.type==='neg')collect(x.a,-sign);else items.push({x:simplify(x),sign});}
        collect(n,1);const groups=new Map();let constant=0;
        for(const it of items){let coeff=it.sign,base=it.x;if(base.type==='num'){constant+=coeff*base.v;continue;}if(base.type==='mul'&&base.a.type==='num'){coeff*=base.a.v;base=base.b;}const k=key(base);groups.set(k,{base,coeff:(groups.get(k)?.coeff||0)+coeff});}
        const out=[];for(const g of groups.values())if(Math.abs(g.coeff)>1e-12)out.push(g.coeff===1?g.base:g.coeff===-1?{type:'neg',a:g.base}:mulNodes([num(g.coeff),g.base]));if(Math.abs(constant)>1e-12)out.push(num(constant));
        if(!out.length)return num(0);out.sort((a,b)=>key(a).localeCompare(key(b)));return out.slice(1).reduce((a,b)=>({type:'add',a,b}),out[0]);
      }
      if(n.type==='mul'){return simplifyMul([n.a,n.b]);}
      return n;
    }
    function mulNodes(xs){return xs.slice(1).reduce((a,b)=>({type:'mul',a,b}),xs[0]);}
    function simplifyMul(xs){const flat=[];for(const raw of xs){const x=simplify(raw);if(x.type==='mul')flat.push(x.a,x.b);else flat.push(x);}let c=1;const powers=new Map();for(const x of flat){if(x.type==='num'){c*=x.v;continue;}let base=x,exp=1;if(x.type==='pow'){base=x.a;exp=x.n;}const k=key(base),old=powers.get(k);powers.set(k,{base,exp:(old?.exp||0)+exp});}if(Math.abs(c)<1e-12)return num(0);const out=[];if(c!==1||powers.size===0)out.push(num(c));for(const v of powers.values())if(v.exp)out.push(v.exp===1?v.base:{type:'pow',a:v.base,n:v.exp});out.sort((a,b)=>key(a).localeCompare(key(b)));return out.length===1?out[0]:mulNodes(out);}
    function key(n){if(n.type==='num')return 'N'+Number(n.v.toPrecision(12));if(n.type==='var')return 'x';if(n.type==='neg')return '-'+key(n.a);if(n.type==='fn')return n.name+'('+key(n.a)+')';if(n.type==='pow')return '('+key(n.a)+')^'+n.n;if(n.type==='div')return '('+key(n.a)+')/('+key(n.b)+')';return '('+key(n.a)+ (n.type==='add'?'+':n.type==='sub'?'-':'*') +key(n.b)+')';}
    function render(n,parent=0){const prec={add:1,sub:1,mul:2,div:2,neg:3,pow:4,fn:5,num:6,var:6}[n.type];let s;if(n.type==='num')s=String(Number(n.v.toFixed(10)));else if(n.type==='var')s='x';else if(n.type==='neg')s='-'+render(n.a,3);else if(n.type==='pow')s=render(n.a,4)+'^'+n.n;else if(n.type==='fn')s=n.name+'('+render(n.a)+')';else if(n.type==='div')s=render(n.a,2)+' / '+render(n.b,3);else {const op=n.type==='add'?' + ':n.type==='sub'?' - ':' * ';s=render(n.a,prec)+op+render(n.b,prec+1);}return prec<parent?'('+s+')':s;}
    function polynomial(n){
      const add=(a,b,k=1)=>{const o=new Map(a);for(const [e,c] of b)o.set(e,(o.get(e)||0)+k*c);for(const [e,c] of o)if(Math.abs(c)<1e-10)o.delete(e);return o;};
      const mul=(a,b)=>{const o=new Map();for(const [i,x] of a)for(const [j,y] of b){if(i+j>12)throw Error('polynomial-degree-limit');o.set(i+j,(o.get(i+j)||0)+x*y);}return o;};
      function go(x){if(x.type==='num')return new Map([[0,x.v]]);if(x.type==='var')return new Map([[1,1]]);if(x.type==='neg')return new Map([...go(x.a)].map(([e,c])=>[e,-c]));if(x.type==='add')return add(go(x.a),go(x.b));if(x.type==='sub')return add(go(x.a),go(x.b),-1);if(x.type==='mul')return mul(go(x.a),go(x.b));if(x.type==='pow'){if(x.n<0)throw Error('non-polynomial');let o=new Map([[0,1]]),b=go(x.a);for(let i=0;i<x.n;i++)o=mul(o,b);return o;}if(x.type==='div'){const d=simplify(x.b);if(d.type!=='num'||!d.v)throw Error('non-polynomial');return new Map([...go(x.a)].map(([e,c])=>[e,c/d.v]));}throw Error('non-polynomial');}
      const result=go(n);for(const [e,c] of result)if(Math.abs(c)<1e-10)result.delete(e);return result;
    }
    function formatPolynomial(p){const terms=[...p].filter(([,c])=>Math.abs(c)>1e-10).sort((a,b)=>b[0]-a[0]);if(!terms.length)return '0';return terms.map(([e,c],i)=>{const sign=c<0?' - ':' + ',a=Math.abs(c),body=e===0?String(Number(a.toFixed(10))):((a===1?'':String(Number(a.toFixed(10)))+' * ')+(e===1?'x':'x^'+e));return (i?(c<0?' - ':' + '):(c<0?'-':''))+body;}).join('');}
    function canonical(n){try{const p=polynomial(simplify(n));return [...p].sort((a,b)=>a[0]-b[0]).map(([e,c])=>e+':'+Number(c.toPrecision(10))).join('|')||'0';}catch(_){return key(simplify(n));}}
    function differentiate(n){if(n.type==='num')return num(0);if(n.type==='var')return num(1);if(n.type==='neg')return {type:'neg',a:differentiate(n.a)};if(n.type==='add'||n.type==='sub')return {type:n.type,a:differentiate(n.a),b:differentiate(n.b)};if(n.type==='mul')return {type:'add',a:{type:'mul',a:differentiate(n.a),b:n.b},b:{type:'mul',a:n.a,b:differentiate(n.b)}};if(n.type==='div')return {type:'div',a:{type:'sub',a:{type:'mul',a:differentiate(n.a),b:n.b},b:{type:'mul',a:n.a,b:differentiate(n.b)}},b:{type:'pow',a:n.b,n:2}};if(n.type==='pow'){if(!Number.isInteger(n.n))throw Error('integer-exponent-required');return {type:'mul',a:{type:'mul',a:num(n.n),b:{type:'pow',a:n.a,n:n.n-1}},b:differentiate(n.a)};}if(n.type==='fn'){const du=differentiate(n.a);if(n.name==='sqrt')return {type:'div',a:du,b:{type:'mul',a:num(2),b:{type:'fn',name:'sqrt',a:n.a}}};if(n.name==='sin')return {type:'mul',a:{type:'fn',name:'cos',a:n.a},b:du};if(n.name==='cos')return {type:'neg',a:{type:'mul',a:{type:'fn',name:'sin',a:n.a},b:du}};if(n.name==='exp')return {type:'mul',a:{type:'fn',name:'exp',a:n.a},b:du};if(n.name==='ln')return {type:'div',a:du,b:n.a};}throw Error('unsupported-symbolic-node');}
    function simplifyExpression(source){const ast=simplify(parse(source));let expression;try{expression=formatPolynomial(polynomial(ast));}catch(_){expression=render(ast);}return {expression,canonical:canonical(ast),steps:['تحليل التعبير إلى حدود وعمليات جبرية.','تجميع الحدود المتشابهة واختزال الثوابت.','ترتيب الناتج بصيغة معيارية.']};}
    function derivativeExpression(source){const ast=parse(source),d=simplify(differentiate(ast));let original,derivativeText;try{original=formatPolynomial(polynomial(simplify(ast)));}catch(_){original=render(simplify(ast));}try{derivativeText=formatPolynomial(polynomial(d));}catch(_){derivativeText=render(d);}return {variable:'x',original,derivative:derivativeText,canonical:canonical(d),steps:['نطبق قواعد الاشتقاق على الثوابت والمتغير.','نطبق قاعدة الجمع والضرب والقسمة وقاعدة القوة عند الحاجة.','نبسط الناتج ونجمع الحدود المتشابهة.'],rules:['(u+v)′ = u′+v′','(uv)′ = u′v+uv′','(u/v)′ = (u′v−uv′)/v²','(xⁿ)′ = n·xⁿ⁻¹']};}
    function affineCoefficients(n){
      const p=polynomial(simplify(n));
      for(const [e,c] of p)if(e>1&&Math.abs(c)>1e-10)throw Error('integration-requires-affine-inner-function');
      return {a:p.get(1)||0,b:p.get(0)||0};
    }
    function flattenProduct(n,out=[]){if(n.type==='mul'){flattenProduct(n.a,out);flattenProduct(n.b,out);}else out.push(n);return out;}
    function integrateBySubstitutionProduct(n){
      const factors=flattenProduct(n);
      for(let i=0;i<factors.length;i++){
        const target=factors[i];
        if(target.type!=='fn'&&!(['pow'].includes(target.type)))continue;
        if(target.type==='fn'&&!['sin','cos','exp'].includes(target.name))continue;
        if(target.type==='pow'&&target.n===-1)continue;
        const rest=factors.filter((_,j)=>j!==i);
        if(!rest.length)continue;
        const du=rest.slice(1).reduce((a,b)=>({type:'mul',a,b}),rest[0]);
        const inner=target.type==='fn'?target.a:target.a;
        let innerDerivative;
        try{innerDerivative=simplify(differentiate(inner));}catch(_){continue;}
        if(canonical(simplify(du))!==canonical(innerDerivative))continue;
        if(target.type==='fn'){
          if(target.name==='sin')return {type:'neg',a:{type:'fn',name:'cos',a:inner}};
          if(target.name==='cos')return {type:'fn',name:'sin',a:inner};
          return {type:'fn',name:'exp',a:inner};
        }
        return {type:'div',a:{type:'pow',a:inner,n:target.n+1},b:num(target.n+1)};
      }
      return null;
    }
    function integrateNode(n){
      if(n.type==='num')return {type:'mul',a:num(n.v),b:variable()};
      if(n.type==='var')return {type:'div',a:{type:'pow',a:variable(),n:2},b:num(2)};
      if(n.type==='neg')return {type:'neg',a:integrateNode(n.a)};
      if(n.type==='add'||n.type==='sub')return {type:n.type,a:integrateNode(n.a),b:integrateNode(n.b)};
      if(n.type==='mul'){
        const coefficient=n.a.type==='num'?n.a:(n.b.type==='num'?n.b:null);
        const other=n.a.type==='num'?n.b:n.a;
        if(coefficient){
          if(other.type==='pow'&&other.a.type==='var'&&other.n!==-1)return simplify({type:'mul',a:num(coefficient.v/(other.n+1)),b:{type:'pow',a:variable(),n:other.n+1}});
          if(other.type==='var')return simplify({type:'mul',a:num(coefficient.v/2),b:{type:'pow',a:variable(),n:2}});
          return {type:'mul',a:coefficient,b:integrateNode(other)};
        }
        const substituted=integrateBySubstitutionProduct(n);
        if(substituted)return substituted;
        throw Error('integration-product-rule-not-supported');
      }
      if(n.type==='div'){
        if(n.b.type==='num'&&n.b.v!==0)return {type:'div',a:integrateNode(n.a),b:n.b};
        throw Error('integration-quotient-not-supported');
      }
      if(n.type==='pow'&&n.a.type==='var'){
        if(n.n===-1)throw Error('integral-of-one-over-x-requires-log-absolute-value');
        return {type:'div',a:{type:'pow',a:variable(),n:n.n+1},b:num(n.n+1)};
      }
      if(n.type==='fn'){
        if(['sin','cos','exp'].includes(n.name)){
          const {a}=affineCoefficients(n.a);
          if(Math.abs(a)<1e-12)throw Error('constant-inner-function-integration');
          const u=n.a, inv=num(1/a);
          if(n.name==='sin')return {type:'mul',a:num(-1/a),b:{type:'fn',name:'cos',a:u}};
          if(n.name==='cos')return {type:'mul',a:inv,b:{type:'fn',name:'sin',a:u}};
          return {type:'mul',a:inv,b:{type:'fn',name:'exp',a:u}};
        }
      }
      throw Error('symbolic-integration-not-supported-for-expression');
    }
    function containsSubstitution(n){
      if(n.type==='mul'&&integrateBySubstitutionProduct(n))return true;
      if(n.type==='add'||n.type==='sub')return containsSubstitution(n.a)||containsSubstitution(n.b);
      if(n.type==='neg')return containsSubstitution(n.a);
      return false;
    }
    function integrateExpression(source){
      const original=simplify(parse(source));
      const primitive=simplify(integrateNode(original));
      const derivativeBack=simplify(differentiate(primitive));
      const verified=canonical(derivativeBack)===canonical(original);
      let primitiveText;try{primitiveText=formatPolynomial(polynomial(primitive));}catch(_){primitiveText=render(primitive);}
      const usedSubstitution=containsSubstitution(original);
      const steps=usedSubstitution?['نختار الدالة الداخلية u ونحسب مشتقتها u′.','نتحقق من وجود العامل u′ مضروبًا في الدالة المركبة.','نطبق قاعدة التعويض: ∫g(u)u′ dx = ∫g(u) du.','نشتق الناتج للتحقق من استعادة الدالة الأصلية.']:['نحدد نوع التعبير وقواعد التكامل المناسبة.','نكامل الحدود أو الدوال المدعومة مع مراعاة معامل الدالة الداخلية.','نشتق الناتج للتحقق من استعادة الدالة الأصلية.'];
      return {variable:'x',original:render(original),antiderivative:primitiveText+' + C',canonical:canonical(primitive),method:usedSubstitution?'u-substitution':'basic-rules',verifiedBySymbolicDifferentiation:verified,steps,note:verified?'تم التحقق رمزيًا من أن مشتقة الناتج تساوي الدالة الأصلية.':'تعذر إثبات صحة الناتج رمزيًا.'};
    }
    function definiteIntegral(source,lower,upper){
      lower=Number(lower);upper=Number(upper);
      if(!Number.isFinite(lower)||!Number.isFinite(upper))throw Error('invalid-integration-bounds');
      const result=integrateExpression(source), primitive=result.antiderivative.replace(/\s*\+\s*C$/,'');
      const value=evaluate(primitive,upper)-evaluate(primitive,lower);
      return {lower,upper,value,antiderivative:result.antiderivative,verifiedBySymbolicDifferentiation:result.verifiedBySymbolicDifferentiation,method:'symbolic-antiderivative-evaluation'};
    }
    function equationCanonical(line){const parts=clean(line).split('=');if(parts.length!==2)throw Error('expected-one-equals');const ast=simplify({type:'sub',a:parse(parts[0]),b:parse(parts[1])});let p;try{p=polynomial(ast);}catch(_){return canonical(ast);}const entries=[...p].sort((a,b)=>a[0]-b[0]);const first=entries.find(x=>Math.abs(x[1])>1e-10);if(!first)return '0';return entries.map(([e,c])=>e+':'+Number((c/first[1]).toPrecision(9))).join('|');}
    function diagnoseSteps(initial,steps){const rows=Array.isArray(steps)?steps:String(steps||'').split(/\n+/);let prev;try{prev=equationCanonical(initial);}catch(e){return {ok:false,reason:e.message};}let checked=0;for(let i=0;i<rows.length;i++){const line=clean(rows[i]);if(!line)continue;try{const cur=equationCanonical(line);checked++;if(cur!==prev)return {ok:false,firstError:i+1,studentStep:line,checked,explanation:'هذه الخطوة لا تحافظ على تكافؤ المعادلة السابقة. راجع العمليات التي أجريتها على الطرفين.'};prev=cur;}catch(e){return {ok:false,firstError:i+1,studentStep:line,checked,reason:e.message,explanation:'تعذر تحليل هذه الخطوة؛ اكتب معادلة واحدة واضحة في كل سطر.'};}}return {ok:checked>0,checked,explanation:checked?'الخطوات متكافئة وفق التحليل الرمزي المدعوم.':'لم تُقدّم خطوات قابلة للتحليل.'};}
    function equivalent(a,b){try{return canonical(parse(a))===canonical(parse(b));}catch(_){return false;}}
    function evaluate(source,x){x=Number(x);if(!Number.isFinite(x))throw Error('invalid-x');const ast=simplify(parse(source));function run(n){if(n.type==='num')return n.v;if(n.type==='var')return x;if(n.type==='neg')return -run(n.a);if(n.type==='fn'){const v=run(n.a);if(n.name==='sqrt'){if(v<0)throw Error('sqrt-domain-error');return Math.sqrt(v);}if(n.name==='ln'){if(v<=0)throw Error('ln-domain-error');return Math.log(v);}if(n.name==='sin')return Math.sin(v);if(n.name==='cos')return Math.cos(v);return Math.exp(v);}if(n.type==='pow')return Math.pow(run(n.a),n.n);const a=run(n.a),b=run(n.b);if(n.type==='add')return a+b;if(n.type==='sub')return a-b;if(n.type==='mul')return a*b;if(n.type==='div'){if(b===0)throw Error('division-by-zero');return a/b;}throw Error('unsupported-symbolic-node');}const value=run(ast);if(!Number.isFinite(value))throw Error('non-finite-symbolic-value');return value;}
    return Object.freeze({parse:source=>render(simplify(parse(source))),simplify:simplifyExpression,derivative:derivativeExpression,integrate:integrateExpression,definiteIntegral,equivalent,diagnoseSteps,evaluate});
  }
  function geometry() {
    const finite=(v,n)=>{const x=Number(v);if(!Number.isFinite(x))throw Error('invalid-'+n);return x;};
    const point=p=>({x:finite(p&&p.x,'x-coordinate'),y:finite(p&&p.y,'y-coordinate')});
    function distance(a,b){a=point(a);b=point(b);return Math.hypot(b.x-a.x,b.y-a.y);}
    function midpoint(a,b){a=point(a);b=point(b);return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
    function slope(a,b){a=point(a);b=point(b);const dx=b.x-a.x;return Math.abs(dx)<1e-12?null:(b.y-a.y)/dx;}
    function triangleArea(a,b,c){a=point(a);b=point(b);c=point(c);return Math.abs((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2;}
    function heron(a,b,c){a=finite(a,'side');b=finite(b,'side');c=finite(c,'side');if(a<=0||b<=0||c<=0||a+b<=c||a+c<=b||b+c<=a)throw Error('invalid-triangle-sides');const p=(a+b+c)/2;return Math.sqrt(p*(p-a)*(p-b)*(p-c));}
    function circle(radius){radius=finite(radius,'radius');if(radius<0)throw Error('negative-radius');return {area:Math.PI*radius*radius,circumference:2*Math.PI*radius};}
    function pythagorean(a,b,c){a=finite(a,'side');b=finite(b,'side');c=finite(c,'side');if(a<=0||b<=0||c<=0)throw Error('invalid-side');const vals=[a,b,c].sort((x,y)=>x-y);return {valid:Math.abs(vals[0]*vals[0]+vals[1]*vals[1]-vals[2]*vals[2])<1e-8, hypotenuse:vals[2], difference:Math.abs(vals[0]*vals[0]+vals[1]*vals[1]-vals[2]*vals[2])};}
    return Object.freeze({distance,midpoint,slope,triangleArea,heron,circle,pythagorean});
  }
  // Exact rational arithmetic using BigInt; input is a normal arithmetic expression.
  function fraction(source) {
    const s=clean(source).replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g,'.').replace(/,/g,'.').replace(/\s+/g,'').toLowerCase();
    let i=0;
    const gcd=(a,b)=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=a%b;a=b;b=t;}return a||1n;};
    const norm=(n,d)=>{if(d===0n)throw Error('division-by-zero');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};};
    const add=(a,b)=>norm(a.n*b.d+b.n*a.d,a.d*b.d), sub=(a,b)=>norm(a.n*b.d-b.n*a.d,a.d*b.d), mul=(a,b)=>norm(a.n*b.n,a.d*b.d), div=(a,b)=>{if(!b.n)throw Error('division-by-zero');return norm(a.n*b.d,a.d*b.n);};
    function expr(){let v=term();for(;;){if(s[i]==='+'){i++;v=add(v,term());}else if(s[i]==='-'){i++;v=sub(v,term());}else return v;}}
    function term(){let v=factor();for(;;){if(s[i]==='*'){i++;v=mul(v,factor());}else if(s[i]==='/'){i++;v=div(v,factor());}else return v;}}
    function factor(){if(s[i]==='+'){i++;return factor();}if(s[i]==='-'){i++;const a=factor();return norm(-a.n,a.d);}if(s[i]==='('){i++;const a=expr();if(s[i++]!==')')throw Error('missing-close-parenthesis');return a;}const m=s.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/);if(!m)throw Error('invalid-expression');i+=m[0].length;const raw=m[0];if(raw.includes('.')){const places=raw.length-raw.indexOf('.')-1;const digits=raw.replace('.','');return norm(BigInt(digits),10n**BigInt(places));}return norm(BigInt(raw),1n);}
    if(!s)throw Error('invalid-expression');const r=expr();if(i!==s.length)throw Error('invalid-expression');
    const exact=r.d===1n?String(r.n):`${r.n}/${r.d}`;
    return { numerator:String(r.n), denominator:String(r.d), exact, value:Number(r.n)/Number(r.d) };
  }
  function compareFraction(student, expected) {
    try { const a=fraction(student), b=fraction(expected); const correct=BigInt(a.numerator)*BigInt(b.denominator)===BigInt(b.numerator)*BigInt(a.denominator); return { correct, student: a.exact, expected: b.exact }; }
    catch(e) { return { correct:false, parseable:false, error:e.message, expected }; }
  }
  // Polynomial parser: coefficients are stored by ascending powers of x.
  function derivative(source, variable) {
    variable=variable||'x';if(variable!=='x')throw Error('unsupported-variable');
    const s=clean(source).replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g,'.').replace(/,/g,'.').replace(/\s+/g,'').toLowerCase();let i=0;
    const trim=a=>{while(a.length>1&&Math.abs(a[a.length-1])<1e-12)a.pop();return a;};
    const plus=(a,b,k=1)=>trim(Array.from({length:Math.max(a.length,b.length)},(_,j)=>(a[j]||0)+k*(b[j]||0)));
    const times=(a,b)=>{if(a.length+b.length-2>12)throw Error('polynomial-degree-limit');const c=Array(a.length+b.length-1).fill(0);a.forEach((v,j)=>b.forEach((w,k)=>c[j+k]+=v*w));return trim(c);};
    function expr(){let a=term();for(;;){if(s[i]==='+'){i++;a=plus(a,term());}else if(s[i]==='-'){i++;a=plus(a,term(),-1);}else return a;}}
    function term(){let a=power();for(;;){if(s[i]==='*'){i++;a=times(a,power());}else if(s[i]==='/'){i++;const b=power();if(b.length!==1||Math.abs(b[0])<1e-12)throw Error('polynomial-constant-denominator-only');a=a.map(v=>v/b[0]);}else if(s[i]==='x'||s[i]==='('){a=times(a,power());}else return a;}}
    function power(){let a=factor();if(s[i]==='^'){i++;const m=s.slice(i).match(/^\d+/);if(!m)throw Error('invalid-exponent');i+=m[0].length;const n=Number(m[0]);if(n>12)throw Error('polynomial-degree-limit');let out=[1];for(let j=0;j<n;j++)out=times(out,a);a=out;}return a;}
    function factor(){if(s[i]==='+'){i++;return factor();}if(s[i]==='-'){i++;return factor().map(v=>-v);}if(s[i]==='('){i++;const a=expr();if(s[i++]!==')')throw Error('missing-close-parenthesis');return a;}if(s[i]==='x'){i++;return [0,1];}const m=s.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/);if(!m)throw Error('invalid-polynomial');i+=m[0].length;return [Number(m[0])];}
    if(!s)throw Error('invalid-polynomial');const p=expr();if(i!==s.length)throw Error('invalid-polynomial');const d=p.slice(1).map((v,j)=>v*(j+1));trim(d);const format=a=>{const terms=[];a.forEach((c,n)=>{if(Math.abs(c)<1e-12)return;const val=Number(c.toFixed(10));terms.push({coefficient:val,power:n});});return terms;};
    return { variable, coefficients:format(d), polynomial:format(p), derivative:format(d).slice().sort((a,b)=>b.power-a.power).map(t=>`${t.coefficient}${t.power?'x'+(t.power===1?'':'^'+t.power):''}`).join(' + ').replace(/\+ -/g,'- ')||'0', steps:['نشتق كل حد على حدة باستعمال: (a·xⁿ)′ = a·n·xⁿ⁻¹','نجمع الحدود المتشابهة بعد الاشتقاق.'] };
  }
  // Solve polynomial equations up to degree two using the same safe polynomial parser.
  function solveQuadratic(equation) {
    const parts = clean(equation).split('=');
    if (parts.length !== 2) throw Error('expected-one-equals');
    const left = derivative(parts[0]).polynomial;
    const right = derivative(parts[1]).polynomial;
    const coeff = [];
    for (const t of left) coeff[t.power] = (coeff[t.power] || 0) + t.coefficient;
    for (const t of right) coeff[t.power] = (coeff[t.power] || 0) - t.coefficient;
    for (let i = 0; i < coeff.length; i++) coeff[i] = coeff[i] || 0;
    while (coeff.length > 1 && Math.abs(coeff[coeff.length - 1]) < 1e-12) coeff.pop();
    const degree = coeff.length - 1;
    const c = coeff[0] || 0, b = coeff[1] || 0, a = coeff[2] || 0;
    if (degree > 2) throw Error('quadratic-degree-limit');
    if (degree < 1) return { kind: Math.abs(c) < 1e-12 ? 'identity' : 'no-solution', degree, coefficients: coeff };
    if (degree === 1) {
      const x = -c / b;
      return { kind: 'linear', degree, roots: [x], coefficients: coeff, steps: [`${b}x + (${c}) = 0`, `${b}x = ${-c}`, `x = ${Number(x.toFixed(10))}`] };
    }
    const discriminant = b * b - 4 * a * c;
    const steps = [`${a}x² + (${b})x + (${c}) = 0`, `Δ = b² − 4ac = ${Number(discriminant.toFixed(10))}`];
    if (discriminant < -1e-12) return { kind: 'no-real-roots', degree, discriminant, coefficients: coeff, steps: steps.concat('المميز سالب؛ لا توجد حلول حقيقية.') };
    if (Math.abs(discriminant) <= 1e-12) {
      const x = -b / (2 * a);
      return { kind: 'repeated-root', degree, discriminant: 0, roots: [x], coefficients: coeff, steps: steps.concat([`x = −b / (2a) = ${Number(x.toFixed(10))}`]) };
    }
    const root = Math.sqrt(discriminant);
    const x1 = (-b - root) / (2 * a), x2 = (-b + root) / (2 * a);
    return { kind: 'two-real-roots', degree, discriminant, roots: [x1, x2].sort((u, v) => u - v), coefficients: coeff, steps: steps.concat([`x₁ = (−b − √Δ) / (2a) = ${Number(x1.toFixed(10))}`, `x₂ = (−b + √Δ) / (2a) = ${Number(x2.toFixed(10))}`]) };
  }
  function evaluatePolynomial(polynomial, x) {
    x = Number(x); if (!Number.isFinite(x)) throw Error('invalid-x');
    const terms = Array.isArray(polynomial) ? polynomial : polynomial && (polynomial.polynomial || polynomial.coefficients);
    if (!Array.isArray(terms)) throw Error('invalid-polynomial-data');
    let value = 0;
    for (const term of terms) {
      const coefficient = Number(term && term.coefficient), power = Number(term && term.power);
      if (!Number.isFinite(coefficient) || !Number.isInteger(power) || power < 0 || power > 100) throw Error('invalid-polynomial-term');
      value += coefficient * Math.pow(x, power);
    }
    if (!Number.isFinite(value)) throw Error('polynomial-overflow');
    return value;
  }
  function derivativeAt(source, x) {
    const result = derivative(source);
    return { value: evaluatePolynomial(result.coefficients, x), x: Number(x), derivative: result.derivative, steps: result.steps };
  }

  function polynomialCoefficients(source) {
    const parsed = derivative(source).polynomial;
    const c = [];
    for (const term of parsed) c[term.power] = (c[term.power] || 0) + term.coefficient;
    for (let i = 0; i < c.length; i++) c[i] = c[i] || 0;
    while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-10) c.pop();
    return c.length ? c : [0];
  }
  function solvePolynomial(equation) {
    const parts = clean(equation).split('=');
    if (parts.length !== 2) throw Error('expected-one-equals');
    const a = polynomialCoefficients(parts[0]), b = polynomialCoefficients(parts[1]);
    const c = Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)-(b[i]||0));
    while(c.length>1&&Math.abs(c[c.length-1])<1e-10)c.pop();
    const degree=c.length-1;
    if(degree<=2)return Object.assign({method:'reduced-polynomial'},solveQuadratic(equation));
    if(degree>3)throw Error('polynomial-degree-limit');
    const A=c[3], B=c[2], C=c[1], D=c[0];
    const aa=B/A, bb=C/A, cc=D/A;
    const p=bb-aa*aa/3, q=2*aa*aa*aa/27-aa*bb/3+cc;
    const disc=q*q/4+p*p*p/27;
    const eps=1e-10;
    let roots,kind;
    if(disc>eps){
      const u=Math.cbrt(-q/2+Math.sqrt(disc)),v=Math.cbrt(-q/2-Math.sqrt(disc));
      roots=[u+v-aa/3];kind='one-real-root';
    }else if(disc>=-eps){
      const u=Math.cbrt(-q/2); roots=[2*u-aa/3,-u-aa/3];
      if(Math.abs(roots[0]-roots[1])<1e-8){roots=[roots[0]];kind='triple-root';}else kind='one-simple-one-double-root';
    }else{
      const radius=2*Math.sqrt(-p/3), theta=Math.acos(Math.max(-1,Math.min(1,(3*q/(2*p))*Math.sqrt(-3/p))))/3;
      roots=[0,1,2].map(k=>radius*Math.cos(theta-2*Math.PI*k/3)-aa/3);kind='three-real-roots';
    }
    roots=roots.sort((x,y)=>x-y).map(x=>Number(x.toFixed(10)));
    return {kind,degree,roots,coefficients:c,discriminant:Number(disc.toFixed(12)),steps:['ننقل جميع الحدود إلى طرف واحد.','نقسم على معامل x³ ثم نحوّل المعادلة إلى الصورة المكعبة المختزلة.','نحسب المميز ونحدد عدد الجذور الحقيقية.','نستخرج الجذور ونرتبها تصاعديًا.']};
  }
  function solveQuadraticInequality(inequality) {
    const m=clean(inequality).match(/^(.*?)(<=|>=|<|>|≤|≥)(.*)$/);
    if(!m)throw Error('expected-inequality-sign');
    const left=polynomialCoefficients(m[1]),right=polynomialCoefficients(m[3]);
    const c=Array.from({length:Math.max(left.length,right.length)},(_,i)=>(left[i]||0)-(right[i]||0));
    while(c.length>1&&Math.abs(c[c.length-1])<1e-10)c.pop();
    if(c.length>3)throw Error('quadratic-inequality-degree-limit');
    if(c.length===1){const truth=({'<':c[0]<0,'<=':c[0]<=0,'≤':c[0]<=0,'>':c[0]>0,'>=':c[0]>=0,'≥':c[0]>=0})[m[2]];return {kind:truth?'all-real':'empty',roots:[],intervals:truth?[{from:null,to:null,includeFrom:false,includeTo:false}]:[]};}
    let roots;
    if(c.length===2)roots=[-c[0]/c[1]];
    else {const solved=solveQuadratic(inequality.replace(/<=|>=|<|>|≤|≥/,'=') ); roots=solved.roots||[];}
    roots=roots.filter(Number.isFinite).sort((a,b)=>a-b).filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>1e-8);
    const sign=m[2], strict=sign==='<'||sign==='>', positive=sign==='>'||sign==='>='||sign==='≥';
    const boundaries=[-Infinity,...roots,Infinity], intervals=[];
    const value=x=>c.reduce((sum,k,i)=>sum+k*Math.pow(x,i),0);
    for(let i=0;i<boundaries.length-1;i++){
      const lo=boundaries[i],hi=boundaries[i+1],sample=!Number.isFinite(lo)&&!Number.isFinite(hi)?0:!Number.isFinite(lo)?hi-Math.max(1,Math.abs(hi)+1):!Number.isFinite(hi)?lo+Math.max(1,Math.abs(lo)+1):(lo+hi)/2;
      const v=value(sample), accepted=positive?v>0:v<0;
      if(accepted)intervals.push({from:Number.isFinite(lo)?lo:null,to:Number.isFinite(hi)?hi:null,includeFrom:false,includeTo:false});
    }
    if(!strict){for(const interval of intervals){if(interval.from!=null&&roots.some(r=>Math.abs(r-interval.from)<1e-8))interval.includeFrom=true;if(interval.to!=null&&roots.some(r=>Math.abs(r-interval.to)<1e-8))interval.includeTo=true;}}
    intervals.sort((a,b)=>(a.from==null?-Infinity:a.from)-(b.from==null?-Infinity:b.from));
    return {kind:intervals.length?'intervals':'empty',roots,intervals,relation:sign,steps:['نحوّل المتراجحة إلى تعبير تربيعي في طرف واحد.','نحل المعادلة المقابلة لتحديد نقاط الحدود.','نختبر إشارة التعبير في الفترات الناتجة.','نضم نقاط الجذور عند استعمال ≤ أو ≥.']};
  }
  function createExercise(options) {
    options=options||{};const type=options.type||'linear';let seed=Number.isInteger(options.seed)?Math.abs(options.seed):20261114;
    const rand=(min,max)=>{seed=(seed*1664525+1013904223)>>>0;return min+(seed%(max-min+1));};
    if(type==='linear') {const x=rand(-8,8),a=rand(2,6),b=rand(-9,9),rhs=a*x+b;return {type,prompt:`حل المعادلة: ${a}x ${b<0?'- '+(-b):'+ '+b} = ${rhs}`,expected:String(x),answerType:'numeric',explanation:`نطرح ${b} من الطرفين ثم نقسم على ${a}.`};}
    if(type==='quadratic') {const r1=rand(-5,5),r2=rand(-5,5),b=-(r1+r2),c=r1*r2;return {type,prompt:`حل المعادلة: x² ${b<0?'- '+(-b):'+ '+b}x ${c<0?'- '+(-c):'+ '+c} = 0`,expected:[r1,r2].sort((a,b)=>a-b),answerType:'roots',explanation:`نحلل المقدار إلى (x ${r1<0?'+ '+(-r1):'- '+r1})(x ${r2<0?'+ '+(-r2):'- '+r2}) = 0.`};}
    if(type==='fraction'){const den=rand(2,9),num=rand(1,den-1),factor=rand(2,5);return {type,prompt:`بسّط الكسر: ${num*factor}/${den*factor}`,expected:`${num}/${den}`,answerType:'fraction',explanation:'نقسم البسط والمقام على العامل المشترك.'};}
    throw Error('unsupported-exercise-type');
  }
  function gradeExercise(exercise, studentAnswer) {
    if(!exercise||typeof exercise!=='object')throw Error('invalid-exercise');
    if(exercise.answerType==='fraction'){const result=compareFraction(studentAnswer,exercise.expected);return Object.assign(result,{feedback:result.correct?'إجابة صحيحة.':'الإجابة غير صحيحة؛ حاول تبسيط الكسر بقسمة البسط والمقام على القاسم المشترك.'});}
    if(exercise.answerType==='numeric'){const result=compareNumeric(studentAnswer,Number(exercise.expected));return Object.assign(result,{feedback:result.correct?'إجابة صحيحة.':'تحقق من خطوات العزل والقسمة.'});}
    if(exercise.answerType==='roots'){
      let values;try{values=Array.isArray(studentAnswer)?studentAnswer.map(Number):String(studentAnswer).split(/[;,،\s]+/).filter(Boolean).map(Number);}catch(_){values=[];}
      const expected=exercise.expected.slice().sort((a,b)=>a-b),got=values.slice().sort((a,b)=>a-b);
      const correct=got.length===expected.length&&got.every((v,i)=>Number.isFinite(v)&&Math.abs(v-expected[i])<1e-8);
      return {correct,student:got,expected,feedback:correct?'الجذور صحيحة.':'راجع التحليل إلى عاملين واجعل كل عامل مساويًا للصفر.'};
    }
    throw Error('unsupported-answer-type');
  }

  function compareNumeric(student, expected, tolerance) {
    const tol = tolerance == null ? 1e-8 : Math.max(0, Number(tolerance));
    try { const got = arithmetic(student), want = typeof expected === 'number' ? expected : arithmetic(expected); return { correct: Math.abs(got - want) <= tol, studentValue: got, expectedValue: want, difference: Math.abs(got - want) }; }
    catch (e) { return { correct: false, parseable: false, error: e.message, expectedValue: expected }; }
  }

  function advancedMath() {
    const num=(v,n)=>{const x=Number(v);if(!Number.isFinite(x))throw Error('invalid-'+n);return x;};
    const int=(v,n)=>{const x=Number(v);if(!Number.isSafeInteger(x))throw Error('invalid-'+n);return x;};
    const gcd=(a,b)=>{a=Math.abs(a);b=Math.abs(b);while(b){const t=a%b;a=b;b=t;}return a;};
    const factorial=n=>{n=int(n,'n');if(n<0||n>500)throw Error('factorial-range');let x=1n;for(let i=2;i<=n;i++)x*=BigInt(i);return x;};
    const stats={
      mean(v){if(!Array.isArray(v)||!v.length)throw Error('empty-data');const a=v.map(x=>num(x,'data'));return a.reduce((s,x)=>s+x,0)/a.length;},
      median(v){if(!Array.isArray(v)||!v.length)throw Error('empty-data');const a=v.map(x=>num(x,'data')).sort((x,y)=>x-y),m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2;},
      mode(v){if(!Array.isArray(v)||!v.length)throw Error('empty-data');const f=new Map();v.map(x=>num(x,'data')).forEach(x=>f.set(x,(f.get(x)||0)+1));const m=Math.max(...f.values());return m===1?[]:[...f].filter(x=>x[1]===m).map(x=>x[0]).sort((a,b)=>a-b);},
      variance(v,sample){if(!Array.isArray(v)||!v.length||(sample&&v.length<2))throw Error('invalid-data-size');const m=this.mean(v);return v.reduce((s,x)=>s+(num(x,'data')-m)**2,0)/(sample?v.length-1:v.length);},
      standardDeviation(v,sample){return Math.sqrt(this.variance(v,sample));}
    };
    const percentages={of:(p,b)=>num(p,'percent')*num(b,'base')/100,change:(a,b)=>{a=num(a,'old');b=num(b,'new');if(!a)throw Error('zero-base');return 100*(b-a)/Math.abs(a);},apply:(v,p)=>num(v,'value')*(1+num(p,'percent')/100),reverse:(v,p)=>{const f=1+num(p,'percent')/100;if(!f)throw Error('zero-factor');return num(v,'value')/f;}};
    const numberTheory={gcd:(a,b)=>gcd(int(a,'a'),int(b,'b')),lcm:(a,b)=>{a=int(a,'a');b=int(b,'b');return a===0||b===0?0:Math.abs(a/gcd(a,b)*b);},factorial:n=>String(factorial(n)),permutations:(n,r)=>{n=int(n,'n');r=int(r,'r');if(n<0||r<0||r>n||n>500)throw Error('invalid-range');let x=1n;for(let i=n-r+1;i<=n;i++)x*=BigInt(i);return String(x);},combinations:(n,r)=>{n=int(n,'n');r=int(r,'r');if(n<0||r<0||r>n||n>500)throw Error('invalid-range');r=Math.min(r,n-r);let x=1n;for(let i=1;i<=r;i++)x=x*BigInt(n-r+i)/BigInt(i);return String(x);}};
    const trig={sin:d=>Math.sin(num(d,'angle')*Math.PI/180),cos:d=>Math.cos(num(d,'angle')*Math.PI/180),tan:d=>{const a=num(d,'angle')*Math.PI/180;if(Math.abs(Math.cos(a))<1e-12)throw Error('undefined-tangent');return Math.tan(a);},asin:x=>Math.asin(Math.max(-1,Math.min(1,num(x,'ratio'))))*180/Math.PI,acos:x=>Math.acos(Math.max(-1,Math.min(1,num(x,'ratio'))))*180/Math.PI,atan:x=>Math.atan(num(x,'ratio'))*180/Math.PI,toDegrees:r=>num(r,'radians')*180/Math.PI};
    const sequences={arithmetic:(a,d,n)=>num(a,'a')+(int(n,'n')-1)*num(d,'d'),arithmeticSum:(a,d,n)=>{n=int(n,'n');return n*(2*num(a,'a')+(n-1)*num(d,'d'))/2;},geometric:(a,q,n)=>num(a,'a')*Math.pow(num(q,'q'),int(n,'n')-1),geometricSum:(a,q,n)=>{n=int(n,'n');q=num(q,'q');return Math.abs(q-1)<1e-12?num(a,'a')*n:num(a,'a')*(1-Math.pow(q,n))/(1-q);}};
    return Object.freeze({statistics:Object.freeze(stats),percentages:Object.freeze(percentages),numberTheory:Object.freeze(numberTheory),trigonometry:Object.freeze(trig),sequences:Object.freeze(sequences)});
  }
  function integratePolynomial(source, lower, upper) {
    const terms=derivative(source).polynomial.map(t=>({coefficient:t.coefficient/(t.power+1),power:t.power+1}));
    const primitive=x=>terms.reduce((s,t)=>s+t.coefficient*Math.pow(x,t.power),0);
    const format=terms.slice().sort((a,b)=>b.power-a.power).map(t=>`${Number(t.coefficient.toFixed(10))}${t.power?'x'+(t.power===1?'':'^'+t.power):''}`).join(' + ').replace(/\+ -/g,'- ')||'0';
    const out={antiderivative:format+' + C',terms,steps:['نستعمل قاعدة تكامل a·xⁿ: نقسم المعامل على n+1 ونرفع الأس إلى n+1.','نكامل كل حد على حدة.']};
    if(lower!==undefined&&upper!==undefined){const a=numBound(lower),b=numBound(upper);out.bounds=[a,b];out.definite=primitive(b)-primitive(a);out.steps.push('نحسب F(b) − F(a).');}return out;
  }
  function numBound(v){const n=Number(v);if(!Number.isFinite(n))throw Error('invalid-bound');return n;}
  function solveQuadraticComplex(equation) {
    const p=clean(equation).split('=');if(p.length!==2)throw Error('expected-one-equals');const a=polynomialCoefficients(p[0]),b=polynomialCoefficients(p[1]),c=Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]||0)-(b[i]||0));while(c.length>1&&Math.abs(c[c.length-1])<1e-12)c.pop();if(c.length>3)throw Error('quadratic-degree-limit');
    const A=c[2]||0,B=c[1]||0,C=c[0]||0;if(Math.abs(A)<1e-12){if(Math.abs(B)<1e-12)return {kind:Math.abs(C)<1e-12?'identity':'no-solution',roots:[]};return {kind:'linear',roots:[{re:-C/B,im:0}]};}
    const d=B*B-4*A*C;if(d>=0){const r=Math.sqrt(d);return {kind:d===0?'repeated-real':'two-real',discriminant:d,roots:[{re:(-B-r)/(2*A),im:0},{re:(-B+r)/(2*A),im:0}]};}const re=-B/(2*A),im=Math.sqrt(-d)/(2*Math.abs(A));return {kind:'two-complex',discriminant:d,roots:[{re,im:-im},{re,im}]};
  }

  // Numerical function study for polynomial functions only (degree <= 12).
  // Root isolation uses a finite scan followed by bisection; it is not a symbolic CAS.
  function functionAnalysis() {
    const parsed = source => derivative(source).polynomial;
    const value = (p, x) => evaluatePolynomial(p, x);
    const finite = (v, key) => { v = Number(v); if (!Number.isFinite(v)) throw Error('invalid-' + key); return v; };
    const rootsIn = (p, a, b, steps, tolerance) => {
      a=finite(a,'lower-bound'); b=finite(b,'upper-bound');
      if (!(a < b)) throw Error('invalid-interval');
      steps=steps==null?2000:Number(steps); tolerance=tolerance==null?1e-9:Number(tolerance);
      if (!Number.isInteger(steps)||steps<10||steps>200000||!Number.isFinite(tolerance)||tolerance<=0) throw Error('invalid-root-options');
      const roots=[], f=x=>value(p,x), add=x=>{if(!roots.some(r=>Math.abs(r-x)<Math.max(tolerance*10,1e-7)))roots.push(x);};
      let x0=a,y0=f(x0);
      if(Math.abs(y0)<=tolerance)add(x0);
      for(let i=1;i<=steps;i++){
        const x1=a+(b-a)*i/steps,y1=f(x1);
        if(Math.abs(y1)<=tolerance)add(x1);
        if(y0*y1<0){let lo=x0,hi=x1,fl=y0;for(let k=0;k<100&&hi-lo>tolerance;k++){const mid=(lo+hi)/2,fm=f(mid);if(Math.abs(fm)<=tolerance){lo=hi=mid;break;}if(fl*fm<=0)hi=mid;else{lo=mid;fl=fm;}}add((lo+hi)/2);}
        x0=x1;y0=y1;
      }
      return roots.sort((x,y)=>x-y);
    };
    const api={
      evaluate(source,x){const p=parsed(source);return {x:finite(x,'x'),value:value(p,Number(x))};},
      table(source,values){if(!Array.isArray(values)||!values.length)throw Error('empty-x-values');const p=parsed(source);return values.map(x=>({x:finite(x,'x'),y:value(p,Number(x))}));},
      limit(source,at,direction){
        const p=parsed(source);direction=direction||'both';if(!['both','left','right'].includes(direction))throw Error('invalid-limit-direction');
        if(at==='infinity'||at==='+infinity'||at==='-infinity'||at===Infinity||at===-Infinity){const sign=at==='-infinity'||at===-Infinity?-1:1;let degree=-1,lead=0;p.forEach(t=>{if(t.coefficient!==0&&t.power>degree){degree=t.power;lead=t.coefficient;}});if(degree<0)return {kind:'finite',value:0,at:sign>0?'+infinity':'-infinity'};if(degree===0)return {kind:'finite',value:lead,at:sign>0?'+infinity':'-infinity'};const s=lead*(sign<0&&degree%2?-1:1);return {kind:s>0?'positive-infinity':'negative-infinity',at:sign>0?'+infinity':'-infinity'};}
        const x=finite(at,'limit-point');return {kind:'finite',value:value(p,x),at:x,direction, twoSided:true, note:'كثيرات الحدود متصلة؛ النهاية تساوي قيمة الدالة.'};
      },
      roots(source,lower,upper,options){const p=parsed(source);options=options||{};lower=finite(lower,'lower-bound');upper=finite(upper,'upper-bound');if(!(lower<upper))throw Error('invalid-interval');if(p.every(t=>Math.abs(t.coefficient)<1e-12))return {interval:[Number(lower),Number(upper)],kind:'all-real',roots:[],method:'constant-polynomial'};if(p.length===1)return {interval:[Number(lower),Number(upper)],kind:'none',roots:[],method:'constant-polynomial'};return {interval:[Number(lower),Number(upper)],kind:'finite',roots:rootsIn(p,lower,upper,options.steps,options.tolerance),method:'scan-and-bisection',note:'قد لا يلتقط المسح الجذور ذات التماس دون تغيير إشارة الدالة.'};},
      criticalPoints(source,lower,upper,options){const d=derivative(source).coefficients;if(d.length===1&&Math.abs(d[0].coefficient)<1e-12)return [];const options2=options||{};return rootsIn(d,lower,upper,options2.steps,options2.tolerance).map(x=>({x,y:value(parsed(source),x),secondDerivative:derivativeAt(derivative(source).derivative,x).value}));},
      variation(source,lower,upper,options){
        const p=parsed(source),d=derivative(source).coefficients;if(d.every(t=>Math.abs(t.coefficient)<1e-12)){const lo=finite(lower,'lower-bound'),hi=finite(upper,'upper-bound');if(!(lo<hi))throw Error('invalid-interval');return {interval:[lo,hi],criticalPoints:[],intervals:[{from:lo,to:hi,trend:'constant',fromValue:value(p,lo),toValue:value(p,hi)}],method:'constant-polynomial'};}const critical=rootsIn(d,lower,upper,options&&options.steps,options&&options.tolerance).filter(x=>x>Number(lower)+1e-8&&x<Number(upper)-1e-8);
        const bounds=[Number(lower),...critical,Number(upper)];if(!Number.isFinite(bounds[0])||!Number.isFinite(bounds[bounds.length-1])||!(bounds[0]<bounds[bounds.length-1]))throw Error('invalid-interval');
        const intervals=[];for(let i=0;i<bounds.length-1;i++){const mid=(bounds[i]+bounds[i+1])/2,der=value(d,mid);intervals.push({from:bounds[i],to:bounds[i+1],trend:der>1e-9?'increasing':der< -1e-9?'decreasing':'constant',fromValue:value(p,bounds[i]),toValue:value(p,bounds[i+1])});}
        const points=critical.map(x=>({x,y:value(p,x)}));return {interval:[bounds[0],bounds[bounds.length-1]],criticalPoints:points,intervals,method:'polynomial-derivative-sign-sampling'};
      }
    };
    return Object.freeze(api);
  }

  // Safe numerical evaluator for rational/radical expressions; no eval/Function.
  // Syntax: x, numbers, + - * / ^ (integer powers), sqrt(...), and implicit 2x.
  function generalFunctionAnalysis() {
    const normalize = source => clean(source).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g,'.').replace(/√\s*\(/g,'sqrt(');
    function compile(source) {
      const s=normalize(source); const tokens=s.match(/sqrt|(?:\d+\.?\d*|\.\d+)|x|[()+\-*/^]/gi)||[];
      if(tokens.join('').replace(/\s/g,'')!==s.replace(/\s/g,'')) throw Error('invalid-function-expression');
      let i=0; const peek=()=>tokens[i]; const take=t=>{if(tokens[i]!==t)throw Error('expected-'+t);i++;};
      function expression(){let n=term();while(peek()==='+'||peek()==='-'){const op=tokens[i++],r=term();n={op,left:n,right:r};}return n;}
      function startsFactor(t){return t==='x'||t==='sqrt'||t==='('||(t&&/^(?:\d|\.)/.test(t));}
      function term(){let n=unary();while(peek()==='*'||peek()==='/'||startsFactor(peek())){let op=peek();if(op==='*'||op==='/')i++;else op='*';const r=unary();n={op,left:n,right:r};}return n;}
      function unary(){if(peek()==='+'){i++;return unary();}if(peek()==='-'){i++;return {op:'neg',value:unary()};}return power();}
      function power(){let n=atom();if(peek()==='^'){i++;const t=peek();if(!t||! /^\d+$/.test(t))throw Error('integer-power-required');i++;n={op:'pow',left:n,right:Number(t)};}return n;}
      function atom(){const t=peek();if(t==='('){i++;const n=expression();take(')');return n;}if(t==='sqrt'){i++;take('(');const n=expression();take(')');return {op:'sqrt',value:n};}if(t==='x'){i++;return {op:'x'};}if(t&&/^(?:\d|\.)/.test(t)){i++;return {op:'n',value:Number(t)};}throw Error('invalid-function-expression');}
      const ast=expression();if(i!==tokens.length)throw Error('unexpected-function-token');
      function run(n,x){let v;if(n.op==='n')v=n.value;else if(n.op==='x')v=x;else if(n.op==='neg')v=-run(n.value,x);else if(n.op==='sqrt'){const a=run(n.value,x);if(a<0)throw Error('outside-real-domain');v=Math.sqrt(a);}else if(n.op==='pow')v=Math.pow(run(n.left,x),n.right);else{const a=run(n.left,x),b=run(n.right,x);if(n.op==='+')v=a+b;else if(n.op==='-')v=a-b;else if(n.op==='*')v=a*b;else{if(Math.abs(b)<1e-14)throw Error('division-by-zero');v=a/b;}}if(!Number.isFinite(v))throw Error('non-finite-function-value');return v;}
      return x=>run(ast,Number(x));
    }
    const finite=(v,k)=>{v=Number(v);if(!Number.isFinite(v))throw Error('invalid-'+k);return v;};
    const api={
      evaluate(source,x){const f=compile(source),at=finite(x,'x');return {x:at,value:f(at)};},
      table(source,xValues){if(!Array.isArray(xValues)||!xValues.length)throw Error('empty-x-values');const f=compile(source);return xValues.map(x=>{x=finite(x,'x');try{return {x,y:f(x),defined:true};}catch(e){return {x,y:null,defined:false,reason:e.message};}});},
      domainCheck(source,x){const f=compile(source);x=finite(x,'x');try{return {x,defined:true,value:f(x)};}catch(e){return {x,defined:false,reason:e.message};}},
      limit(source,at,direction){
        const f=compile(source);direction=direction||'both';if(!['left','right','both'].includes(direction))throw Error('invalid-limit-direction');
        if(at==='infinity'||at==='+infinity'||at==='-infinity'){const sign=at==='-infinity'?-1:1;const vals=[10,100,1000,10000].map(t=>{try{return f(sign*t);}catch(_){return NaN;}}).filter(Number.isFinite);if(!vals.length)return {kind:'undefined',at};const last=vals[vals.length-1];if(Math.abs(last)>1e8)return {kind:last>0?'positive-infinity':'negative-infinity',at};return {kind:'finite-or-undetermined',value:last,at,note:'تقريب عددي من قيم بعيدة؛ لا يمثل برهاناً رمزياً.'};}
        at=finite(at,'limit-point');const side=d=>{const vals=[];for(let k=2;k<=12;k++){try{vals.push(f(at+d*Math.pow(10,-k)));}catch(_){vals.push(NaN);}}const v=vals.filter(Number.isFinite);if(!v.length)return {kind:'undefined'};const a=v[v.length-1],b=v[Math.max(0,v.length-3)];if(Math.abs(a)>1e8&&Math.abs(b)>1e7)return {kind:a>0?'positive-infinity':'negative-infinity'};return {kind:'approximate',value:a,stable:Math.abs(a-b)<1e-4*Math.max(1,Math.abs(a))};};
        if(direction==='left'||direction==='right')return {at,direction,result:side(direction==='left'?-1:1)};return {at,direction,left:side(-1),right:side(1),twoSided:null,note:'تتساوى النهاية الثنائية إذا تقاربت النهايتان الجانبيتان إلى القيمة نفسها.'};
      },
      roots(source,lower,upper,options){const f=compile(source);lower=finite(lower,'lower-bound');upper=finite(upper,'upper-bound');if(!(lower<upper))throw Error('invalid-interval');options=options||{};const steps=options.steps==null?4000:Number(options.steps),tol=options.tolerance==null?1e-8:Number(options.tolerance);if(!Number.isInteger(steps)||steps<20||steps>200000||tol<=0)throw Error('invalid-root-options');const roots=[];let x0=lower,y0;try{y0=f(x0);}catch(_){y0=NaN;}for(let i=1;i<=steps;i++){const x1=lower+(upper-lower)*i/steps;let y1;try{y1=f(x1);}catch(_){y1=NaN;}if(Number.isFinite(y0)&&Math.abs(y0)<tol&&!roots.some(r=>Math.abs(r-x0)<tol*10))roots.push(x0);if(Number.isFinite(y0)&&Number.isFinite(y1)&&y0*y1<0){let lo=x0,hi=x1,fl=y0;for(let k=0;k<100&&hi-lo>tol;k++){const m=(lo+hi)/2;let fm;try{fm=f(m);}catch(_){break;}if(Math.abs(fm)<tol){lo=hi=m;break;}if(fl*fm<=0)hi=m;else{lo=m;fl=fm;}}const r=(lo+hi)/2;if(!roots.some(v=>Math.abs(v-r)<tol*10))roots.push(r);}x0=x1;y0=y1;}return {interval:[lower,upper],roots:roots.sort((a,b)=>a-b),method:'numerical-scan-bisection',note:'قد تفوت الجذور المماسية أو القريبة من نقاط عدم التعريف.'};},
      extrema(source,lower,upper,options){const f=compile(source);lower=finite(lower,'lower-bound');upper=finite(upper,'upper-bound');if(!(lower<upper))throw Error('invalid-interval');options=options||{};const steps=options.steps==null?2000:Number(options.steps);if(!Number.isInteger(steps)||steps<20||steps>200000)throw Error('invalid-sampling-steps');const points=[];for(let i=0;i<=steps;i++){const x=lower+(upper-lower)*i/steps;let y;try{y=f(x);}catch(_){y=NaN;}points.push({x,y});}const found=[];for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1];if(!Number.isFinite(a.y)||!Number.isFinite(b.y)||!Number.isFinite(c.y))continue;if((b.y<=a.y&&b.y<=c.y)||(b.y>=a.y&&b.y>=c.y))found.push({x:b.x,y:b.y,kind:b.y<=a.y&&b.y<=c.y?'local-minimum':'local-maximum'});}return {interval:[lower,upper],extrema:found,method:'sampled-local-extrema',note:'نتائج تقريبية تعتمد على كثافة العينة وقد لا تلتقط القيم القصوى الحادة.'};},
      derivativeAt(source,x,options){const f=compile(source);x=finite(x,'x');options=options||{};const h=options.step==null?Math.pow(Number.EPSILON,1/3)*Math.max(1,Math.abs(x)):finite(options.step,'step');if(h<=0)throw Error('invalid-derivative-step');const a=f(x-h),b=f(x+h);return {x,value:(b-a)/(2*h),method:'central-finite-difference',step:h,note:'مشتقة تقريبية بالفروق المركزية؛ لا تمثل اشتقاقاً رمزياً.'};},
      derivativeTable(source,xValues,options){if(!Array.isArray(xValues)||!xValues.length)throw Error('empty-x-values');return xValues.map(x=>{x=finite(x,'x');try{return Object.assign({defined:true},this.derivativeAt(source,x,options));}catch(e){return {x,defined:false,reason:e.message};}});},
      signStudy(source,lower,upper,options){const f=compile(source);lower=finite(lower,'lower-bound');upper=finite(upper,'upper-bound');if(!(lower<upper))throw Error('invalid-interval');options=options||{};const steps=options.steps==null?2000:Number(options.steps);if(!Number.isInteger(steps)||steps<20||steps>200000)throw Error('invalid-sampling-steps');const samples=[];for(let i=0;i<=steps;i++){const x=lower+(upper-lower)*i/steps;let y;try{y=f(x);}catch(_){y=NaN;}samples.push({x,sign:Number.isFinite(y)?(Math.abs(y)<1e-10?0:(y>0?1:-1)):null});}const zeros=[];for(let i=0;i<samples.length;i++){const q=samples[i];if(q.sign===0)zeros.push(q.x);else if(i&&q.sign!==null&&samples[i-1].sign!==null&&q.sign!==samples[i-1].sign)zeros.push((q.x+samples[i-1].x)/2);}const intervals=[];let start=lower,last=null;for(let i=0;i<samples.length;i++){const q=samples[i];if(q.sign===null){if(last!==null)intervals.push({from:start,to:samples[i-1].x,sign:last});start=q.x;last=null;}else if(last===null){last=q.sign;start=q.x;}else if(q.sign!==last&&q.sign!==0){intervals.push({from:start,to:samples[i-1].x,sign:last});start=q.x;last=q.sign;}}if(last!==null)intervals.push({from:start,to:upper,sign:last});return {interval:[lower,upper],zeros:Array.from(new Set(zeros.map(x=>Number(x.toPrecision(10))))).sort((a,b)=>a-b),intervals,method:'numerical-sign-sampling',note:'جدول إشارة تقريبي؛ قد تفوت الجذور المماسية أو الفجوات الضيقة.'};},
      monotonicity(source,lower,upper,options){const f=compile(source);lower=finite(lower,'lower-bound');upper=finite(upper,'upper-bound');if(!(lower<upper))throw Error('invalid-interval');options=options||{};const steps=options.steps==null?1000:Number(options.steps);if(!Number.isInteger(steps)||steps<20||steps>200000)throw Error('invalid-sampling-steps');const h=Math.max(1e-6,(upper-lower)/steps/10),samples=[];for(let i=0;i<=steps;i++){const x=lower+(upper-lower)*i/steps;let d;try{d=(f(x+h)-f(x-h))/(2*h);}catch(_){d=NaN;}samples.push({x,sign:Number.isFinite(d)?(Math.abs(d)<1e-7?0:(d>0?1:-1)):null});}const segments=[];let start=lower,sign=null;for(let i=0;i<samples.length;i++){const q=samples[i];if(q.sign===null)continue;if(sign===null){sign=q.sign;start=q.x;}else if(q.sign!==sign&&q.sign!==0){segments.push({from:start,to:q.x,trend:sign>0?'increasing':sign<0?'decreasing':'stationary-or-flat'});start=q.x;sign=q.sign;}}if(sign!==null)segments.push({from:start,to:upper,trend:sign>0?'increasing':sign<0?'decreasing':'stationary-or-flat'});return {interval:[lower,upper],segments,method:'numerical-derivative-sign',note:'التزايد والتناقص مستنتجان عددياً من المشتقة التقريبية.'};},
      compareAnswers(reference,candidate,options){const f=compile(reference),g=compile(candidate);options=options||{};const xs=Array.isArray(options.samples)&&options.samples.length?options.samples:[-3,-1,0,1,2,4];const tolerance=options.tolerance==null?1e-7:finite(options.tolerance,'tolerance');if(tolerance<0)throw Error('invalid-tolerance');const checks=xs.map(x=>{x=finite(x,'sample');try{const a=f(x),b=g(x),difference=Math.abs(a-b);return {x,reference:a,candidate:b,equivalent:difference<=tolerance,difference};}catch(e){return {x,equivalent:false,reason:e.message};}});return {equivalent:checks.every(q=>q.equivalent),checks,method:'finite-sample-numeric-comparison',note:'تطابق القيم في عينات محدودة لا يثبت التكافؤ الجبري العام.'};},
      secondDerivativeAt(source,x,options){const f=compile(source);x=finite(x,'x');options=options||{};const h=options.step==null?Math.pow(Number.EPSILON,1/4)*Math.max(1,Math.abs(x)):finite(options.step,'step');if(h<=0)throw Error('invalid-derivative-step');const y0=f(x),yp=f(x+h),ym=f(x-h);return {x,value:(yp-2*y0+ym)/(h*h),method:'central-second-difference',step:h,note:'المشتقة الثانية تقريب عددي حساس لاختيار الخطوة.'};},
      tangentLine(source,x,options){const f=compile(source);x=finite(x,'x');const y=f(x),d=this.derivativeAt(source,x,options).value;return {x,y,slope:d,equation:{form:'y = slope*(X - x0) + y0',slope:d, x0:x,y0:y},method:'numerical-tangent',note:'معادلة المماس تقريبية لأن الميل مشتق عددي.'};},
      linearApproximation(source,x0,xValues,options){const f=compile(source);x0=finite(x0,'x0');if(!Array.isArray(xValues)||!xValues.length)throw Error('empty-x-values');const y0=f(x0),slope=this.derivativeAt(source,x0,options).value;return {x0,y0,slope,values:xValues.map(x=>{x=finite(x,'x');return {x,approximation:y0+slope*(x-x0),actual:(()=>{try{return f(x);}catch(_){return null;}})()};}),method:'first-order-taylor-numerical',note:'تقريب خطي محلي يكون أفضل عادة قرب x0.'};},
      newtonRoot(source,initial,options){const f=compile(source);let x=finite(initial,'initial');options=options||{};const maxIterations=options.maxIterations==null?50:Number(options.maxIterations),tolerance=options.tolerance==null?1e-9:finite(options.tolerance,'tolerance');if(!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>500||tolerance<=0)throw Error('invalid-newton-options');const history=[];for(let i=0;i<maxIterations;i++){const y=f(x),d=this.derivativeAt(source,x,options).value;history.push({iteration:i,x,value:y,derivative:d});if(Math.abs(y)<=tolerance)return {converged:true,root:x,iterations:i,history,method:'newton-numerical-derivative'};if(!Number.isFinite(d)||Math.abs(d)<1e-12)return {converged:false,root:null,iterations:i,history,reason:'derivative-too-small'};const next=x-y/d;if(!Number.isFinite(next)||Math.abs(next)>1e12)return {converged:false,root:null,iterations:i+1,history,reason:'iteration-diverged'};if(Math.abs(next-x)<=tolerance){let residual;try{residual=Math.abs(f(next));}catch(_){residual=Infinity;}return {converged:residual<=Math.sqrt(tolerance),root:residual<=Math.sqrt(tolerance)?next:null,iterations:i+1,history,residual,reason:residual<=Math.sqrt(tolerance)?undefined:'step-small-residual-large'};}x=next;}return {converged:false,root:null,iterations:maxIterations,history,reason:'maximum-iterations'};},
      classifyCriticalPoint(source,x,options){const f=compile(source);x=finite(x,'x');options=options||{};const h=options.step==null?1e-4*Math.max(1,Math.abs(x)):finite(options.step,'step');if(h<=0)throw Error('invalid-classification-step');const left=this.derivativeAt(source,x-h,options).value,right=this.derivativeAt(source,x+h,options).value;let kind='inconclusive';if(left<0&&right>0)kind='local-minimum';else if(left>0&&right<0)kind='local-maximum';else if(left*right>0)kind='not-extremum';return {x,y:f(x),leftDerivative:left,rightDerivative:right,kind,method:'derivative-sign-neighborhood',note:'تصنيف تقريبي يعتمد على إشارتَي المشتقة قرب النقطة.'};}
    }; return Object.freeze(api);
  }

  function mathCurriculum() {
    const data=[
      ['الأولى ابتدائي', [['الجمع','الحساب','الحساب والتطبيق'],['الحساب','الهندسة'],['القسمة','حل المسائل']], [['الجمع ضمن 20','الجمع في وضعية إدماجية','الجمع والطرح','العمليات على الأعداد','توظيف العمليات الحسابية في وضعية قصيرة'],['الضرب','محيط المستطيل'],['القسمة في وضعية','مسألة متعددة الخطوات']]],
      ['الثانية ابتدائي', [['الحساب','الطرح'],['الحساب','الحساب والتطبيق','الهندسة'],['القسمة','حل المسائل']], [['الجمع في وضعية إدماجية','الجمع والطرح','الطرح دون استلاف','العمليات على الأعداد'],['الضرب','توظيف العمليات الحسابية في وضعية قصيرة','محيط المستطيل'],['القسمة في وضعية','مسألة متعددة الخطوات']]],
      ['الثالثة ابتدائي', [['الحساب'],['الحساب','الضرب','الهندسة'],['الحساب والتطبيق','القسمة','حل المسائل']], [['الجمع في وضعية إدماجية','الجمع والطرح','العمليات على الأعداد'],['الضرب','جداول الضرب','محيط المستطيل'],['القسمة في وضعية','توظيف العمليات الحسابية في وضعية قصيرة','مسألة متعددة الخطوات']]],
      ['الرابعة ابتدائي', [['الحساب','الحساب والتطبيق','العمليات'],['الحساب','الهندسة'],['القسمة','حل المسائل']], [['الجمع في وضعية إدماجية','الجمع والطرح','العمليات على الأعداد','توظيف العمليات الحسابية في وضعية قصيرة','جمع الأعداد الطبيعية'],['الضرب','محيط المستطيل'],['القسمة في وضعية','مسألة متعددة الخطوات']]],
      ['الخامسة ابتدائي', [['الحساب'],['الحساب','الحساب والتطبيق','الكسور','الهندسة'],['القسمة','حل المسائل']], [['الجمع في وضعية إدماجية','الجمع والطرح','العمليات على الأعداد'],['الضرب','توظيف العمليات الحسابية في وضعية قصيرة','جمع الكسور المتساوية المقام','محيط المستطيل'],['القسمة في وضعية','مسألة متعددة الخطوات']]],
      ['الأولى متوسط', [['الجبر','الحساب','الحساب والتطبيق'],['الأعداد والكسور','الهندسة'],['الهندسة','حل المسائل']], [['أولويات العمليات','الجمع والطرح','العمليات على الأعداد','المعادلات','توظيف العمليات الحسابية في وضعية قصيرة'],['تبسيط الكسور','محيط المستطيل'],['محيط المستطيل','مسألة متعددة الخطوات']]],
      ['الثانية متوسط', [['الجبر','الحساب'],['الأعداد والكسور','الحساب والتطبيق','المعادلات','الهندسة'],['الهندسة','حل المسائل']], [['الجمع والطرح','العمليات على الأعداد','المعادلات'],['تبسيط الكسور','توظيف العمليات الحسابية في وضعية قصيرة','محيط المستطيل','معادلات من الدرجة الأولى'],['محيط المستطيل','مسألة متعددة الخطوات']]],
      ['الثالثة متوسط', [['الجبر','الحساب'],['الأعداد والكسور','الهندسة'],['الحساب والتطبيق','الهندسة','حل المسائل']], [['الجمع والطرح','العمليات على الأعداد','المعادلات'],['تبسيط الكسور','محيط المستطيل'],['توظيف العمليات الحسابية في وضعية قصيرة','محيط المستطيل','مسألة متعددة الخطوات']]],
      ['الرابعة متوسط', [['الجبر','الحساب','الحساب والتطبيق'],['الأعداد والكسور','المعادلات','الهندسة'],['الهندسة','حل المسائل']], [['الجمع والطرح','العمليات على الأعداد','المعادلات','توظيف العمليات الحسابية في وضعية قصيرة'],['تبسيط الكسور','حل معادلة خطية','محيط المستطيل'],['محيط المستطيل','مسألة متعددة الخطوات']]],
      ['الأولى ثانوي', [['الجبر','الحساب','الحساب والتطبيق','الدوال'],['النسب المئوية','الهندسة'],['الاحتمالات','حل المسائل']], [['الجمع والطرح','العمليات على الأعداد','توظيف العمليات الحسابية في وضعية قصيرة','حساب صورة عدد','حل معادلة من الدرجة الأولى'],['حساب التخفيضات والنسب المئوية','محيط المستطيل'],['حساب احتمال بسيط','مسألة متعددة الخطوات']]],
      ['الثانية ثانوي', [['الجبر','الحساب'],['الحساب والتطبيق','المعادلات','النسب المئوية','الهندسة'],['الاحتمالات','حل المسائل']], [['الجمع والطرح','العمليات على الأعداد','حل معادلة من الدرجة الأولى'],['توظيف العمليات الحسابية في وضعية قصيرة','حساب التخفيضات والنسب المئوية','محيط المستطيل','معادلات تربيعية بسيطة'],['حساب احتمال بسيط','مسألة متعددة الخطوات']]],
      ['الثالثة ثانوي', [['الجبر','الحساب'],['النسب المئوية','الهندسة'],['الاحتمالات','الاشتقاق','الحساب والتطبيق','حل المسائل']], [['الجمع والطرح','العمليات على الأعداد','حل معادلة من الدرجة الأولى'],['حساب التخفيضات والنسب المئوية','محيط المستطيل'],['توظيف العمليات الحسابية في وضعية قصيرة','حساب احتمال بسيط','حساب قيمة المشتقة','مسألة متعددة الخطوات']]]
    ];
    return Object.freeze({country:'DZ',academicYear:'2026-2027',subject:'الرياضيات',grades:Object.freeze(data.map((g,i)=>Object.freeze({id:'dz-math-'+(i+1),grade:g[0],terms:Object.freeze(g[1].map((topics,j)=>Object.freeze({term:j+1,topics:Object.freeze(topics),lessons:Object.freeze(g[2][j])}))),status:'platform_suggested_mapping_pending_official_progression',officialSequenceVerified:false}))),policy:'خريطة أولية من بيانات المنصة وليست التدرجات الرسمية المعتمدة؛ يلزم مطابقتها مع وثائق الوزارة لكل مستوى وشعبة.'});
  }


  function analyticGeometry() {
    const point=(p,n)=>{if(!p||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))throw Error('invalid-'+n);return {x:Number(p.x),y:Number(p.y)};};
    const line=(A,B,C)=>{A=Number(A);B=Number(B);C=Number(C);if(![A,B,C].every(Number.isFinite)||Math.hypot(A,B)<1e-12)throw Error('invalid-line');return {A,B,C};};
    return Object.freeze({
      distance(a,b){a=point(a,'point-a');b=point(b,'point-b');return Math.hypot(b.x-a.x,b.y-a.y);},
      midpoint(a,b){a=point(a,'point-a');b=point(b,'point-b');return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};},
      lineThrough(a,b){a=point(a,'point-a');b=point(b,'point-b');if(Math.hypot(a.x-b.x,a.y-b.y)<1e-12)throw Error('coincident-points');const A=a.y-b.y,B=b.x-a.x,C=a.x*b.y-b.x*a.y;return line(A,B,C);},
      slope(a,b){a=point(a,'point-a');b=point(b,'point-b');if(Math.abs(b.x-a.x)<1e-12)return null;return (b.y-a.y)/(b.x-a.x);},
      intersection(l1,l2){l1=line(l1.A,l1.B,l1.C);l2=line(l2.A,l2.B,l2.C);const d=l1.A*l2.B-l2.A*l1.B;if(Math.abs(d)<1e-12)return {kind:Math.abs(l1.A*l2.C-l2.A*l1.C)<1e-12&&Math.abs(l1.B*l2.C-l2.B*l1.C)<1e-12?'coincident':'parallel'};return {kind:'unique',x:(l1.B*l2.C-l2.B*l1.C)/d,y:(l1.C*l2.A-l2.C*l1.A)/d};},
      pointLineDistance(p,l){p=point(p,'point');l=line(l.A,l.B,l.C);return Math.abs(l.A*p.x+l.B*p.y+l.C)/Math.hypot(l.A,l.B);},
      circleThroughThree(a,b,c){a=point(a,'a');b=point(b,'b');c=point(c,'c');const d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));if(Math.abs(d)<1e-12)throw Error('collinear-points');const aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y;const x=(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/d,y=(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/d;return {center:{x,y},radius:Math.hypot(x-a.x,y-a.y)};}
    });
  }
  function vectorMath() {
    const v=(a,n)=>{if(!a||!Array.isArray(a)||a.length<2||a.length>3||a.some(x=>!Number.isFinite(Number(x))))throw Error('invalid-'+n);return a.map(Number);};
    const same=(a,b)=>{a=v(a,'vector-a');b=v(b,'vector-b');if(a.length!==b.length)throw Error('dimension-mismatch');return [a,b];};
    return Object.freeze({
      add(a,b){const [x,y]=same(a,b);return x.map((z,i)=>z+y[i]);},
      subtract(a,b){const [x,y]=same(a,b);return x.map((z,i)=>z-y[i]);},
      scale(a,k){a=v(a,'vector');k=Number(k);if(!Number.isFinite(k))throw Error('invalid-scalar');return a.map(x=>x*k);},
      dot(a,b){const [x,y]=same(a,b);return x.reduce((s,z,i)=>s+z*y[i],0);},
      norm(a){a=v(a,'vector');return Math.hypot(...a);},
      angleDegrees(a,b){const [x,y]=same(a,b),den=Math.hypot(...x)*Math.hypot(...y);if(!den)throw Error('zero-vector');return Math.acos(Math.max(-1,Math.min(1,x.reduce((s,z,i)=>s+z*y[i],0)/den)))*180/Math.PI;},
      cross3(a,b){a=v(a,'vector');b=v(b,'vector');if(a.length!==3||b.length!==3)throw Error('cross-product-needs-3d');return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    });
  }
  function solidGeometry() {
    const n=(v,k)=>{v=Number(v);if(!Number.isFinite(v)||v<0)throw Error('invalid-'+k);return v;};
    return Object.freeze({
      cube(a){a=n(a,'side');return {volume:a**3,totalSurfaceArea:6*a*a,lateralSurfaceArea:4*a*a,faceDiagonal:a*Math.sqrt(2),spaceDiagonal:a*Math.sqrt(3)};},
      cuboid(l,w,h){l=n(l,'length');w=n(w,'width');h=n(h,'height');return {volume:l*w*h,totalSurfaceArea:2*(l*w+l*h+w*h),spaceDiagonal:Math.hypot(l,w,h)};},
      cylinder(r,h){r=n(r,'radius');h=n(h,'height');return {volume:Math.PI*r*r*h,lateralSurfaceArea:2*Math.PI*r*h,totalSurfaceArea:2*Math.PI*r*(r+h)};},
      cone(r,h){r=n(r,'radius');h=n(h,'height');const slant=Math.hypot(r,h);return {volume:Math.PI*r*r*h/3,slantHeight:slant,lateralSurfaceArea:Math.PI*r*slant,totalSurfaceArea:Math.PI*r*(r+slant)};},
      sphere(r){r=n(r,'radius');return {volume:4*Math.PI*r**3/3,surfaceArea:4*Math.PI*r*r};},
      prism(baseArea,perimeter,height){baseArea=n(baseArea,'base-area');perimeter=n(perimeter,'perimeter');height=n(height,'height');return {volume:baseArea*height,lateralSurfaceArea:perimeter*height};}
    });
  }
  function complexMath() {
    const z=(v,k)=>{if(!v||!Number.isFinite(Number(v.re))||!Number.isFinite(Number(v.im)))throw Error('invalid-'+k);return {re:Number(v.re),im:Number(v.im)};};
    return Object.freeze({
      add(a,b){a=z(a,'a');b=z(b,'b');return {re:a.re+b.re,im:a.im+b.im};},
      subtract(a,b){a=z(a,'a');b=z(b,'b');return {re:a.re-b.re,im:a.im-b.im};},
      multiply(a,b){a=z(a,'a');b=z(b,'b');return {re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re};},
      divide(a,b){a=z(a,'a');b=z(b,'b');const d=b.re*b.re+b.im*b.im;if(d===0)throw Error('division-by-zero');return {re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d};},
      conjugate(a){a=z(a,'z');return {re:a.re,im:-a.im};},
      modulus(a){a=z(a,'z');return Math.hypot(a.re,a.im);},
      argumentDegrees(a){a=z(a,'z');if(a.re===0&&a.im===0)throw Error('argument-zero-undefined');return Math.atan2(a.im,a.re)*180/Math.PI;},
      power(a,n){a=z(a,'z');n=Number(n);if(!Number.isSafeInteger(n)||Math.abs(n)>1000)throw Error('invalid-integer-power');if(n<0){const d=a.re*a.re+a.im*a.im;if(!d)throw Error('division-by-zero');a={re:a.re/d,im:-a.im/d};n=-n;}let out={re:1,im:0};while(n){if(n%2)out=this.multiply(out,a);a=this.multiply(a,a);n=Math.floor(n/2);}return out;}
    });
  }
  function probabilityMath() {
    const valid=(x,k)=>{x=Number(x);if(!Number.isFinite(x)||x<0||x>1)throw Error('invalid-'+k);return x;};
    return Object.freeze({
      complement(p){return 1-valid(p,'probability');},
      unionIndependent(pA,pB){pA=valid(pA,'pA');pB=valid(pB,'pB');return pA+pB-pA*pB;},
      intersectionIndependent(pA,pB){return valid(pA,'pA')*valid(pB,'pB');},
      conditional(joint,pB){joint=valid(joint,'joint');pB=valid(pB,'pB');if(!pB)throw Error('zero-conditioning-probability');if(joint>pB)throw Error('joint-exceeds-conditioning');return joint/pB;},
      binomial(n,k,p){n=Number(n);k=Number(k);p=valid(p,'probability');if(!Number.isInteger(n)||!Number.isInteger(k)||n<0||k<0||k>n||n>500)throw Error('invalid-binomial-range');let c=1n;for(let i=1;i<=Math.min(k,n-k);i++)c=c*BigInt(n-i+1)/BigInt(i);return Number(c)*Math.pow(p,k)*Math.pow(1-p,n-k);},
      expectedValue(values,probabilities){if(!Array.isArray(values)||!Array.isArray(probabilities)||!values.length||values.length!==probabilities.length)throw Error('invalid-distribution');const v=values.map(Number),p=probabilities.map(Number);if(v.some(x=>!Number.isFinite(x))||p.some(x=>!Number.isFinite(x)||x<0)||Math.abs(p.reduce((s,x)=>s+x,0)-1)>1e-9)throw Error('invalid-distribution');return v.reduce((s,x,i)=>s+x*p[i],0);}
    });
  }


  // Numerical geometry-criterion checks. These validate supplied measurements;
  // they are not a formal symbolic theorem prover.
  function geometryProofs() {
    const num=(v,k)=>{v=Number(v);if(!Number.isFinite(v))throw Error('invalid-'+k);return v;};
    const positiveArray=(a,k)=>{if(!Array.isArray(a)||!a.length)throw Error('invalid-'+k);const v=a.map(x=>num(x,k));if(v.some(x=>x<=0))throw Error('non-positive-'+k);return v;};
    const close=(a,b,t)=>Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b));
    const point=(p,k)=>{if(!p||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))throw Error('invalid-'+k);return {x:Number(p.x),y:Number(p.y)};};
    const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const result=(ok,criterion,checks)=>({verified:ok,criterion,checks,method:'numerical-measurement-check',warning:'التحقق العددي من المعطيات لا يعوّض البرهان الهندسي المكتوب.'});
    return Object.freeze({
      pythagoreanConverse(sides,tolerance){const a=positiveArray(sides,'sides');if(a.length!==3)throw Error('three-sides-required');const v=a.sort((x,y)=>x-y),t=tolerance==null?1e-8:num(tolerance,'tolerance'),delta=Math.abs(v[0]**2+v[1]**2-v[2]**2);return result(delta<=t*Math.max(1,v[2]**2),'converse-pythagorean',[{expression:'a² + b² = c²',left:v[0]**2+v[1]**2,right:v[2]**2,difference:delta,hypotenuse:v[2]}]);},
      triangleAngleSum(angles,tolerance){const a=positiveArray(angles,'angles');if(a.length!==3)throw Error('three-angles-required');const sum=a.reduce((x,y)=>x+y,0),t=tolerance==null?1e-8:num(tolerance,'tolerance');return result(a.every(x=>x<180)&&close(sum,180,t),'triangle-angle-sum',[{sumDegrees:sum,expectedDegrees:180}]);},
      similaritySSS(sidesA,sidesB,tolerance){const a=positiveArray(sidesA,'sides-a'),b=positiveArray(sidesB,'sides-b');if(a.length!==3||b.length!==3)throw Error('three-sides-required');const t=tolerance==null?1e-8:num(tolerance,'tolerance'),ratios=a.map((x,i)=>x/b[i]),ok=ratios.every(x=>close(x,ratios[0],t));return result(ok,'similarity-sss',[{ratios,commonRatio:ratios[0]}]);},
      congruenceSSS(sidesA,sidesB,tolerance){const a=positiveArray(sidesA,'sides-a'),b=positiveArray(sidesB,'sides-b');if(a.length!==3||b.length!==3)throw Error('three-sides-required');const t=tolerance==null?1e-8:num(tolerance,'tolerance'),checks=a.map((x,i)=>({side:i+1,first:x,second:b[i],equal:close(x,b[i],t)}));return result(checks.every(x=>x.equal),'congruence-sss',checks);},
      parallelVectors(a,b,tolerance){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||![2,3].includes(a.length))throw Error('invalid-vectors');const x=a.map(v=>num(v,'vector')),y=b.map(v=>num(v,'vector')),nx=Math.hypot(...x),ny=Math.hypot(...y);if(!nx||!ny)throw Error('zero-vector');const cross=x.length===2?x[0]*y[1]-x[1]*y[0]:Math.hypot(x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]),t=tolerance==null?1e-8:num(tolerance,'tolerance');return result(Math.abs(cross)<=t*nx*ny,'parallel-vectors',[{crossMagnitude:Math.abs(cross)}]);},
      perpendicularVectors(a,b,tolerance){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||![2,3].includes(a.length))throw Error('invalid-vectors');const x=a.map(v=>num(v,'vector')),y=b.map(v=>num(v,'vector')),nx=Math.hypot(...x),ny=Math.hypot(...y);if(!nx||!ny)throw Error('zero-vector');const dot=x.reduce((s,v,i)=>s+v*y[i],0),t=tolerance==null?1e-8:num(tolerance,'tolerance');return result(Math.abs(dot)<=t*nx*ny,'perpendicular-vectors',[{dotProduct:dot}]);},
      midpointTheorem(A,B,C,M,N,tolerance){A=point(A,'A');B=point(B,'B');C=point(C,'C');M=point(M,'M');N=point(N,'N');const t=tolerance==null?1e-8:num(tolerance,'tolerance'),mExpected={x:(A.x+B.x)/2,y:(A.y+B.y)/2},nExpected={x:(A.x+C.x)/2,y:(A.y+C.y)/2},midM=close(M.x,mExpected.x,t)&&close(M.y,mExpected.y,t),midN=close(N.x,nExpected.x,t)&&close(N.y,nExpected.y,t),bc=dist(B,C),mn=dist(M,N),parallel=Math.abs((N.x-M.x)*(C.y-B.y)-(N.y-M.y)*(C.x-B.x))<=t*Math.max(1,mn*bc),half=close(mn,bc/2,t);return result(midM&&midN&&parallel&&half,'triangle-midpoint-theorem',[{M_is_midpoint:midM,N_is_midpoint:midN,MN_parallel_BC:parallel,MN_equals_half_BC:half,MN:mn,BC:bc}]);}
    });
  }


  // Pedagogical orchestration layer. It structures teaching moves without
  // inventing curriculum content or claiming to infer a learner's mind.
  function pedagogyEngine() {
    const stages = {
      primary: { label: 'ابتدائي', guidance: 'اعتمد المحسوس والصور والأمثلة القريبة، وجمّل التعليمات إلى خطوات قصيرة مع تكرار الفكرة بطرق متنوعة.' },
      middle: { label: 'متوسط', guidance: 'اربط المحسوس بالمجرد، واطلب تفسير الاختيارات، ووازن بين العمل الفردي والتعاوني.' },
      secondary: { label: 'ثانوي', guidance: 'عمّق التجريد والاستدلال، واطلب تبرير الفرضيات ومناقشة البدائل وحدود النتائج.' }
    };
    const stageKey = value => {
      const v = clean(value).toLowerCase();
      if (/ابتدائي|primary|prim/.test(v)) return 'primary';
      if (/متوسط|middle|moyen/.test(v)) return 'middle';
      if (/ثانوي|secondary|secondaire/.test(v)) return 'secondary';
      return '';
    };
    const familyKey = value => {
      const v = clean(value).toLowerCase();
      if (/رياض|math|حساب/.test(v)) return 'mathematics';
      if (/فيزياء|كيمياء|علوم|biology|physics|chemistry|science/.test(v)) return 'sciences';
      if (/عربي|فرنسي|انجليزي|لغة|arabic|french|english|language/.test(v)) return 'languages';
      if (/تاريخ|جغرافيا|فلسفة|تربية مدنية|history|geography|philosophy/.test(v)) return 'humanities';
      if (/اعلام الي|تكنولوجيا|هندسة|تقني|technology|engineering|comput/.test(v)) return 'technology';
      if (/فنون|فني|موسيقى|رسم|art/.test(v)) return 'arts';
      return 'general';
    };
    const familyMoves = {
      mathematics: ['اطلب من المتعلم تقدير النتيجة قبل الحساب.', 'اجعل المتعلم يشرح سبب اختيار العملية أو الخاصية.', 'تحقق من النتيجة بالتعويض أو بطريقة مستقلة عندما يكون ذلك مناسبًا.'],
      sciences: ['ابدأ بملاحظة أو ظاهرة أو وثيقة قابلة للفحص.', 'افصل بين الملاحظة والتفسير والاستنتاج.', 'اطلب ربط كل استنتاج بدليل من المعطيات أو التجربة.'],
      languages: ['قدّم سياقًا تواصليًا واضحًا قبل القاعدة.', 'اعرض نموذجًا قصيرًا ثم وجّه المتعلم إلى ملاحظة النمط.', 'اطلب إنتاجًا جديدًا مع مراجعة المعنى والبنية واللغة.'],
      humanities: ['انطلق من وثيقة أو حدث أو سؤال إشكالي.', 'ميّز بين المعطى والرأي والتفسير.', 'اطلب حجة مدعومة بشاهد أو قرينة ومقارنة وجهات النظر.'],
      technology: ['ابدأ بحاجة أو مشكلة عملية محددة.', 'حلّل الوظائف والقيود قبل اختيار الحل.', 'اطلب اختبار الحل وتفسير النتائج والتحسينات الممكنة.'],
      arts: ['ابدأ بملاحظة نموذج أو تجربة تعبيرية.', 'شجّع التجريب مع تسمية الاختيارات الفنية.', 'قيّم العمل بمعايير معلنة مع مساحة للتعبير الشخصي.'],
      general: ['اربط الموضوع بموقف مفهوم للمتعلم.', 'قسّم الفكرة إلى عناصر قابلة للملاحظة.', 'اطلب تفسيرًا أو تطبيقًا جديدًا بدل الاكتفاء بالترديد.']
    };
    function planLesson(options) {
      options = options || {};
      const topic = clean(options.topic), subject = clean(options.subject), grade = clean(options.grade);
      if (!topic) throw Error('topic-required');
      const stage = stageKey(options.stage || grade);
      const stageInfo = stages[stage] || { label: 'غير محدد', guidance: 'حدّد مستوى المتعلم قبل ضبط طول الشرح ودرجة التجريد.' };
      const family = familyKey(subject), moves = familyMoves[family];
      const phases = [
        { id: 'warmup', title: 'التهيئة والتشخيص', teacher: 'ابدأ بسؤال قصير أو موقف مألوف يكشف المعارف السابقة دون إحراج.', learner: 'يستحضر ما يعرفه ويعبّر عن توقعه.', prompt: `ماذا تعرف مسبقًا ويمكن أن يساعدنا في فهم: ${topic}؟`, checkpoint: 'سجّل المعارف السابقة والتصورات الأولية قبل الشرح.' },
        { id: 'problem', title: 'بناء الوضعية أو الإشكالية', teacher: 'قدّم وضعية ذات معنى، ثم صغ سؤال التعلم بوضوح.', learner: 'يفهم المطلوب ويقترح أسئلة أو فرضيات.', prompt: `ما السؤال الذي نحتاج إلى الإجابة عنه لفهم ${topic}؟`, checkpoint: 'تأكد أن المتعلم فهم المشكلة لا الكلمات فقط.' },
        { id: 'explore', title: 'الاستكشاف وبناء المعنى', teacher: moves[0] + ' ' + moves[1], learner: 'يلاحظ ويقارن ويقترح تفسيرًا أوليًا.', prompt: 'ما الذي تلاحظه؟ ما الدليل؟ وما الذي يمكن أن نستنتجه؟', checkpoint: 'لا تقدّم القاعدة قبل إتاحة فرصة للملاحظة والتفكير.' },
        { id: 'model', title: 'الشرح والنمذجة', teacher: 'اشرح الفكرة على مراحل، وصرّح بسبب كل خطوة وبيّن مثالًا ومثالًا مضادًا عند الحاجة.', learner: 'يتابع الخطوات ويطرح أسئلة ويعيد صياغة الفكرة.', prompt: 'لماذا اخترنا هذه الخطوة؟ ماذا يتغير لو تغير أحد المعطيات؟', checkpoint: 'اطلب من المتعلم إعادة شرح الفكرة بكلماته.' },
        { id: 'guided', title: 'التطبيق الموجّه', teacher: 'حلّ مثالًا مشتركًا مع تقليل المساعدة تدريجيًا، ولا تنتقل قبل معالجة التعثر الظاهر.', learner: 'ينجز خطوة ثم يفسّرها قبل الانتقال إلى التالية.', prompt: 'ما الخطوة التالية؟ وما المعلومة التي تبررها؟', checkpoint: 'افحص طريقة التفكير لا الجواب النهائي وحده.' },
        { id: 'independent', title: 'التطبيق المستقل', teacher: 'قدّم مهمة جديدة قريبة من الهدف مع ترك مساحة للمحاولة الذاتية.', learner: 'يختار استراتيجية وينجزها بصورة مستقلة.', prompt: 'جرّب بنفسك، ثم اشرح كيف تحققت من عملك.', checkpoint: 'ميّز بين الاستقلال الحقيقي والنجاح بمساعدة مباشرة.' },
        { id: 'transfer', title: 'الإدماج ونقل التعلم', teacher: 'غيّر السياق أو المعطيات واطلب توظيف التعلم في وضعية جديدة.', learner: 'ينقل ما تعلمه ويبرر ملاءمة الطريقة.', prompt: 'أين يمكن أن نستخدم هذه الفكرة في وضعية مختلفة؟', checkpoint: 'تحقق من الفهم القابل للنقل لا حفظ المثال.' },
        { id: 'assessment', title: 'التقويم والتغذية الراجعة', teacher: 'اجمع دليلًا قصيرًا على تحقق الهدف، وقدّم ملاحظة محددة وخطوة تالية.', learner: 'يحدد ما أتقنه وما يحتاج إلى تحسينه.', prompt: 'ما الذي أصبح واضحًا؟ وما السؤال الذي ما زال يحتاج إلى عمل؟', checkpoint: 'اختر إعادة شرح أو تدريبًا إضافيًا أو انتقالًا بناءً على الدليل.' }
      ];
      const stageAdjustment = stage === 'primary' ? 'اجعل كل مرحلة قصيرة، واستعمل المحسوس والتمثيل والصور والتشجيع.' : stage === 'middle' ? 'وازن بين الأمثلة المحسوسة والتمثيل الرمزي، واطلب تفسيرًا لفظيًا للخطوات.' : stage === 'secondary' ? 'زد مساحة الاستقلال والبرهنة ومقارنة الاستراتيجيات وحدود النماذج.' : 'اضبط طول النشاط ودرجة التجريد بعد معرفة مستوى المتعلم.';
      return { ok: true, framework: 'competency-oriented-teaching-sequence', topic, subject: subject || null, subjectFamily: family, grade: grade || null, stage: stage || null, stageLabel: stageInfo.label, teacherGuidance: stageInfo.guidance, stageAdjustment, phases, teachingMoves: moves.slice(), participationProtocol: ['اطرح السؤال على الجميع، وامنح وقت تفكير فرديًا قبل أخذ الإجابات.', 'اطلب من كل متعلم إنتاج إجابة ظاهرة: كتابة قصيرة أو بطاقة أو سبورة صغيرة أو رد رقمي.', 'نوّع من يشارك في عرض الإجابات، ولا تجعل التفاعل محصورًا في المتطوعين المعتادين.', 'افحص إجابات متعددة لتحديد ما فهمه القسم وما يحتاج إلى معالجة.'], feedbackPrinciples: ['قدّم التغذية الراجعة في أقرب وقت ممكن من أداء المتعلم.', 'اذكر جانبًا صحيحًا أو تقدمًا محددًا قبل توضيح ما يحتاج إلى تحسين.', 'اجعل الملاحظة دقيقة وقابلة للتنفيذ، وابتعد عن الأحكام العامة على المتعلم.', 'اربط الملاحظة بخطوة تالية يستطيع المتعلم تجربتها.'], teacherRole: 'موجّه ومنشّط للتعلم، لا ملقّن يختزل الحصة في الشرح والنسخ.', sourceBoundary: 'هيكلة تربوية عامة مستلهمة من مبادئ الوضعية المشكلة والتعلم النشط والتقويم التكويني؛ لا تمثل تدرجًا رسميًا لدرس بعينه ولا تستبدل وثائق المنهاج.' };
    }
    function feedback(input) {
      input = input || {};
      const status = clean(input.status || (input.correct === true ? 'correct' : input.correct === false ? 'incorrect' : 'partial')).toLowerCase();
      const messages = {
        correct: { message: 'إجابة موفقة. وضّح لنا الدليل أو الخطوة التي جعلتك تصل إليها.', next: 'قدّم وضعية جديدة تتطلب نقل الفكرة.' },
        partial: { message: 'أنت على الطريق الصحيح؛ الجزء المنجز صحيح، فلنراجع الجزء الذي ما زال يحتاج إلى إكمال.', next: 'اطلب من المتعلم تحديد الخطوة التي لم يحسمها.' },
        misconception: { message: 'هناك فكرة تحتاج إلى مراجعة، وهذا طبيعي في التعلم. لنختبرها بمثال بسيط ثم نقارن.', next: 'استخدم مثالًا مضادًا أو تمثيلًا محسوسًا لكشف التصور.' },
        procedural: { message: 'يبدو أن الفكرة مفهومة لكن ترتيب الخطوات يحتاج إلى تنظيم. لنكتب الخطوات ونفحص كل انتقال.', next: 'قدّم تلميحًا واحدًا ثم أعد المحاولة.' },
        prerequisite: { message: 'قبل متابعة هذا الدرس، نحتاج إلى تقوية معرفة سابقة مرتبطة به.', next: 'ارجع إلى المتطلب السابق بتدريب قصير ثم عد إلى المهمة.' },
        blank: { message: 'ابدأ بما تعرفه، حتى لو كانت فكرة صغيرة. سأساعدك خطوة خطوة.', next: 'قدّم سؤال اختيار أو مثالًا محلولًا جزئيًا.' },
        unclear: { message: 'لنغيّر طريقة الشرح ونستعمل مثالًا أبسط أو رسمًا أو تمثيلًا آخر.', next: 'اطلب من المتعلم تحديد الكلمة أو الخطوة غير الواضحة.' }
      };
      const key = messages[status] ? status : 'unclear';
      return { status: key, message: messages[key].message, nextTeacherMove: messages[key].next, encouragement: 'الخطأ معلومة تساعدنا على اختيار الخطوة التعليمية التالية، وليس حكمًا على قدرة المتعلم.' };
    }
    function diagnose(input) {
      input = input || {};
      const allowed = ['prerequisite', 'concept', 'procedure', 'calculation', 'reading', 'language', 'incomplete', 'unknown'];
      const kind = allowed.includes(clean(input.errorType)) ? clean(input.errorType) : 'unknown';
      const map = {
        prerequisite: ['تعثر في مورد سابق', 'تحقق من المتطلب السابق وقدّم استرجاعًا قصيرًا.'],
        concept: ['تصور مفاهيمي يحتاج إلى مراجعة', 'استعمل تمثيلًا أو مثالًا مضادًا واطلب إعادة صياغة المفهوم.'],
        procedure: ['خلل في ترتيب الإجراء أو اختيار الاستراتيجية', 'جزّئ المهمة واطلب تبرير كل خطوة.'],
        calculation: ['خطأ حسابي محتمل', 'افصل صحة الخطة عن تنفيذ الحساب، ثم تحقق بتقدير أو طريقة ثانية.'],
        reading: ['صعوبة في فهم التعليمة أو المعطيات', 'أعد صياغة المطلوب وميّز المعطيات عن السؤال.'],
        language: ['حاجة إلى دعم لغوي أو اصطلاحي', 'اشرح المصطلح في سياقه واطلب استعماله في جملة أو مثال.'],
        incomplete: ['الإجابة غير مكتملة', 'اطلب تحديد الجزء المنجز وما بقي لإتمام المهمة.'],
        unknown: ['لا تكفي المعطيات لتحديد سبب التعثر', 'اطرح سؤالًا تشخيصيًا قصيرًا قبل اختيار العلاج.']
      };
      return { errorType: kind, diagnosis: map[kind][0], intervention: map[kind][1], evidence: clean(input.evidence) || null, certainty: kind === 'unknown' ? 'insufficient-evidence' : 'based-on-teacher-tagged-error', warning: 'لا يستنتج المحرك نوع الخطأ من إجابة حرة وحدها؛ يجب أن يحدد المعلم أو نظام تحليل موثوق نوع التعثر.' };
    }
    function chooseNextStep(input) {
      input = input || {};
      const mastery = Number(input.mastery);
      const attempts = Math.max(0, Number(input.attempts) || 0);
      if (!Number.isFinite(mastery) || mastery < 0 || mastery > 1) throw Error('mastery-must-be-between-0-and-1');
      if (mastery >= 0.85) return { decision: 'extend', action: 'انتقل إلى وضعية إدماجية أو تحدٍّ أعمق مع طلب التبرير.', reason: 'مؤشر الإتقان مرتفع وفق العتبة التي أدخلها المستخدم.' };
      if (mastery >= 0.6) return { decision: 'practice', action: 'قدّم تدريبًا إضافيًا متنوعًا مع تقليل التلميحات.', reason: 'يوجد فهم جزئي أو جيد يحتاج إلى تثبيت.' };
      if (attempts >= 2) return { decision: 'reteach-differently', action: 'غيّر تمثيل الفكرة أو المثال أو وسيط الشرح، ثم أعد التشخيص.', reason: 'تكرار المحاولة دون بلوغ العتبة يستدعي تغيير طريقة التدريس.' };
      return { decision: 'scaffold', action: 'قدّم تلميحًا صغيرًا أو مثالًا محلولًا جزئيًا ثم اطلب محاولة جديدة.', reason: 'ابدأ بدعم تدريجي قبل إعادة شرح الدرس كاملًا.' };
    }
    function hintLadder(input) {
      input = input || {};
      const topic = clean(input.topic) || 'المهمة';
      const stage = stageKey(input.stage || input.grade);
      const family = familyKey(input.subject);
      const first = stage === 'primary' ? 'انظر إلى الأشياء أو الصور أو المثال الملموس المرتبط بالمهمة.' : 'أعد قراءة المطلوب وحدد المعطيات وما نبحث عنه.';
      const second = family === 'mathematics' ? 'استحضر قاعدة أو تمثيلًا رياضيًا قد يربط المعطيات بالمطلوب.' : family === 'sciences' ? 'ابحث عن العلاقة بين الملاحظة والدليل، ثم اقترح تفسيرًا يمكن اختباره.' : family === 'languages' ? 'لاحظ الكلمات أو التراكيب أو السياق الذي يساعدك على بناء الإجابة.' : family === 'humanities' ? 'رتّب الشواهد زمنيًا أو موضوعيًا، وافصل الوقائع عن التفسير.' : 'قسّم المهمة إلى أجزاء صغيرة وحدد ما تعرفه وما تحتاج إلى إيجاده.';
      const third = stage === 'secondary' ? 'اختر استراتيجية مناسبة، واذكر سبب اختيارها، ثم افحص حدود النتيجة.' : 'ابدأ بالخطوة الأولى فقط، واشرح لماذا تبدو مناسبة قبل إكمال الحل.';
      return { topic, hints: [
        { level: 1, label: 'تلميح خفيف', prompt: first },
        { level: 2, label: 'توجيه', prompt: second },
        { level: 3, label: 'تفكيك المهمة', prompt: third }
      ], teacherRule: 'قدّم تلميحًا واحدًا في كل مرة، وانتظر محاولة المتعلم قبل كشف التلميح التالي.', revealPolicy: 'لا تتضمن هذه السلسلة الحل النهائي؛ أضف الحل فقط بعد محاولة المتعلم أو عند طلب شرح كامل.' };
    }
    function questioning(input) {
      input = input || {};
      const topic = clean(input.topic) || 'الفكرة';
      const family = familyKey(input.subject);
      const stage = stageKey(input.stage || input.grade);
      const questions = family === 'sciences' ? [
        'ما الذي تلاحظه مباشرة في الوثيقة أو التجربة؟',
        'أي معطى يدعم تفسيرك؟',
        'كيف نميز بين الملاحظة والفرضية والاستنتاج؟',
        'ما التجربة أو المقارنة التي يمكن أن تختبر الفرضية؟',
        `هل تستطيع توظيف النتيجة لفهم وضعية جديدة مرتبطة بـ ${topic}؟`
      ] : family === 'languages' ? [
        'من المتحدث أو الكاتب؟ وما السياق؟',
        'ما الفكرة أو الرسالة الأساسية؟',
        'ما العبارة أو البنية التي تدعم فهمك؟',
        'هل تستطيع إعادة صياغة المعنى بأسلوبك؟',
        `كيف تستعمل ما تعلمته عن ${topic} في إنتاج جديد؟`
      ] : family === 'humanities' ? [
        'ما الوثيقة أو الواقعة التي ننطلق منها؟',
        'ما المعلومات الصريحة التي تقدمها؟',
        'ما التفسير الذي تدعمه الشواهد؟',
        'هل توجد وجهة نظر أخرى أو قرينة مخالفة؟',
        `كيف نستخدم هذا الفهم لتحليل وضعية أخرى في ${topic}؟`
      ] : family === 'mathematics' ? [
        'ما المعطيات؟ وما المطلوب تحديدًا؟',
        'هل يمكنك تمثيل المسألة برسم أو جدول أو عبارة؟',
        'أي خاصية أو استراتيجية تناسب هذه المعطيات؟ ولماذا؟',
        'كيف تتحقق من صحة النتيجة بطريقة أخرى؟',
        `ماذا يتغير إذا تغير أحد معطيات مسألة ${topic}؟`
      ] : [
        'ماذا تلاحظ في هذه الوضعية؟',
        'ما المعلومات التي نحتاج إليها؟',
        'ما الاستراتيجية التي تقترحها؟ ولماذا؟',
        'ما الدليل على أن الحل مناسب؟',
        `أين يمكن تطبيق ما تعلمته عن ${topic} في سياق جديد؟`
      ];
      if (stage === 'primary') questions[2] = 'ما الطريقة البسيطة التي تساعدنا؟ هل يمكنك أن ترينا؟';
      if (stage === 'secondary') questions[3] += ' وما حدود هذه الطريقة؟';
      return { topic, sequence: ['ملاحظة', 'فهم', 'تفسير', 'تحقق', 'نقل'], questions, guidance: 'ابدأ بالأسئلة المفتوحة، ثم ضيّق السؤال عند الحاجة. لا تحول التسلسل إلى استجواب سريع؛ امنح وقتًا للتفكير.' };
    }
    function structureExplanation(input) {
      input = input || {};
      const raw = Array.isArray(input.steps) ? input.steps : [];
      if (!raw.length) throw Error('steps-required');
      const steps = raw.map((item, index) => {
        const label = clean(item && typeof item === 'object' ? (item.label || item.action || item.text) : item);
        if (!label) throw Error('step-text-required');
        return {
          number: index + 1,
          action: label,
          publicRationalePrompt: 'ما الهدف من هذه الخطوة؟ وما القاعدة أو الدليل الذي يبررها؟',
          learnerCheck: 'هل تستطيع شرح هذه الخطوة بكلماتك أو إعطاء مثال يوضحها؟',
          verificationPrompt: 'كيف نتحقق من أن هذه الخطوة صحيحة وتحافظ على المطلوب؟'
        };
      });
      return {
        goal: clean(input.goal) || null,
        subjectFamily: familyKey(input.subject),
        explanationPolicy: 'قدّم مبررًا تعليميًا موجزًا يمكن التحقق منه لكل خطوة؛ لا تعرض تفكيرًا داخليًا خفيًا أو ادعاءً بقراءة ذهن المتعلم.',
        opening: 'حدد المعطيات والهدف قبل البدء، واذكر القاعدة أو الفكرة التي سنستخدمها.',
        steps,
        closing: 'لخّص لماذا نجحت الطريقة، ثم اطلب من المتعلم التحقق أو تطبيقها في مثال مختلف.'
      };
    }
    function assessChecklist(criteria, evidence) {
      if (!Array.isArray(criteria) || !criteria.length) throw Error('criteria-required');
      const observed = Array.isArray(evidence) ? evidence : [];
      const rows = criteria.map((item, index) => {
        const label = clean(item && item.label != null ? item.label : item);
        const found = observed.some(x => clean(x && x.criterion != null ? x.criterion : x) === label && (typeof x !== 'object' || x.met !== false));
        return { criterion: label, met: found };
      });
      const met = rows.filter(x => x.met).length;
      return { criteria: rows, met, total: rows.length, ratio: met / rows.length, note: 'هذا فحص قائمة شواهد أدخلها المستخدم، وليس تصحيحًا آليًا للمعنى أو حكمًا رسميًا على الكفاءة.' };
    }
    // Scores only explicitly supplied evidence; absent criteria remain not_assessed.
    const evaluationRubric = [
      { key: 'accuracy', label: 'الدقة والصحة', weight: 15 },
      { key: 'grounding', label: 'الاستناد إلى المعطيات والمصادر', weight: 10 },
      { key: 'conceptual_explanation', label: 'بناء المفهوم ووضوح الشرح', weight: 12 },
      { key: 'reasoning', label: 'تبرير الخطوات والاستدلال الظاهر', weight: 10 },
      { key: 'questioning', label: 'جودة الأسئلة ومشاركة المتعلم', weight: 10 },
      { key: 'error_diagnosis', label: 'تشخيص التعثر ومعالجة الخطأ', weight: 10 },
      { key: 'scaffolding', label: 'ملاءمة التلميحات والدعم المتدرج', weight: 10 },
      { key: 'formative_assessment', label: 'التقويم التكويني والتحقق من الفهم', weight: 8 },
      { key: 'adaptation', label: 'التكييف حسب الطور والمادة', weight: 8 },
      { key: 'transfer', label: 'نقل التعلم إلى وضعية جديدة', weight: 7 }
    ];
    function evaluatePedagogicalResponse(input) {
      input = input && typeof input === 'object' ? input : {};
      const evidence = input.evidence && typeof input.evidence === 'object' ? input.evidence : {};
      const rows = evaluationRubric.map(rule => {
        const raw = evidence[rule.key];
        const item = typeof raw === 'string' ? { status: raw } : (raw && typeof raw === 'object' ? raw : {});
        const status = ['demonstrated', 'partial', 'not_demonstrated'].includes(clean(item.status)) ? clean(item.status) : 'not_assessed';
        const note = clean(item.note || item.evidence);
        return { key: rule.key, criterion: rule.label, weight: rule.weight, status, evidence: note || null,
          earned: status === 'demonstrated' ? rule.weight : status === 'partial' ? rule.weight / 2 : 0 };
      });
      const assessed = rows.filter(r => r.status !== 'not_assessed');
      const possible = assessed.reduce((n, r) => n + r.weight, 0);
      const earned = assessed.reduce((n, r) => n + r.earned, 0);
      const score = possible ? Math.round(earned / possible * 1000) / 10 : null;
      const stage = stageKey(input.stage || input.grade);
      const family = familyKey(input.subject);
      const gaps = rows.filter(r => r.status === 'not_assessed').map(r => r.key);
      const improvements = rows.filter(r => r.status === 'partial' || r.status === 'not_demonstrated').map(r => ({ criterion: r.key, nextStep: ({ accuracy: 'تحقق من صحة الادعاءات والأمثلة قبل اعتماد الإجابة.', grounding: 'اربط كل نتيجة بمعطى أو مصدر محدد.', conceptual_explanation: 'أعد بناء المفهوم بمثال مناسب ثم مثال مضاد عند الحاجة.', reasoning: 'أظهر مبررًا تعليميًا قابلًا للتحقق لكل خطوة.', questioning: 'أضف سؤالًا مفتوحًا وانتظر استجابة المتعلم.', error_diagnosis: 'حدد نوع التعثر من دليل قبل اختيار المعالجة.', scaffolding: 'ابدأ بتلميح خفيف ثم زد الدعم بعد محاولة المتعلم.', formative_assessment: 'أضف سؤال تحقق قصيرًا قبل الانتقال.', adaptation: 'اضبط التجريد والأمثلة وطول الخطوات حسب الطور والمادة.', transfer: 'أضف مهمة جديدة تختلف في السياق وتختبر نقل الفكرة.' })[r.key] }));
      return { version: VERSION, rubric: 'SM-pedagogical-evaluation-v1', stage: stage || null, subjectFamily: family,
        score, assessedWeight: possible, totalWeight: 100, coverage: Math.round(possible), criteria: rows,
        improvementPriorities: improvements, unassessedCriteria: gaps,
        interpretation: score == null ? 'insufficient-evidence' : score >= 85 ? 'strong-evidence' : score >= 65 ? 'developing-evidence' : 'needs-revision',
        safeguards: ['التقييم يحسب المؤشرات التي أدخلها المراجع فقط؛ لا يحلل النص أو الفيديو دلاليًا من تلقاء نفسه.', 'المعيار غير المقيم لا يحتسب صفرًا ولا يفترض تحققه.', 'النتيجة أداة مقارنة داخلية وليست اعتمادًا رسميًا أو حكمًا نهائيًا على الأستاذ أو النموذج.', 'يجب تقييم صحة المحتوى العلمي وفق مرجع المادة والمنهاج المناسبين.'] };
    }
    // Adaptive learner support uses only explicit, recorded performance evidence.
    const learnerOutcomes = ['mastered', 'partial', 'struggling', 'not_assessed'];
    const learnerSkills = ['conceptual_understanding', 'procedure', 'reasoning', 'application', 'language', 'prerequisite', 'general'];
    function createLearnerProfile(input) {
      input = input && typeof input === 'object' ? input : {};
      const stage = stageKey(input.stage || input.grade);
      const subject = clean(input.subject);
      return { version: VERSION, profileType: 'explicit-evidence-only', stage: stage || null,
        subject: subject || null, subjectFamily: familyKey(subject), evidence: [],
        note: 'ملف تعليمي وصفي؛ لا يستنتج الذكاء أو الحالة النفسية أو القدرة الثابتة للمتعلم.' };
    }
    function recordLearningEvidence(profile, item) {
      if (!profile || profile.profileType !== 'explicit-evidence-only' || !Array.isArray(profile.evidence)) throw Error('invalid-learner-profile');
      item = item && typeof item === 'object' ? item : {};
      const skill = clean(item.skill) || 'general';
      const outcome = clean(item.outcome);
      if (!learnerSkills.includes(skill)) throw Error('invalid-learning-skill');
      if (!learnerOutcomes.includes(outcome) || outcome === 'not_assessed') throw Error('invalid-learning-outcome');
      const note = clean(item.note);
      if (!note) throw Error('learning-evidence-note-required');
      const next = Object.assign({}, profile, { evidence: profile.evidence.concat([{
        skill, outcome, note, taskId: clean(item.taskId) || null,
        source: clean(item.source) || 'teacher_or_assessment',
        recordedAt: clean(item.recordedAt) || null
      }]) });
      return next;
    }
    // Portable, append-only learning memory. Storage is supplied by the host application;
    // this engine never writes to a server, browser storage, or a database itself.
    const MEMORY_SCHEMA = 'sm-learning-memory-v1';
    function createLearningMemory(profile) {
      if (!profile || profile.profileType !== 'explicit-evidence-only' || !Array.isArray(profile.evidence)) throw Error('valid-learner-profile-required');
      return { schema: MEMORY_SCHEMA, version: VERSION, stage: profile.stage || null,
        subject: profile.subject || null, subjectFamily: profile.subjectFamily || 'general',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), evidence: profile.evidence.slice(),
        policy: 'append-only-explicit-evidence; no inferred-mental-state; host-managed-storage' };
    }
    function memoryEvidenceKey(item) {
      return JSON.stringify([clean(item.skill), clean(item.outcome), clean(item.note), clean(item.taskId), clean(item.source), clean(item.recordedAt)]);
    }
    function validateLearningMemory(memory) {
      const errors = [];
      if (!memory || memory.schema !== MEMORY_SCHEMA) errors.push('invalid-memory-schema');
      if (!memory || !Array.isArray(memory.evidence)) errors.push('memory-evidence-must-be-array');
      if (memory && Array.isArray(memory.evidence)) memory.evidence.forEach((e, i) => {
        if (!e || !learnerSkills.includes(clean(e.skill))) errors.push('invalid-skill-at-' + i);
        if (!e || !['mastered','partial','struggling'].includes(clean(e.outcome))) errors.push('invalid-outcome-at-' + i);
        if (!e || !clean(e.note)) errors.push('missing-evidence-note-at-' + i);
      });
      return { valid: errors.length === 0, errors, evidenceCount: memory && Array.isArray(memory.evidence) ? memory.evidence.length : 0 };
    }
    function addLearningMemoryEvidence(memory, item) {
      const check = validateLearningMemory(memory);
      if (!check.valid) throw Error('invalid-learning-memory:' + check.errors.join(','));
      const profile = { profileType: 'explicit-evidence-only', evidence: memory.evidence };
      const nextProfile = recordLearningEvidence(profile, item);
      const added = nextProfile.evidence[nextProfile.evidence.length - 1];
      const key = memoryEvidenceKey(added);
      if (memory.evidence.some(e => memoryEvidenceKey(e) === key)) return { memory, added: false, reason: 'duplicate-evidence' };
      const now = new Date().toISOString();
      const next = Object.assign({}, memory, { version: VERSION, updatedAt: now, evidence: memory.evidence.concat([added]) });
      return { memory: next, added: true, reason: null };
    }
    function summarizeLearningMemory(memory) {
      const check = validateLearningMemory(memory);
      if (!check.valid) throw Error('invalid-learning-memory:' + check.errors.join(','));
      const skills = {};
      memory.evidence.forEach(e => { const k = e.skill; if (!skills[k]) skills[k] = { total: 0, mastered: 0, partial: 0, struggling: 0, latest: null }; skills[k].total++; skills[k][e.outcome]++; skills[k].latest = e; });
      return { schema: MEMORY_SCHEMA, stage: memory.stage, subject: memory.subject, evidenceCount: memory.evidence.length,
        skills, reviewSkills: Object.keys(skills).filter(k => skills[k].latest.outcome !== 'mastered'),
        masteredSkills: Object.keys(skills).filter(k => skills[k].latest.outcome === 'mastered'),
        note: 'ملخص وصفي للأدلة المسجلة فقط؛ لا يثبت إتقانًا دائمًا ولا يستنتج حالة المتعلم.' };
    }
    function exportLearningMemory(memory) {
      const check = validateLearningMemory(memory);
      if (!check.valid) throw Error('invalid-learning-memory:' + check.errors.join(','));
      return JSON.stringify({ format: MEMORY_SCHEMA, exportedAt: new Date().toISOString(), memory }, null, 2);
    }
    function importLearningMemory(payload) {
      let parsed;
      try { parsed = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (_) { throw Error('invalid-memory-json'); }
      const memory = parsed && parsed.memory ? parsed.memory : parsed;
      const check = validateLearningMemory(memory);
      if (!check.valid) throw Error('invalid-learning-memory:' + check.errors.join(','));
      return JSON.parse(JSON.stringify(memory));
    }
    function mergeLearningMemories(left, right) {
      const a = importLearningMemory(left), b = importLearningMemory(right);
      if (a.stage !== b.stage || a.subject !== b.subject) throw Error('incompatible-learning-memory-context');
      const merged = a.evidence.slice(), seen = new Set(merged.map(memoryEvidenceKey));
      b.evidence.forEach(e => { const k = memoryEvidenceKey(e); if (!seen.has(k)) { seen.add(k); merged.push(e); } });
      return Object.assign({}, a, { version: VERSION, updatedAt: new Date().toISOString(), evidence: merged });
    }

    function adaptNextStep(input) {
      input = input && typeof input === 'object' ? input : {};
      const profile = input.profile;
      if (!profile || profile.profileType !== 'explicit-evidence-only' || !Array.isArray(profile.evidence)) throw Error('valid-learner-profile-required');
      const skill = learnerSkills.includes(clean(input.skill)) ? clean(input.skill) : 'general';
      const recent = profile.evidence.filter(x => x.skill === skill).slice(-3);
      const stage = profile.stage;
      const family = profile.subjectFamily || 'general';
      const moves = familyMoves[family] || familyMoves.general;
      let action, difficulty, reason, activity, support;
      if (!recent.length) {
        action = 'diagnostic'; difficulty = 'entry';
        reason = 'لا توجد شواهد مسجلة لهذه المهارة؛ ابدأ بمهمة تشخيصية قصيرة قبل تحديد مستوى الدعم.';
        activity = 'قدّم سؤالًا أو مهمة قصيرة تكشف نقطة البداية دون افتراض مستوى المتعلم.';
        support = 'انتظر استجابة المتعلم واجمع دليلًا قبل اختيار مسار الشرح.';
      } else {
        const last = recent[recent.length - 1].outcome;
        const masteredStreak = recent.slice(-2).length === 2 && recent.slice(-2).every(x => x.outcome === 'mastered');
        if (last === 'struggling') {
          action = 'reteach-prerequisite'; difficulty = 'reduced';
          reason = 'آخر دليل مسجل يشير إلى تعثر؛ خفّض العبء وراجع المتطلب أو غيّر التمثيل.';
          activity = family === 'mathematics' ? 'استخدم مثالًا عدديًا أبسط أو تمثيلًا بصريًا ثم اطلب تفسير خطوة واحدة.' : family === 'sciences' ? 'ارجع إلى ملاحظة أو تجربة مبسطة وافصل المعطيات عن التفسير.' : 'قدّم نموذجًا قصيرًا مرتبطًا بسياق مألوف ثم اطلب محاولة جزئية.';
          support = 'دعم مباشر قصير، ثم سؤال تحقق جديد؛ لا تكرر التلميح نفسه.';
        } else if (last === 'partial') {
          action = 'guided-practice'; difficulty = 'supported';
          reason = 'الدليل الأخير يظهر تقدمًا جزئيًا؛ حافظ على الهدف وقلّل المساعدة تدريجيًا.';
          activity = 'قدّم تمرينًا مشابهًا مع خطوة ناقصة أو سؤال موجه، ثم اطلب إكماله مع التبرير.';
          support = 'تلميح واحد في كل محاولة، ثم امنح وقتًا للاستجابة.';
        } else if (masteredStreak) {
          action = 'transfer'; difficulty = 'extended';
          reason = 'سُجل إتقان في آخر محاولتين لهذه المهارة؛ اختبر نقل التعلم في سياق مختلف.';
          activity = 'قدّم وضعية جديدة تختلف في السياق أو المعطيات وتطلب اختيار الاستراتيجية وتبريرها.';
          support = 'قلّل التوجيه واطلب التحقق الذاتي وتفسير ملاءمة الطريقة.';
        } else {
          action = 'independent-practice'; difficulty = 'standard';
          reason = 'الشواهد الحالية لا تكفي لإعلان إتقان مستقر؛ واصل التدريب مع تحقق قصير.';
          activity = 'قدّم مهمة مستقلة قريبة من الهدف ثم افحص النتيجة والطريقة.';
          support = 'تدخل عند الحاجة فقط، وسجّل دليلًا جديدًا قبل رفع الصعوبة.';
        }
      }
      const stageGuidance = stages[stage] ? stages[stage].guidance : 'حدّد الطور الدراسي لضبط طول المهمة ودرجة التجريد.';
      return { version: VERSION, skill, action, difficulty, reason, activity,
        subjectMove: moves[0], support, stageGuidance,
        evidenceCount: recent.length, recentOutcomes: recent.map(x => x.outcome),
        requiresNewEvidence: true,
        safeguards: ['لا تستنتج حالة ذهنية أو قدرة ثابتة من إجابة واحدة.', 'لا ترفع الصعوبة إلا بناءً على شواهد أداء مسجلة.', 'يجب أن يراجع الأستاذ ملاءمة المهمة وصحتها للمادة والمنهاج.'] };
    }
    // Differentiated practice orchestration over host-authored tasks. The engine
    // orders, tracks and responds to explicit assessment; it does not invent subject facts.
    const practiceDifficulties = ['foundation', 'guided', 'independent', 'transfer'];
    const practiceErrorGuidance = {
      concept: 'راجع معنى المفهوم بتمثيل أو مثال أبسط، ثم اطلب من المتعلم صياغته بكلماته.',
      procedure: 'قسّم الإجراء إلى خطوات قصيرة، وحدد أول خطوة تغير فيها المسار، ثم أعد المحاولة.',
      evidence: 'اطلب تحديد المعطى أو الشاهد الذي يدعم الإجابة، وافصل بين الملاحظة والاستنتاج.',
      language: 'أعد صياغة المطلوب بجملة قصيرة، واطلب توضيح الفكرة قبل الحكم على المحتوى.',
      instruction: 'تحقق من فهم المطلوب وشروط المهمة قبل إعادة المحاولة.',
      unknown: 'لا يوجد نوع خطأ محدد؛ اجمع توضيحًا إضافيًا قبل اختيار معالجة خاصة.'
    };
    function createPracticeSequence(input) {
      input = input && typeof input === 'object' ? input : {};
      const profile = input.profile;
      if (!profile || profile.profileType !== 'explicit-evidence-only' || !Array.isArray(profile.evidence)) throw Error('valid-learner-profile-required');
      const skill = clean(input.skill);
      if (!learnerSkills.includes(skill)) throw Error('invalid-learning-skill');
      if (!Array.isArray(input.tasks) || !input.tasks.length || input.tasks.length > 30) throw Error('practice-tasks-required');
      const seen = new Set();
      const tasks = input.tasks.map((raw, index) => {
        if (!raw || typeof raw !== 'object') throw Error('invalid-practice-task');
        const id = clean(raw.id), prompt = clean(raw.prompt), difficulty = clean(raw.difficulty || 'guided');
        if (!id || seen.has(id)) throw Error('practice-task-id-invalid-or-duplicate');
        if (!prompt) throw Error('practice-task-prompt-required');
        if (!practiceDifficulties.includes(difficulty)) throw Error('invalid-practice-difficulty');
        seen.add(id);
        const hints = Array.isArray(raw.hints) ? raw.hints.map(clean).filter(Boolean).slice(0, 4) : [];
        return { id, prompt, difficulty, hints, expectedEvidence: clean(raw.expectedEvidence) || null, source: clean(raw.source) || null, originalIndex: index };
      }).sort((a, b) => practiceDifficulties.indexOf(a.difficulty) - practiceDifficulties.indexOf(b.difficulty) || a.originalIndex - b.originalIndex);
      const cleanTasks = tasks.map(({ originalIndex, ...task }) => task);
      const family = profile.subjectFamily || 'general';
      return {
        version: VERSION, type: 'host-authored-differentiated-practice', status: 'active',
        subject: profile.subject || null, subjectFamily: family, stage: profile.stage || null,
        skill, currentIndex: 0, tasks: cleanTasks, attempts: [],
        profile,
        policy: 'tasks-authored-or-approved-by-host; explicit-assessment-only; append-only-learning-evidence'
      };
    }
    function currentPracticeTask(sequence) {
      if (!sequence || sequence.type !== 'host-authored-differentiated-practice' || !Array.isArray(sequence.tasks) || !Number.isInteger(sequence.currentIndex)) throw Error('invalid-practice-sequence');
      if (sequence.status === 'completed' || sequence.currentIndex >= sequence.tasks.length) return { done: true, message: 'اكتملت سلسلة التدريب؛ راجع الشواهد وحدد خطوة التعلم التالية.' };
      const task = sequence.tasks[sequence.currentIndex];
      return { done: false, index: sequence.currentIndex + 1, total: sequence.tasks.length,
        task: { id: task.id, prompt: task.prompt, difficulty: task.difficulty },
        attempt: sequence.attempts.filter(x => x.taskId === task.id).length + 1 };
    }
    function gradePracticeTask(sequence, input) {
      if (!sequence || sequence.type !== 'host-authored-differentiated-practice' || sequence.status !== 'active' || !Array.isArray(sequence.tasks) || !Number.isInteger(sequence.currentIndex)) throw Error('invalid-practice-sequence');
      input = input && typeof input === 'object' ? input : {};
      const answer = clean(input.answer), assessment = clean(input.assessment).toLowerCase();
      if (!answer) throw Error('learner-answer-required');
      if (!['correct', 'partial', 'incorrect', 'unclear'].includes(assessment)) throw Error('explicit-practice-assessment-required');
      const current = sequence.tasks[sequence.currentIndex];
      if (!current || clean(input.taskId) !== current.id) throw Error('practice-task-order-mismatch');
      const next = JSON.parse(JSON.stringify(sequence));
      const priorAttempts = next.attempts.filter(x => x.taskId === current.id).length;
      const errorCode = clean(input.errorCode).toLowerCase();
      if (errorCode && !Object.prototype.hasOwnProperty.call(practiceErrorGuidance, errorCode)) throw Error('invalid-practice-error-code');
      const hint = assessment === 'partial' || assessment === 'incorrect'
        ? (current.hints[Math.min(priorAttempts, Math.max(0, current.hints.length - 1))] || 'حاول تحديد خطوة واحدة متأكدًا منها، واشرح سبب اختيارك قبل إكمال الحل.')
        : null;
      const feedbackText = clean(input.explanation) || (errorCode ? practiceErrorGuidance[errorCode] : assessment === 'correct' ? 'إجابة مقبولة وفق التقييم الممرر؛ انتقل إلى المهمة التالية مع الحفاظ على التحقق.' : assessment === 'partial' ? 'هناك تقدم جزئي؛ راجع الجزء الذي يحتاج إلى دعم ثم أعد المحاولة.' : assessment === 'incorrect' ? 'لم يتحقق الهدف في هذه المحاولة؛ استخدم التلميح وجرّب تمثيلًا أو خطوة أبسط.' : 'الإجابة تحتاج إلى توضيح قبل إصدار حكم عليها.');
      const attempt = { taskId: current.id, answer, assessment, errorCode: errorCode || null,
        evidence: clean(input.evidence) || null, explanation: feedbackText, attempt: priorAttempts + 1 };
      next.attempts.push(attempt);
      let evidenceUpdate = null, advanced = false;
      if (assessment === 'correct' || assessment === 'partial' || assessment === 'incorrect') {
        const outcome = assessment === 'correct' ? 'mastered' : assessment === 'partial' ? 'partial' : 'struggling';
        next.profile = recordLearningEvidence(next.profile, { skill: next.skill, outcome,
          note: clean(input.evidence) || feedbackText, taskId: current.id, source: 'practice-assessment' });
        evidenceUpdate = { skill: next.skill, outcome, recorded: true };
      }
      if (assessment === 'correct') {
        next.currentIndex += 1;
        advanced = true;
        if (next.currentIndex >= next.tasks.length) next.status = 'completed';
      }
      return { sequence: next, status: next.status, advanced, completed: next.status === 'completed',
        result: { taskId: current.id, assessment, feedback: feedbackText, hint: hint,
          errorGuidance: errorCode ? practiceErrorGuidance[errorCode] : null,
          expectedEvidenceForAssessor: current.expectedEvidence,
          evidenceUpdate, nextTask: currentPracticeTask(next),
          safeguards: ['التصحيح يعتمد على assessment صريح من الأستاذ أو المقيّم المضيف.', 'expectedEvidence مخصص للمقيّم ولا ينبغي عرضه للمتعلم قبل المحاولة.', 'تفسير الخطأ إرشاد عام مرتبط برمز يمرره المقيّم، وليس استنتاجًا دلاليًا من نص الإجابة.'] },
        evaluatorBoundary: 'لم ينفذ المحرك تصحيحًا دلاليًا مستقلًا؛ استخدم نتيجة التقييم الصريحة فقط.' };
    }
    // Concept discovery pathway. Prompts are structural and subject-neutral;
    // factual stimuli and validation criteria remain host/teacher supplied.
    const discoveryPhases = [
      { id: 'observe', title: 'الملاحظة', prompt: topic => `لاحظ المعطيات أو النموذج المرتبط بـ«${topic}». ما العناصر التي تراها بوضوح؟`, action: 'تسجيل ملاحظات قابلة للفحص دون تفسير متسرع.' },
      { id: 'predict', title: 'التوقع وطرح الفرضيات', prompt: topic => `ما الذي تتوقع حدوثه أو ما العلاقة التي تتوقعها في «${topic}»؟ وما سبب توقعك؟`, action: 'صياغة توقع أولي وذكر مبرره.' },
      { id: 'explore', title: 'الاستكشاف', prompt: topic => `كيف يمكنك فحص توقعك حول «${topic}» باستعمال المعطيات أو النشاط المتاح؟`, action: 'اقتراح مقارنة أو تجربة أو تحليل وثيقة بحسب طبيعة المادة.' },
      { id: 'formulate', title: 'صياغة المفهوم', prompt: topic => `بعد الاستكشاف، صغ الفكرة أو القاعدة التي تراها تفسر ما لاحظته في «${topic}».`, action: 'صياغة تفسير أو قاعدة أولية بكلمات المتعلم.' },
      { id: 'verify', title: 'التحقق', prompt: topic => `ما الدليل الذي يدعم صياغتك حول «${topic}»؟ وهل توجد حالة قد لا تنطبق عليها؟`, action: 'اختبار الصياغة بمثال أو دليل أو حالة مقابلة.' },
      { id: 'apply', title: 'التطبيق والنقل', prompt: topic => `طبّق ما توصلت إليه بشأن «${topic}» على وضعية جديدة تختلف عن المثال الأول.`, action: 'نقل التعلم إلى سياق جديد دون تكرار المثال.' },
      { id: 'reflect', title: 'التأمل والتقويم الذاتي', prompt: topic => `ما الذي تغير في فهمك لـ«${topic}»؟ وما الدليل الذي يجعلك واثقًا من فهمك؟`, action: 'تفسير مسار التعلم وتحديد ما يحتاج إلى مراجعة.' }
    ];
    function createConceptDiscoveryPath(options) {
      options = options && typeof options === 'object' ? options : {};
      const topic = clean(options.topic), subject = clean(options.subject), grade = clean(options.grade);
      if (!topic) throw Error('discovery-topic-required');
      const stage = stageKey(options.stage || grade);
      const family = familyKey(subject);
      const profile = options.profile || null;
      if (profile && (profile.profileType !== 'explicit-evidence-only' || !Array.isArray(profile.evidence))) throw Error('valid-learner-profile-required');
      if (profile && stage && profile.stage && profile.stage !== stage) throw Error('discovery-profile-stage-mismatch');
      if (profile && subject && profile.subject && clean(profile.subject) !== subject) throw Error('discovery-profile-subject-mismatch');
      const materials = options.materials && typeof options.materials === 'object' ? options.materials : {};
      const phases = discoveryPhases.map((phase, index) => ({
        id: phase.id, title: phase.title, prompt: phase.prompt(topic),
        learnerAction: phase.action,
        stimulus: clean(materials[phase.id]) || null,
        order: index + 1
      }));
      const path = {
        version: VERSION, type: 'teacher-guided-concept-discovery', status: 'active',
        topic, subject: subject || null, subjectFamily: family, grade: grade || null, stage: stage || null,
        currentIndex: 0, phases, history: [], profile: profile ? JSON.parse(JSON.stringify(profile)) : null,
        teachingGuidance: stage && stages[stage] ? stages[stage].guidance : 'حدّد الطور لضبط مقدار التجريد والدعم.',
        familyGuidance: (familyMoves[family] || familyMoves.general).slice(),
        policy: 'host-supplied-stimuli-and-explicit-assessment; no-factual-rule-generation'
      };
      return { path, current: currentDiscoveryStep(path), safeguards: [
        'المسار هيكلة استكشافية عامة ولا يحدد المحتوى العلمي أو القاعدة الصحيحة.',
        'يقدم الأستاذ أو المضيف الوثائق والتجارب والبيانات ومعايير التحقق المناسبة للمادة.',
        'لا ينتقل المسار إلى مرحلة التحقق أو التطبيق إلا وفق تقييم صريح من الأستاذ أو المقيّم.'
      ] };
    }
    function currentDiscoveryStep(path) {
      if (!path || path.type !== 'teacher-guided-concept-discovery' || !Array.isArray(path.phases) || !Number.isInteger(path.currentIndex)) throw Error('invalid-discovery-path');
      if (path.status === 'completed' || path.currentIndex >= path.phases.length) return { done: true, message: 'اكتمل مسار الاكتشاف؛ راجع الأدلة وحدد خطوة التعلم التالية.' };
      const phase = path.phases[path.currentIndex];
      return { done: false, index: path.currentIndex + 1, total: path.phases.length,
        phase: { id: phase.id, title: phase.title, prompt: phase.prompt, learnerAction: phase.learnerAction, stimulus: phase.stimulus } };
    }
    function submitConceptDiscoveryStep(path, input) {
      if (!path || path.type !== 'teacher-guided-concept-discovery' || path.status !== 'active' || !Array.isArray(path.phases) || !Number.isInteger(path.currentIndex)) throw Error('invalid-discovery-path');
      input = input && typeof input === 'object' ? input : {};
      const answer = clean(input.answer), assessment = clean(input.assessment).toLowerCase();
      if (!answer) throw Error('discovery-learner-response-required');
      if (!['validated', 'partial', 'not-yet', 'unclear'].includes(assessment)) throw Error('explicit-discovery-assessment-required');
      const current = path.phases[path.currentIndex];
      if (!current || clean(input.phaseId) !== current.id) throw Error('discovery-phase-order-mismatch');
      const next = JSON.parse(JSON.stringify(path));
      const record = { phaseId: current.id, answer, assessment,
        evidence: clean(input.evidence) || null,
        feedback: clean(input.feedback) || (assessment === 'validated' ? 'التقييم يؤكد تحقق هدف هذه المرحلة؛ انتقل إلى المرحلة التالية.' : assessment === 'partial' ? 'هناك عناصر صحيحة؛ راجع الجزء الذي يحتاج إلى تدعيم بدليل إضافي.' : assessment === 'not-yet' ? 'لم يتحقق هدف المرحلة بعد؛ غيّر طريقة الاستكشاف أو استخدم تمثيلًا أبسط.' : 'الإجابة تحتاج إلى توضيح قبل الحكم عليها.') };
      next.history.push(record);
      let advanced = false;
      if (assessment === 'validated') {
        next.currentIndex += 1;
        advanced = true;
        if (next.currentIndex >= next.phases.length) next.status = 'completed';
      }
      const followUp = assessment === 'unclear'
        ? 'هل يمكنك توضيح ملاحظتك أو ذكر الدليل الذي اعتمدت عليه؟'
        : assessment === 'partial' || assessment === 'not-yet'
          ? 'أعد فحص المعطيات، واذكر خطوة واحدة تستطيع تبريرها.' : null;
      return { path: next, status: next.status, advanced, completed: next.status === 'completed',
        result: { phaseId: current.id, assessment, feedback: record.feedback, followUp,
          nextStep: currentDiscoveryStep(next),
          evaluatorBoundary: 'استُخدم تقييم صريح من الأستاذ أو المضيف؛ لم يتحقق المحرك من صحة المفهوم أو الإجابة علميًا.' },
        safeguards: ['لا تعرض معايير الإجابة السرية أو ملاحظات المقيّم قبل محاولة المتعلم.', 'التقييم العلمي مسؤولية الأستاذ أو المقيّم المضيف.', 'الحالة الأصلية للمسار لا تتغير؛ أُعيد مسار جديد بعد تسجيل المحاولة.'] };
    }

    // Project-based learning orchestration. Project content, evidence criteria and
    // assessment remain teacher/host supplied; this module only validates and tracks.
    const projectAssessments = ['validated', 'partial', 'not-yet', 'unclear'];
    function prepareProjectMilestone(raw, index) {
      raw = raw && typeof raw === 'object' ? raw : {};
      return {
        id: clean(raw.id), title: clean(raw.title), description: clean(raw.description) || null,
        tasks: (Array.isArray(raw.tasks) ? raw.tasks : []).map((task, ti) => ({
          id: clean(task && task.id), title: clean(task && task.title),
          assignee: clean(task && task.assignee) || null,
          status: clean(task && task.status) || 'pending'
        })),
        dependsOn: (Array.isArray(raw.dependsOn) ? raw.dependsOn : []).map(clean),
        requiredEvidence: (Array.isArray(raw.requiredEvidence) ? raw.requiredEvidence : []).map(clean).filter(Boolean),
        assessmentCriteria: (Array.isArray(raw.assessmentCriteria) ? raw.assessmentCriteria : []).map(clean).filter(Boolean),
        order: index + 1
      };
    }
    function validateProjectMilestones(rows) {
      const errors = [], ids = new Set(), taskIds = new Set();
      rows.forEach((m, i) => {
        if (!m.id) errors.push('project-milestone-id-required-at-' + i);
        else if (ids.has(m.id)) errors.push('duplicate-project-milestone-id');
        ids.add(m.id);
        if (!m.title) errors.push('project-milestone-title-required-at-' + i);
        if (!m.tasks.length) errors.push('project-milestone-tasks-required-at-' + i);
        if (!m.requiredEvidence.length) errors.push('project-milestone-evidence-required-at-' + i);
        if (!m.assessmentCriteria.length) errors.push('project-milestone-criteria-required-at-' + i);
        m.tasks.forEach((t, ti) => {
          if (!t.id || !t.title) errors.push('project-task-id-and-title-required-at-' + i + '-' + ti);
          else if (taskIds.has(t.id)) errors.push('duplicate-project-task-id');
          taskIds.add(t.id);
          if (!['pending', 'in-progress', 'completed'].includes(t.status)) errors.push('invalid-project-task-status');
        });
        if (new Set(m.dependsOn).size !== m.dependsOn.length) errors.push('duplicate-project-dependency');
      });
      rows.forEach((m, i) => m.dependsOn.forEach(dep => {
        if (!ids.has(dep)) errors.push('unknown-project-dependency:' + dep);
        else if (dep === m.id) errors.push('project-dependency-cycle');
        else {
          const depIndex = rows.findIndex(x => x.id === dep);
          if (depIndex >= i) errors.push('project-dependency-must-precede-milestone');
        }
      }));
      return errors;
    }
    function createProjectBasedLearningPlan(options) {
      options = options && typeof options === 'object' ? options : {};
      const title = clean(options.title), problem = clean(options.problem);
      if (!title) throw Error('project-title-required');
      if (!problem) throw Error('project-real-world-problem-required');
      const stage = stageKey(options.stage || options.grade), subject = clean(options.subject), family = familyKey(subject);
      const raw = Array.isArray(options.milestones) ? options.milestones : [];
      if (!raw.length) throw Error('project-milestones-required');
      const milestones = raw.map(prepareProjectMilestone);
      const errors = validateProjectMilestones(milestones);
      if (errors.length) throw Error(errors[0]);
      const mode = clean(options.mode || 'individual');
      if (!['individual', 'team'].includes(mode)) throw Error('invalid-project-mode');
      const plan = {
        version: VERSION, type: 'teacher-guided-project-based-learning', status: 'active',
        title, problem, subject: subject || null, subjectFamily: family, grade: clean(options.grade) || null,
        stage: stage || null, mode, team: Array.isArray(options.team) ? options.team.map(clean).filter(Boolean) : [],
        resources: Array.isArray(options.resources) ? options.resources.map(clean).filter(Boolean) : [],
        milestones, history: [], createdAt: clean(options.createdAt) || null,
        policy: 'teacher-authored-project-and-explicit-assessment; no-autonomous-semantic-grading'
      };
      return { plan, current: currentProjectMilestone(plan), progress: projectProgress(plan),
        safeguards: ['المشكلة والمهام والموارد ومعايير الأدلة يحددها الأستاذ أو المضيف.',
          'لا يصادق المحرك على جودة المنتج أو صحة المحتوى؛ يسجل تقييمًا صريحًا فقط.',
          'وضع الفريق ينظم أسماء المسؤولين ولا ينفذ تعاونًا آنيًا أو تخزينًا مشتركًا.'] };
    }
    function currentProjectMilestone(plan) {
      if (!plan || plan.type !== 'teacher-guided-project-based-learning' || !Array.isArray(plan.milestones)) throw Error('invalid-project-plan');
      if (plan.status === 'completed') return { done: true, message: 'اكتمل المشروع؛ راجع المنتج النهائي والأدلة والتأمل الختامي.' };
      const completed = new Set(plan.history.filter(x => x.assessment === 'validated').map(x => x.milestoneId));
      const next = plan.milestones.find(m => !completed.has(m.id) && m.dependsOn.every(id => completed.has(id)));
      if (!next) return { done: false, blocked: true, message: 'لا توجد مرحلة متاحة؛ راجع الاعتماديات وتقييم المراحل السابقة.' };
      return { done: false, milestone: { id: next.id, title: next.title, description: next.description,
        tasks: next.tasks.map(t => Object.assign({}, t)), requiredEvidence: next.requiredEvidence.slice(),
        assessmentCriteria: next.assessmentCriteria.slice(), order: next.order } };
    }
    function projectProgress(plan) {
      if (!plan || plan.type !== 'teacher-guided-project-based-learning' || !Array.isArray(plan.milestones)) throw Error('invalid-project-plan');
      const latest = new Map();
      plan.history.forEach(x => latest.set(x.milestoneId, x));
      const completed = plan.milestones.filter(m => latest.has(m.id) && latest.get(m.id).assessment === 'validated').length;
      const blocked = plan.milestones.filter(m => !latest.has(m.id) && m.dependsOn.some(id => !latest.has(id) || latest.get(id).assessment !== 'validated')).map(m => m.id);
      return { total: plan.milestones.length, completed, remaining: plan.milestones.length - completed,
        percent: Math.round(completed / plan.milestones.length * 100), blockedMilestones: blocked,
        status: plan.status, latestAssessments: Array.from(latest.values()).map(x => ({ milestoneId: x.milestoneId, assessment: x.assessment })) };
    }
    function submitProjectMilestone(plan, input) {
      if (!plan || plan.type !== 'teacher-guided-project-based-learning' || plan.status !== 'active' || !Array.isArray(plan.milestones)) throw Error('invalid-project-plan');
      input = input && typeof input === 'object' ? input : {};
      const current = currentProjectMilestone(plan);
      if (current.done) throw Error('project-already-completed');
      if (!current.milestone || clean(input.milestoneId) !== current.milestone.id) throw Error('project-milestone-not-current');
      const assessment = clean(input.assessment).toLowerCase();
      if (!projectAssessments.includes(assessment)) throw Error('explicit-project-assessment-required');
      const evidence = Array.isArray(input.evidence) ? input.evidence.map(clean).filter(Boolean) : [];
      if (!evidence.length) throw Error('project-evidence-required');
      const next = JSON.parse(JSON.stringify(plan));
      const milestone = next.milestones.find(m => m.id === current.milestone.id);
      const taskUpdates = Array.isArray(input.taskUpdates) ? input.taskUpdates : [];
      taskUpdates.forEach(update => {
        const task = milestone.tasks.find(t => t.id === clean(update && update.taskId));
        if (!task) throw Error('unknown-project-task-update');
        const status = clean(update.status);
        if (!['pending', 'in-progress', 'completed'].includes(status)) throw Error('invalid-project-task-status');
        task.status = status;
      });
      const record = { milestoneId: milestone.id, assessment, evidence,
        feedback: clean(input.feedback) || null, note: clean(input.note) || null,
        taskUpdates: taskUpdates.map(x => ({ taskId: clean(x.taskId), status: clean(x.status) })),
        assessedBy: clean(input.assessedBy) || null, recordedAt: clean(input.recordedAt) || null };
      next.history.push(record);
      if (assessment === 'validated') {
        // Completion is assessment-led, but retain unfinished task warnings for the teacher.
        const unfinished = milestone.tasks.filter(t => t.status !== 'completed').map(t => t.id);
        record.unfinishedTasks = unfinished;
        const doneIds = new Set(next.history.filter(x => x.assessment === 'validated').map(x => x.milestoneId));
        if (next.milestones.every(m => doneIds.has(m.id))) next.status = 'completed';
      }
      return { plan: next, advanced: assessment === 'validated', completed: next.status === 'completed',
        current: currentProjectMilestone(next), progress: projectProgress(next),
        result: { milestoneId: milestone.id, assessment, evidenceRecorded: evidence.length,
          unfinishedTasks: record.unfinishedTasks || [],
          evaluatorBoundary: 'التقييم الصريح من الأستاذ أو المقيّم المضيف؛ لم ينفذ المحرك فحصًا دلاليًا للمنتج أو الأدلة.' } };
    }

    // Project assessment: configurable weighted rubric, evidence-backed ratings,
    // and separate teacher/self/peer perspectives. Only teacher ratings are official.
    const projectRatingStatuses = ['demonstrated', 'partial', 'not_demonstrated', 'not_assessed'];
    const projectEvaluatorRoles = ['teacher', 'self', 'peer'];
    function prepareProjectRubric(criteria) {
      if (!Array.isArray(criteria) || !criteria.length) throw Error('project-rubric-criteria-required');
      const seen = new Set();
      const rows = criteria.map((raw, index) => {
        raw = raw && typeof raw === 'object' ? raw : {};
        const key = clean(raw.key), label = clean(raw.label || raw.criterion), weight = Number(raw.weight);
        if (!key || !label) throw Error('project-rubric-key-and-label-required-at-' + index);
        if (seen.has(key)) throw Error('duplicate-project-rubric-key');
        seen.add(key);
        if (!Number.isFinite(weight) || weight <= 0) throw Error('invalid-project-rubric-weight-at-' + index);
        return { key, label, weight };
      });
      const total = rows.reduce((n, x) => n + x.weight, 0);
      if (Math.abs(total - 100) > 0.001) throw Error('project-rubric-weights-must-total-100');
      return rows;
    }
    function evaluateProjectMilestone(input) {
      input = input && typeof input === 'object' ? input : {};
      const milestoneId = clean(input.milestoneId);
      if (!milestoneId) throw Error('project-evaluation-milestone-required');
      const role = clean(input.evaluatorRole).toLowerCase();
      if (!projectEvaluatorRoles.includes(role)) throw Error('invalid-project-evaluator-role');
      const rubric = prepareProjectRubric(input.criteria);
      const ratings = input.ratings && typeof input.ratings === 'object' ? input.ratings : {};
      const rows = rubric.map(rule => {
        const raw = ratings[rule.key];
        const item = typeof raw === 'string' ? { status: raw } : (raw && typeof raw === 'object' ? raw : {});
        const status = clean(item.status).toLowerCase();
        if (!projectRatingStatuses.includes(status) && raw != null) throw Error('invalid-project-rating-status:' + rule.key);
        const actual = projectRatingStatuses.includes(status) ? status : 'not_assessed';
        const note = clean(item.evidence || item.note);
        if (actual !== 'not_assessed' && !note) throw Error('project-rating-evidence-required:' + rule.key);
        const factor = actual === 'demonstrated' ? 1 : actual === 'partial' ? 0.5 : 0;
        return { key: rule.key, criterion: rule.label, weight: rule.weight, status: actual,
          evidence: note || null, earnedWeight: actual === 'not_assessed' ? null : rule.weight * factor };
      });
      const assessed = rows.filter(x => x.status !== 'not_assessed');
      const assessedWeight = assessed.reduce((n, x) => n + x.weight, 0);
      const earnedWeight = assessed.reduce((n, x) => n + x.earnedWeight, 0);
      const score = assessedWeight ? Math.round(earnedWeight / assessedWeight * 1000) / 10 : null;
      const unassessedCriteria = rows.filter(x => x.status === 'not_assessed').map(x => x.key);
      const improvementPriorities = rows.filter(x => x.status === 'partial' || x.status === 'not_demonstrated')
        .map(x => ({ criterion: x.key, nextStep: 'راجع الشاهد المرتبط بهذا المعيار، وحدد إجراء تحسين قابلًا للملاحظة قبل إعادة التقويم.' }));
      const evaluation = { version: VERSION, milestoneId, evaluatorRole: role,
        evaluatorId: clean(input.evaluatorId) || null, score, assessedWeight,
        coverage: Math.round(assessedWeight), totalWeight: 100, earnedWeight,
        criteria: rows, unassessedCriteria, improvementPriorities,
        interpretation: score == null ? 'insufficient-evidence' : score >= 85 ? 'strong-evidence' : score >= 65 ? 'developing-evidence' : 'needs-revision',
        official: role === 'teacher', recordedAt: clean(input.recordedAt) || null,
        safeguards: ['الدرجة محسوبة من المعايير المقيمة فقط؛ المعيار غير المقيم لا يحتسب صفرًا.',
          'التقويم الذاتي وتقويم الأقران آراء مساندة وليسا حكمًا رسميًا.',
          'لا يفحص المحرك المنتج أو الشواهد دلاليًا؛ يحدد المقيّم الحالة ويقدم الدليل.',
          'تظل مسؤولية اعتماد النتيجة النهائية للأستاذ أو الجهة التعليمية المخولة.'] };
      return evaluation;
    }
    function summarizeProjectEvaluations(evaluations) {
      if (!Array.isArray(evaluations)) throw Error('project-evaluations-array-required');
      const rows = evaluations.filter(x => x && x.version === VERSION && projectEvaluatorRoles.includes(x.evaluatorRole));
      const milestoneIds = Array.from(new Set(rows.map(x => x.milestoneId)));
      if (milestoneIds.length > 1) throw Error('project-evaluations-milestone-mismatch');
      const byRole = {};
      projectEvaluatorRoles.forEach(role => {
        const selected = rows.filter(x => x.evaluatorRole === role && Number.isFinite(x.score));
        byRole[role] = { count: selected.length,
          meanScore: selected.length ? Math.round(selected.reduce((n, x) => n + x.score, 0) / selected.length * 10) / 10 : null };
      });
      const criteria = {};
      rows.forEach(evaluation => evaluation.criteria.forEach(item => {
        if (!criteria[item.key]) criteria[item.key] = { criterion: item.criterion, byRole: {} };
        const group = criteria[item.key].byRole;
        if (!group[evaluation.evaluatorRole]) group[evaluation.evaluatorRole] = { assessed: 0, demonstrated: 0, partial: 0, notDemonstrated: 0, notAssessed: 0 };
        const stats = group[evaluation.evaluatorRole];
        if (item.status === 'not_assessed') stats.notAssessed += 1;
        else {
          stats.assessed += 1;
          if (item.status === 'demonstrated') stats.demonstrated += 1;
          else if (item.status === 'partial') stats.partial += 1;
          else stats.notDemonstrated += 1;
        }
      }));
      return { version: VERSION, milestoneId: milestoneIds[0] || null, totalEvaluations: rows.length,
        byRole, criteria, officialTeacherEvaluations: rows.filter(x => x.evaluatorRole === 'teacher').length,
        note: 'يعرض الملخص وجهات نظر منفصلة؛ لا يدمج درجات المتعلم والأقران في الدرجة الرسمية، ولا يثبت اتفاق المقيّمين صحة المنتج.' };
    }

    // Analyze explicitly tagged learner errors; never infer error categories from answer text.
    function analyzeLearnerErrors(input) {
      input = input && typeof input === 'object' ? input : {};
      const profile = input.profile;
      if (!profile || profile.profileType !== 'explicit-evidence-only' || !Array.isArray(profile.evidence)) throw Error('valid-learner-profile-required');
      if (!Array.isArray(input.attempts)) throw Error('learner-error-attempts-required');
      const requestedSkill = clean(input.skill);
      if (requestedSkill && !learnerSkills.includes(requestedSkill)) throw Error('invalid-learning-skill');
      const validAssessments = ['partial', 'incorrect'];
      const rows = input.attempts.map((raw, index) => {
        if (!raw || typeof raw !== 'object') throw Error('invalid-error-attempt-at-' + index);
        const skill = clean(raw.skill) || requestedSkill || 'general';
        const assessment = clean(raw.assessment).toLowerCase();
        const errorCode = clean(raw.errorCode).toLowerCase() || 'unknown';
        if (!learnerSkills.includes(skill)) throw Error('invalid-learning-skill-at-' + index);
        if (requestedSkill && skill !== requestedSkill) throw Error('error-attempt-skill-mismatch-at-' + index);
        if (!validAssessments.includes(assessment)) throw Error('explicit-error-assessment-required-at-' + index);
        if (!Object.prototype.hasOwnProperty.call(practiceErrorGuidance, errorCode)) throw Error('invalid-practice-error-code-at-' + index);
        const taskId = clean(raw.taskId);
        if (!taskId) throw Error('error-attempt-task-id-required-at-' + index);
        return { skill, taskId, assessment, errorCode, note: clean(raw.note) || null, recordedAt: clean(raw.recordedAt) || null, index };
      });
      const groups = new Map();
      rows.forEach(row => {
        const key = row.skill + '|' + row.errorCode;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
      const findings = Array.from(groups.values()).map(group => {
        const first = group[0], distinctTasks = Array.from(new Set(group.map(x => x.taskId)));
        const recent = group.slice(-3), recentCount = recent.length;
        const repeated = group.length >= 2 && distinctTasks.length >= 2;
        const family = profile.subjectFamily || 'general';
        const activity = first.errorCode === 'concept'
          ? (family === 'mathematics' ? 'مثّل المفهوم بأعداد أو رسم بسيط، ثم اطلب من المتعلم شرحه بكلماته.' : 'قدّم مثالًا محسوسًا أو مألوفًا ومثالًا مضادًا، ثم اطلب تحديد الخاصية المشتركة.')
          : first.errorCode === 'procedure' ? 'جزّئ المهمة إلى خطوات قصيرة، واطلب من المتعلم تحديد أول خطوة يحتاج إلى مراجعتها.'
          : first.errorCode === 'evidence' ? 'اطلب من المتعلم تمييز المعطيات أو الشواهد ثم ربط كل استنتاج بدليله.'
          : first.errorCode === 'language' ? 'بسّط صياغة المطلوب واطلب إعادة التعبير عن الفكرة دون تغيير مضمونها.'
          : first.errorCode === 'instruction' ? 'أعد عرض شروط المهمة في نقاط قصيرة واطلب من المتعلم شرح المطلوب قبل الحل.'
          : 'اطلب توضيحًا إضافيًا أو مهمة تشخيصية قصيرة قبل تحديد نوع المعالجة.';
        return { skill: first.skill, errorCode: first.errorCode, occurrences: group.length,
          distinctTasks: distinctTasks.length, repeatedAcrossTasks: repeated,
          priority: repeated ? 'high' : 'review', pattern: repeated ? 'recurring-explicit-tag' : 'single-or-same-task-observation',
          latestAssessment: group[group.length - 1].assessment,
          recentOccurrences: recentCount, recentSameCodeCount: recentCount,
          latestNote: group[group.length - 1].note,
          explanation: practiceErrorGuidance[first.errorCode], suggestedActivity: activity,
          nextAction: repeated ? 'targeted-remediation-and-recheck' : 'brief-review-and-recheck',
          evidenceTaskIds: distinctTasks };
      }).sort((a, b) => (a.priority === b.priority ? b.occurrences - a.occurrences : a.priority === 'high' ? -1 : 1));
      return { version: VERSION, stage: profile.stage || null, subject: profile.subject || null,
        subjectFamily: profile.subjectFamily || 'general', analyzedAttempts: rows.length,
        findings, summary: { errorGroups: findings.length, recurringGroups: findings.filter(x => x.repeatedAcrossTasks).length,
          skillsNeedingReview: Array.from(new Set(findings.map(x => x.skill))) },
        basis: 'explicit-assessor-tags-only',
        safeguards: ['لا يستنتج المحرك نوع الخطأ من نص إجابة المتعلم؛ errorCode يمرره الأستاذ أو المقيّم.',
          'لا يعد تكرار الخطأ مثبتًا إلا عند ظهوره في مهمتين مختلفتين على الأقل.',
          'التوصيات أنشطة مقترحة وليست تشخيصًا نفسيًا أو حكمًا ثابتًا على قدرة المتعلم.',
          'لا تُستبدل مراجعة صحة المحتوى العلمي بمخرجات هذا التحليل.'] };
    }

    // Prerequisite-gap analysis. Relationships are supplied by the host/teacher;
    // this engine never invents official curriculum sequencing.
    function analyzeLearningGaps(input) {
      input = input && typeof input === 'object' ? input : {};
      const profile = input.profile;
      if (!profile || profile.profileType !== 'explicit-evidence-only' || !Array.isArray(profile.evidence)) throw Error('valid-learner-profile-required');
      const target = clean(input.targetSkill);
      if (!learnerSkills.includes(target)) throw Error('invalid-target-learning-skill');
      if (!Array.isArray(input.prerequisites) || !input.prerequisites.length) throw Error('prerequisite-map-required');
      const nodes = new Map();
      input.prerequisites.forEach(row => {
        if (!row || !learnerSkills.includes(clean(row.skill))) throw Error('invalid-prerequisite-skill');
        const skill = clean(row.skill);
        if (nodes.has(skill)) throw Error('duplicate-prerequisite-skill');
        const dependsOn = Array.isArray(row.dependsOn) ? row.dependsOn.map(clean) : [];
        if (dependsOn.some(x => !learnerSkills.includes(x))) throw Error('invalid-prerequisite-dependency');
        nodes.set(skill, { skill, dependsOn });
      });
      if (!nodes.has(target)) throw Error('target-skill-missing-from-prerequisite-map');
      nodes.forEach(row => row.dependsOn.forEach(dep => { if (!nodes.has(dep)) throw Error('unknown-prerequisite-dependency'); }));
      const ordered = [], visiting = new Set(), visited = new Set();
      function visit(skill) {
        if (visiting.has(skill)) throw Error('prerequisite-cycle-detected');
        if (visited.has(skill)) return;
        visiting.add(skill);
        nodes.get(skill).dependsOn.forEach(visit);
        visiting.delete(skill); visited.add(skill); ordered.push(skill);
      }
      visit(target);
      const latest = new Map();
      profile.evidence.forEach(item => { if (ordered.includes(item.skill)) latest.set(item.skill, item); });
      const steps = ordered.map(skill => {
        const evidence = latest.get(skill);
        const outcome = evidence ? evidence.outcome : 'unknown';
        const role = skill === target ? 'target' : 'prerequisite';
        const action = outcome === 'mastered' ? 'ready' : outcome === 'struggling' ? 'remediate' : outcome === 'partial' ? 'guided-review' : 'diagnose';
        return { skill, role, outcome, action, evidenceNote: evidence ? evidence.note : null,
          recommendation: action === 'ready' ? 'يمكن استخدام هذه المهارة ضمن المسار الحالي مع متابعة التحقق.' : action === 'remediate' ? 'عالج موضع التعثر بمثال أبسط أو تمثيل بديل ثم اجمع شاهدًا جديدًا.' : action === 'guided-review' ? 'قدّم تدريبًا موجّهًا قصيرًا لتثبيت المهارة قبل الانتقال.' : 'اجمع دليلًا تشخيصيًا لهذه المهارة قبل الحكم على جاهزيتها.' };
      });
      const blocking = steps.filter(x => x.role === 'prerequisite' && x.outcome !== 'mastered');
      const targetEvidence = steps.find(x => x.role === 'target');
      return { version: VERSION, targetSkill: target, stage: profile.stage || null, subjectFamily: profile.subjectFamily || 'general',
        readiness: blocking.length ? 'prerequisites_need_attention' : targetEvidence.outcome === 'unknown' ? 'target_needs_diagnosis' : targetEvidence.outcome === 'mastered' ? 'target_demonstrated' : 'target_needs_practice',
        orderedSkills: steps, blockingPrerequisites: blocking.map(x => x.skill),
        relationshipBasis: { type: 'caller-supplied', label: clean(input.relationshipSource) || null, officiallyVerified: input.officiallyVerified === true,
          note: input.officiallyVerified === true ? 'أدخل المضيف تصريح التحقق؛ يجب الاحتفاظ بمرجع الوثيقة الداعمة.' : 'علاقات المتطلبات السابقة مقدمة من المضيف أو الأستاذ، ولا تمثل تدرجًا وزاريًا مثبتًا.' },
        safeguards: ['المهارة التي لا تملك شاهدًا توصف بأنها غير معروفة وتحتاج إلى تشخيص، لا بأنها ضعيفة.', 'لا تُستنتج المتطلبات السابقة تلقائيًا من تشابه أسماء المهارات.', 'لا يُعد تصريح التحقق الرسمي بديلاً عن حفظ مرجع المصدر ومراجعته.'] };
    }

    function isSession(value) {
      return !!(value && value.plan && Array.isArray(value.plan.phases) && Array.isArray(value.history) && Number.isInteger(value.phaseIndex));
    }
    function currentTurn(session) {
      if (!isSession(session)) throw Error('invalid-teaching-session');
      if (session.status === 'completed') return { done: true, message: 'اكتملت الحصة. راجع ما تعلمته وحدد ما تريد التدرب عليه لاحقًا.' };
      const phase = session.plan.phases[session.phaseIndex];
      if (!phase) return { done: true, message: 'لا توجد مرحلة تعليمية تالية.' };
      return {
        done: false,
        phaseIndex: session.phaseIndex,
        phaseId: phase.id,
        phaseTitle: phase.title,
        teacherMove: phase.teacher,
        learnerTask: phase.learner,
        prompt: phase.prompt,
        checkpoint: phase.checkpoint,
        attempt: session.attemptsInPhase + 1,
        hintLevel: session.hintsUsedInPhase
      };
    }
    function createSession(options) {
      options = options || {};
      const plan = planLesson(options);
      const session = {
        version: VERSION,
        status: 'active',
        plan,
        phaseIndex: 0,
        attemptsInPhase: 0,
        hintsUsedInPhase: 0,
        history: [],
        assessmentPolicy: 'لا يصدر هذا المحرك حكمًا دلاليًا على إجابة حرة. يجب أن يأتي assessment من الأستاذ أو من مصحح موثوق مرتبط بالمحتوى.'
      };
      return { session, turn: currentTurn(session), policy: session.assessmentPolicy };
    }
    function submitResponse(session, input) {
      if (!isSession(session)) throw Error('invalid-teaching-session');
      if (session.status !== 'active') throw Error('teaching-session-not-active');
      input = input || {};
      const answer = clean(input.answer);
      const allowed = ['correct', 'partial', 'incorrect', 'unclear'];
      const supplied = clean(input.assessment).toLowerCase();
      const assessment = allowed.includes(supplied) ? supplied : 'unclear';
      const phase = session.plan.phases[session.phaseIndex];
      session.attemptsInPhase += 1;
      session.history.push({ phaseId: phase.id, answer: answer || null, assessment, evidence: clean(input.evidence) || null, attempt: session.attemptsInPhase });

      if (assessment === 'correct') {
        const previousPhase = phase.id;
        session.phaseIndex += 1;
        session.attemptsInPhase = 0;
        session.hintsUsedInPhase = 0;
        if (session.phaseIndex >= session.plan.phases.length) {
          session.status = 'completed';
          return { outcome: 'phase-mastered', completed: true, previousPhase, feedback: feedback({ status: 'correct' }), turn: currentTurn(session), progress: { completedPhases: session.plan.phases.length, totalPhases: session.plan.phases.length } };
        }
        return { outcome: 'phase-mastered', completed: false, previousPhase, feedback: feedback({ status: 'correct' }), turn: currentTurn(session), progress: { completedPhases: session.phaseIndex, totalPhases: session.plan.phases.length } };
      }

      if (assessment === 'unclear' || !answer) {
        return { outcome: 'needs-clarification', completed: false, feedback: feedback({ status: 'unclear' }), teacherPrompt: 'هل يمكنك توضيح إجابتك أو ذكر الخطوة التي اعتمدت عليها؟', turn: currentTurn(session), progress: { completedPhases: session.phaseIndex, totalPhases: session.plan.phases.length }, assessmentRequired: !supplied };
      }

      const status = assessment === 'incorrect' ? 'misconception' : 'partial';
      const responseFeedback = feedback({ status });
      if (session.hintsUsedInPhase < 3) {
        const ladder = hintLadder({ topic: session.plan.topic, subject: session.plan.subject, stage: session.plan.stage });
        const hint = ladder.hints[session.hintsUsedInPhase];
        session.hintsUsedInPhase += 1;
        return { outcome: assessment === 'partial' ? 'partial-progress' : 'needs-support', completed: false, feedback: responseFeedback, hint, turn: currentTurn(session), progress: { completedPhases: session.phaseIndex, totalPhases: session.plan.phases.length } };
      }
      return {
        outcome: 'change-teaching-method', completed: false, feedback: responseFeedback,
        intervention: 'أوقف تكرار التلميحات نفسها. غيّر التمثيل أو المثال، وارجع إلى متطلب سابق عند الحاجة، ثم أعد طرح سؤال تشخيصي قصير.',
        diagnosisReminder: 'لا تصنّف نوع الخطأ تلقائيًا؛ مرّر نوع التعثر فقط إذا حدده الأستاذ أو مصحح موثوق.',
        turn: currentTurn(session), progress: { completedPhases: session.phaseIndex, totalPhases: session.plan.phases.length }
      };
    }
    // Immutable multi-turn dialogue facade over the existing lesson-session engine.
    // Natural-language assessment remains the responsibility of an explicit host evaluator/teacher.
    function createDialogueTutor(options) {
      const created = createSession(options || {});
      const tutor = {
        version: VERSION,
        type: 'explicit-assessment-dialogue',
        status: 'active',
        turnNumber: 1,
        session: created.session,
        assessmentContract: {
          evaluator: 'host-or-teacher',
          acceptedOutcomes: ['correct', 'partial', 'incorrect', 'unclear'],
          requirement: 'مرّر assessment صريحًا بعد فحص الإجابة وفق هدف المرحلة ومعاييرها؛ لا يستنتج المحرك صحة النص الحر.'
        }
      };
      return { tutor, turn: created.turn, policy: created.policy };
    }
    function submitDialogueTurn(tutor, input) {
      if (!tutor || tutor.type !== 'explicit-assessment-dialogue' || tutor.status !== 'active' || !isSession(tutor.session)) throw Error('invalid-dialogue-tutor');
      input = input || {};
      const accepted = ['correct', 'partial', 'incorrect', 'unclear'];
      const assessment = clean(input.assessment).toLowerCase();
      if (!accepted.includes(assessment)) throw Error('explicit-dialogue-assessment-required');
      const answer = clean(input.answer);
      if (!answer) throw Error('learner-answer-required');
      // Clone before using the legacy mutating session transition to preserve caller state.
      const nextSession = JSON.parse(JSON.stringify(tutor.session));
      const transition = submitResponse(nextSession, {
        answer,
        assessment,
        evidence: clean(input.evidence) || null
      });
      const nextTutor = Object.assign({}, tutor, {
        status: nextSession.status,
        turnNumber: tutor.turnNumber + 1,
        session: nextSession
      });
      return {
        tutor: nextTutor,
        result: transition,
        turn: transition.turn,
        progress: transition.progress,
        status: nextTutor.status,
        evaluatorBoundary: 'تم استخدام التقييم الصريح الممرر من المضيف فقط؛ لم يجر تحليل دلالي مستقل للإجابة داخل المحرك.'
      };
    }
    // Stateful orchestration: combine the existing multi-turn tutor with the adaptive
    // dialogue policy while preserving explicit host assessment and immutable inputs.
    function submitAdaptiveDialogueTurn(tutor, input) {
      if (!tutor || tutor.type !== 'explicit-assessment-dialogue' || tutor.status !== 'active' || !isSession(tutor.session)) throw Error('invalid-dialogue-tutor');
      input = input && typeof input === 'object' ? input : {};
      const assessment = clean(input.assessment).toLowerCase();
      if (!['correct', 'partial', 'incorrect', 'unclear'].includes(assessment)) throw Error('explicit-dialogue-assessment-required');
      if (!clean(input.answer)) throw Error('learner-answer-required');

      const phaseId = tutor.session.plan.phases[tutor.session.phaseIndex] && tutor.session.plan.phases[tutor.session.phaseIndex].id;
      const priorPhaseAttempts = tutor.session.history.filter(row => row.phaseId === phaseId);
      const priorDifficulties = priorPhaseAttempts.filter(row => row.assessment === 'partial' || row.assessment === 'incorrect').length;
      const repeatedDifficulty = input.repeatedDifficulty === true || priorDifficulties >= 2;
      const maxHints = input.maxHints == null ? 2 : Number(input.maxHints);
      const adaptive = planAdaptiveDialogueMove({
        assessment,
        hintCount: tutor.session.hintsUsedInPhase,
        maxHints,
        repeatedDifficulty,
        stage: input.stage || tutor.session.plan.stageLabel || tutor.session.plan.stage,
        grade: input.grade || tutor.session.plan.grade,
        subject: input.subject || tutor.session.plan.subject,
        supports: Array.isArray(input.supports) ? input.supports : []
      });
      if (!adaptive.valid) return { valid: false, errors: adaptive.errors, tutor, adaptive: null, result: null };

      const submitted = submitDialogueTurn(tutor, { answer: input.answer, assessment, evidence: input.evidence });
      const nextTutor = Object.assign({}, submitted.tutor, {
        lastAdaptiveMove: {
          move: adaptive.decision.move,
          reason: adaptive.decision.reason,
          selectedSupportId: adaptive.selectedSupport ? adaptive.selectedSupport.id : null
        }
      });
      return {
        valid: true,
        tutor: nextTutor,
        result: submitted.result,
        turn: submitted.turn,
        progress: submitted.progress,
        status: submitted.status,
        adaptive: {
          decision: adaptive.decision,
          selectedSupport: adaptive.selectedSupport,
          pendingSupports: adaptive.pendingSupports,
          rejectedSupports: adaptive.rejectedSupports,
          requiresTeacherAuthoredSupport: adaptive.requiresTeacherAuthoredSupport
        },
        dialogue: {
          turnNumber: nextTutor.turnNumber,
          phaseId: phaseId || null,
          priorAttemptsInPhase: priorPhaseAttempts.length,
          repeatedDifficultyDetectedFromExplicitHistory: priorDifficulties >= 2,
          assessmentSource: 'host-or-teacher'
        },
        evaluatorBoundary: 'استُخدم التقييم الصريح من الأستاذ أو المضيف؛ لم يحلل المحرك صحة الإجابة الحرة دلاليًا.'
      };
    }

    function sessionSummary(session) {
      if (!isSession(session)) throw Error('invalid-teaching-session');
      const completed = session.status === 'completed' ? session.plan.phases.length : session.phaseIndex;
      return { status: session.status, topic: session.plan.topic, subject: session.plan.subject, stage: session.plan.stageLabel, completedPhases: completed, totalPhases: session.plan.phases.length, attempts: session.history.length, history: session.history.slice(), note: 'ملخص وصفي للمحاولات والتقدم، وليس حكمًا رسميًا على كفاءة المتعلم.' };
    }
    // Competency development is longitudinal and based only on explicit, attributable evidence.
    const competencyLevels = ['not_yet', 'emerging', 'developing', 'demonstrated'];
    function prepareCompetencies(rows) {
      if (!Array.isArray(rows) || !rows.length) throw Error('competency-definitions-required');
      const seen = new Set();
      const prepared = rows.map((row, index) => {
        row = row && typeof row === 'object' ? row : {};
        const id = clean(row.id), name = clean(row.name);
        const weight = row.weight == null ? 1 : Number(row.weight);
        if (!id || !name) throw Error('competency-id-and-name-required-at-' + index);
        if (seen.has(id)) throw Error('duplicate-competency-id');
        if (!Number.isFinite(weight) || weight <= 0) throw Error('invalid-competency-weight-at-' + index);
        seen.add(id);
        return { id, name, description: clean(row.description) || null, weight };
      });
      return prepared;
    }
    function createCompetencyProfile(input) {
      input = input && typeof input === 'object' ? input : {};
      const competencies = prepareCompetencies(input.competencies);
      return { version: VERSION, profileType: 'explicit-competency-evidence',
        stage: stageKey(input.stage || input.grade) || null, subject: clean(input.subject) || null,
        subjectFamily: familyKey(input.subject), competencies, evidence: [],
        policy: 'longitudinal-explicit-evidence-only; no-inferred-ability; host-managed-storage' };
    }
    function recordCompetencyEvidence(profile, item) {
      if (!profile || profile.profileType !== 'explicit-competency-evidence' || !Array.isArray(profile.competencies) || !Array.isArray(profile.evidence)) throw Error('invalid-competency-profile');
      item = item && typeof item === 'object' ? item : {};
      const competencyId = clean(item.competencyId);
      if (!profile.competencies.some(x => x.id === competencyId)) throw Error('unknown-competency-id');
      const level = clean(item.level);
      if (!competencyLevels.includes(level)) throw Error('invalid-competency-level');
      const note = clean(item.evidence);
      if (!note) throw Error('competency-evidence-required');
      const taskId = clean(item.taskId);
      if (!taskId) throw Error('competency-task-id-required');
      const assessedBy = clean(item.assessedBy);
      if (!assessedBy) throw Error('competency-assessor-required');
      const entry = { competencyId, level, value: competencyLevels.indexOf(level), evidence: note,
        taskId, source: clean(item.source) || 'teacher_or_assessment', assessedBy,
        recordedAt: clean(item.recordedAt) || null };
      return Object.assign({}, profile, { evidence: profile.evidence.concat([entry]) });
    }
    // Personalized learning pathways orchestrate host-authored activities from explicit evidence.
    // They do not generate curriculum sequencing or infer mastery from learner text.
    const pathwayOutcomes = ['completed', 'partial', 'not_yet', 'unclear'];
    function createPersonalLearningPathway(input) {
      input = input && typeof input === 'object' ? input : {};
      const subject = clean(input.subject), goal = clean(input.goal);
      if (!subject) throw Error('pathway-subject-required');
      if (!goal) throw Error('pathway-goal-required');
      const stage = stageKey(input.stage || input.grade) || null;
      const family = familyKey(subject);
      if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 60) throw Error('pathway-steps-required');
      const seen = new Set();
      const steps = input.steps.map((raw, index) => {
        if (!raw || typeof raw !== 'object') throw Error('invalid-pathway-step');
        const id = clean(raw.id), title = clean(raw.title), activity = clean(raw.activity);
        if (!id || seen.has(id)) throw Error('pathway-step-id-invalid-or-duplicate');
        if (!title || !activity) throw Error('pathway-step-content-required');
        const kind = clean(raw.kind || 'practice');
        if (!['diagnostic','lesson','practice','project','reflection','assessment','transfer'].includes(kind)) throw Error('invalid-pathway-step-kind');
        const dependsOn = Array.isArray(raw.dependsOn) ? raw.dependsOn.map(clean).filter(Boolean) : [];
        if (new Set(dependsOn).size !== dependsOn.length || dependsOn.includes(id)) throw Error('invalid-pathway-dependencies');
        seen.add(id);
        return { id, title, activity, kind, competencyId: clean(raw.competencyId) || null,
          skill: clean(raw.skill) || null, dependsOn, resources: Array.isArray(raw.resources) ? raw.resources.map(clean).filter(Boolean) : [],
          expectedEvidence: clean(raw.expectedEvidence) || null, source: clean(raw.source) || null, order: index };
      });
      steps.forEach(step => step.dependsOn.forEach(dep => { if (!seen.has(dep)) throw Error('unknown-pathway-dependency'); }));
      const byId = new Map(steps.map(x => [x.id, x])), visiting = new Set(), visited = new Set(), ordered = [];
      function visit(id) {
        if (visiting.has(id)) throw Error('pathway-dependency-cycle');
        if (visited.has(id)) return;
        visiting.add(id);
        byId.get(id).dependsOn.forEach(visit);
        visiting.delete(id); visited.add(id); ordered.push(id);
      }
      steps.forEach(x => visit(x.id));
      const orderIndex = new Map(ordered.map((id, i) => [id, i]));
      steps.sort((a,b) => orderIndex.get(a.id)-orderIndex.get(b.id));
      return { version: VERSION, pathwayType: 'evidence-guided-personal-learning-pathway',
        learnerId: clean(input.learnerId) || null, stage, subject, subjectFamily: family, goal,
        steps: steps.map(({order, ...x}) => Object.assign({}, x, { status: 'pending', attempts: [] })),
        status: 'active', createdFrom: { learningEvidenceCount: Number.isInteger(input.learningEvidenceCount) && input.learningEvidenceCount >= 0 ? input.learningEvidenceCount : 0,
          competencySummaryProvided: !!input.competencySummary, learningGapAnalysisProvided: !!input.learningGapAnalysis },
        policy: 'host-authored-sequence; explicit-assessment-only; host-managed-persistence' };
    }
    function currentPersonalLearningStep(pathway) {
      if (!pathway || pathway.pathwayType !== 'evidence-guided-personal-learning-pathway' || !Array.isArray(pathway.steps)) throw Error('invalid-personal-learning-pathway');
      const ready = pathway.steps.find(step => step.status !== 'completed' && step.dependsOn.every(id => pathway.steps.some(x => x.id === id && x.status === 'completed')));
      if (!ready) return { done: pathway.steps.every(x => x.status === 'completed'), blocked: pathway.steps.some(x => x.status !== 'completed'), message: pathway.steps.every(x => x.status === 'completed') ? 'اكتمل المسار التعليمي؛ راجع الشواهد وحدد هدفًا جديدًا.' : 'توجد خطوات تنتظر استكمال متطلباتها السابقة.' };
      return { done: false, step: { id: ready.id, title: ready.title, activity: ready.activity, kind: ready.kind,
        competencyId: ready.competencyId, skill: ready.skill, expectedEvidence: ready.expectedEvidence, resources: ready.resources },
        completedSteps: pathway.steps.filter(x => x.status === 'completed').length, totalSteps: pathway.steps.length,
        attempt: ready.attempts.length + 1 };
    }
    function submitPersonalLearningStep(pathway, input) {
      if (!pathway || pathway.pathwayType !== 'evidence-guided-personal-learning-pathway' || pathway.status !== 'active' || !Array.isArray(pathway.steps)) throw Error('invalid-personal-learning-pathway');
      input = input && typeof input === 'object' ? input : {};
      const current = currentPersonalLearningStep(pathway);
      if (current.done || current.blocked) throw Error('no-available-pathway-step');
      const step = pathway.steps.find(x => x.id === current.step.id);
      if (clean(input.stepId) !== step.id) throw Error('pathway-step-order-mismatch');
      const response = clean(input.response), outcome = clean(input.outcome).toLowerCase();
      if (!response) throw Error('pathway-response-required');
      if (!pathwayOutcomes.includes(outcome)) throw Error('explicit-pathway-outcome-required');
      const assessor = clean(input.assessedBy);
      if (!assessor) throw Error('pathway-assessor-required');
      const evidence = clean(input.evidence);
      if (outcome === 'completed' && !evidence) throw Error('completion-evidence-required');
      const next = JSON.parse(JSON.stringify(pathway));
      const target = next.steps.find(x => x.id === step.id);
      target.attempts.push({ response, outcome, evidence: evidence || null, feedback: clean(input.feedback) || null,
        assessedBy: assessor, assessedAt: clean(input.assessedAt) || null });
      if (outcome === 'completed') target.status = 'completed';
      else if (outcome === 'not_yet') target.status = 'needs_support';
      else if (outcome === 'partial') target.status = 'in_progress';
      else target.status = 'awaiting_clarification';
      const finished = next.steps.every(x => x.status === 'completed');
      if (finished) next.status = 'completed';
      return { pathway: next, result: { stepId: step.id, status: target.status, outcome,
        advanced: outcome === 'completed', nextStep: finished ? null : currentPersonalLearningStep(next),
        note: 'اعتمد الانتقال على نتيجة صريحة وشاهد إنجاز؛ لا يحلل المحرك صحة الاستجابة دلاليًا.' } };
    }
    function summarizePersonalLearningPathway(pathway) {
      if (!pathway || pathway.pathwayType !== 'evidence-guided-personal-learning-pathway' || !Array.isArray(pathway.steps)) throw Error('invalid-personal-learning-pathway');
      const counts = pathway.steps.reduce((acc, step) => { acc[step.status] = (acc[step.status] || 0) + 1; return acc; }, {});
      const completed = counts.completed || 0;
      return { version: VERSION, status: pathway.status, learnerId: pathway.learnerId, stage: pathway.stage,
        subject: pathway.subject, subjectFamily: pathway.subjectFamily, goal: pathway.goal,
        totalSteps: pathway.steps.length, completedSteps: completed, progress: Math.round(completed / pathway.steps.length * 100),
        counts, pendingSteps: pathway.steps.filter(x => x.status !== 'completed').map(x => ({ id: x.id, title: x.title, status: x.status,
          attempts: x.attempts.length, blockedBy: x.dependsOn.filter(id => !pathway.steps.some(y => y.id === id && y.status === 'completed')) })),
        safeguards: ['ترتيب الأنشطة ومحتواها يقدمهما الأستاذ أو المضيف ولا يستنتجهما المحرك من المنهاج.',
          'الإنجاز لا يسجل إلا بتقييم صريح وشاهد موثق.', 'التقدم يقيس إكمال خطوات المسار ولا يساوي إتقان الكفاءة.',
          'البيانات محلية في كائن المسار؛ التخزين والمزامنة مسؤولية المضيف.'] };
    }

    function chooseAdaptivePathwayRoute(input) {
      input = input && typeof input === 'object' ? input : {};
      const outcome = clean(input.outcome).toLowerCase(), assessor = clean(input.assessedBy), evidence = clean(input.evidence);
      const routes = input.routes && typeof input.routes === 'object' ? input.routes : {};
      if (!['completed','partial','not_yet','unclear'].includes(outcome)) throw Error('adaptive-route-outcome-invalid');
      if (!assessor) throw Error('adaptive-route-assessor-required');
      if (!evidence) throw Error('adaptive-route-evidence-required');
      const target = clean(routes[outcome]) || null;
      const fallback = clean(input.fallbackStepId) || null;
      return { version: VERSION, outcome, selectedStepId: target || fallback, routeType: target ? ({completed:'enrichment_or_next',partial:'guided_practice',not_yet:'remediation',unclear:'clarification'})[outcome] : 'fallback',
        reason: target ? 'اختير الفرع وفق نتيجة تقييم صريحة وشاهد موثق.' : 'لم يحدد فرع لهذه النتيجة؛ استُخدم المسار الاحتياطي.', assessedBy: assessor, evidence,
        requiresHostValidation: true, note: 'لا يحلل المحرك الاستجابة ولا يقرر النتيجة؛ يمرر نتيجة المقيم إلى وجهة محددة مسبقًا.' };
    }

    function planSpacedReviews(input) {
      input = input && typeof input === 'object' ? input : {};
      const start = new Date(clean(input.completedAt));
      if (!Number.isFinite(start.getTime())) throw Error('review-completed-date-invalid');
      const intervals = Array.isArray(input.intervalsDays) ? input.intervalsDays : [1,3,7,14,30];
      if (!intervals.length || intervals.length > 20 || intervals.some(x => !Number.isInteger(x) || x < 1 || x > 365)) throw Error('review-intervals-invalid');
      const unique = Array.from(new Set(intervals)).sort((a,b)=>a-b);
      return { version: VERSION, itemId: clean(input.itemId) || null, completedAt: start.toISOString(), reviews: unique.map(days => { const d = new Date(start); d.setUTCDate(d.getUTCDate()+days); return { afterDays: days, dueAt: d.toISOString(), status: 'scheduled' }; }),
        policy: 'suggested-schedule-not-learning-science-guarantee', note: 'الفواصل قابلة للتعديل من الأستاذ أو المضيف؛ الجدولة لا تثبت الاحتفاظ أو الإتقان.' };
    }

    function summarizeMasteryEvidence(input) {
      input = input && typeof input === 'object' ? input : {};
      const rows = Array.isArray(input.evidence) ? input.evidence : [];
      const levels = ['not_yet','emerging','developing','demonstrated'];
      const valid = rows.filter(x => x && levels.includes(clean(x.level)) && clean(x.assessedBy) && clean(x.evidence));
      const counts = levels.reduce((a,k)=>(a[k]=valid.filter(x=>x.level===k).length,a),{});
      const latest = valid.length ? valid[valid.length-1] : null;
      const value = latest ? levels.indexOf(latest.level) : null;
      return { version: VERSION, competencyId: clean(input.competencyId) || null, evidenceCount: valid.length, rejectedCount: rows.length-valid.length, counts,
        latestLevel: latest ? latest.level : 'not_assessed', numericTrend: valid.length>1 ? levels.indexOf(valid[valid.length-1].level)-levels.indexOf(valid[0].level) : null,
        status: !latest ? 'insufficient-evidence' : latest.level==='demonstrated' ? 'demonstrated-on-latest-evidence' : 'needs-follow-up', latestEvidence: latest ? { evidence: latest.evidence, assessedBy: latest.assessedBy, taskId: clean(latest.taskId)||null } : null,
        safeguards: ['غياب الشاهد يعني غير مقيم وليس غير متقن.','التلخيص لا يستبدل حكم الأستاذ ولا يثبت الإتقان العام من مهمة واحدة.'] };
    }

    function adaptInstructionalFormat(input) {
      input = input && typeof input === 'object' ? input : {};
      const preference = clean(input.preference).toLowerCase();
      const options = { concise:{format:'short-steps',guidance:'قسّم التعليمات إلى خطوات قصيرة، وقدم خطوة واحدة في كل مرة.'}, visual:{format:'visual-outline',guidance:'ادعم الشرح بمخطط أو جدول أو تمثيل بصري يقدمه المضيف.'}, audio:{format:'oral-sequence',guidance:'قدّم الشرح شفهيًا مع توقفات للتحقق من الفهم.'}, examples:{format:'worked-examples',guidance:'ابدأ بمثال محلول ثم مثال مشابه مع تقليل الدعم تدريجيًا.'}, mixed:{format:'multimodal',guidance:'اجمع بين شرح موجز ومثال وتمثيل بصري عند توفره.'} };
      if (!options[preference]) throw Error('instruction-format-preference-invalid');
      return { version: VERSION, learnerId: clean(input.learnerId)||null, preference, ...options[preference], selectedBy: clean(input.selectedBy)||'host', userControlled: true,
        note: 'هذا تكييف لشكل العرض بناءً على تفضيل مصرح به، وليس تشخيصًا لإعاقة أو حالة صحية.' };
    }

    function createMultilingualTeachingFrame(input) {
      input = input && typeof input === 'object' ? input : {};
      const primary = clean(input.primaryLanguage), support = Array.isArray(input.supportLanguages) ? input.supportLanguages.map(clean).filter(Boolean) : [];
      if (!primary) throw Error('teaching-frame-primary-language-required');
      const terms = Array.isArray(input.terms) ? input.terms.filter(x=>x&&clean(x.term)&&x.translations&&typeof x.translations==='object').map(x=>({term:clean(x.term),translations:Object.keys(x.translations).reduce((a,k)=>(a[k]=clean(x.translations[k]),a),{})})) : [];
      return { version: VERSION, primaryLanguage: primary, supportLanguages: Array.from(new Set(support)).filter(x=>x!==primary), subject: clean(input.subject)||null,
        keyTerms: terms, instruction: 'قدّم المفهوم باللغة الأساسية، ثم استخدم الترجمات المعتمدة من المضيف لدعم المقارنة، واطلب من المتعلم إعادة صياغة الفكرة.',
        translationSource: 'host-supplied-only', note: 'لا ينشئ المحرك ترجمات تلقائية ولا يضمن دقتها؛ راجع المصطلحات المتخصصة قبل استخدامها.' };
    }

    function createTeacherObservationChecklist(input) {
      input = input && typeof input === 'object' ? input : {};
      const criteria = Array.isArray(input.criteria) ? input.criteria : [];
      if (!criteria.length || criteria.length>30) throw Error('observation-criteria-required');
      const seen = new Set();
      const items = criteria.map(x=>{ const id=clean(x&&x.id), label=clean(x&&x.label); if(!id||!label||seen.has(id)) throw Error('observation-criterion-invalid'); seen.add(id); return {id,label,indicator:clean(x.indicator)||null, status:'not_observed', note:null}; });
      return { version: VERSION, lessonId: clean(input.lessonId)||null, observer: clean(input.observer)||null, stage: clean(input.stage)||null, subject: clean(input.subject)||null,
        items, statuses:['not_observed','observed','partially_observed','not_applicable'], policy:'descriptive-observation-not-teacher-ranking' };
    }

    function formCollaborativeGroups(input) {
      input = input && typeof input === 'object' ? input : {};
      const learners = Array.isArray(input.learners) ? input.learners : [], size = Number(input.groupSize);
      if (!learners.length || learners.length>200 || !Number.isInteger(size) || size<2 || size>20) throw Error('collaborative-group-input-invalid');
      const ids = new Set(); learners.forEach(x=>{if(!x||!clean(x.id)||ids.has(clean(x.id))) throw Error('collaborative-learner-id-invalid'); ids.add(clean(x.id));});
      const sorted = learners.slice().sort((a,b)=>(Number(b.readiness)||0)-(Number(a.readiness)||0));
      const count = Math.ceil(sorted.length/size), groups = Array.from({length:count},(_,i)=>({id:'group-'+(i+1),members:[]}));
      sorted.forEach((learner,i)=>{ const round=Math.floor(i/count), col=i%count, index=round%2===0?col:count-1-col; groups[index].members.push({id:clean(learner.id),role:null}); });
      const roles = ['منسق','موثق','عارض','مراجع']; groups.forEach(g=>g.members.forEach((m,i)=>{m.role=roles[i%roles.length];}));
      return { version: VERSION, groups, learnerCount: learners.length, groupCount: groups.length, method:'snake-distribution-by-host-supplied-readiness', note:'المستوى المدخل يحدده المضيف؛ راجع التوزيع والسياق الاجتماعي قبل اعتماده، ولا تستخدمه لتصنيف ثابت للمتعلمين.' };
    }

    function createFamilyProgressReport(input) {
      input = input && typeof input === 'object' ? input : {};
      const evidence = Array.isArray(input.evidence) ? input.evidence.filter(x=>x&&clean(x.description)) : [];
      const strengths = Array.isArray(input.strengths) ? input.strengths.map(clean).filter(Boolean) : [];
      const nextSteps = Array.isArray(input.nextSteps) ? input.nextSteps.map(clean).filter(Boolean) : [];
      if (!clean(input.period) || !clean(input.subject)) throw Error('family-report-context-required');
      return { version: VERSION, learnerLabel: clean(input.learnerLabel)||'المتعلم', period:clean(input.period), subject:clean(input.subject),
        summary:clean(input.summary)||'لا توجد خلاصة وصفية مدخلة.', strengths, evidence:evidence.map(x=>({description:clean(x.description),date:clean(x.date)||null,source:clean(x.source)||null})),
        nextSteps, familySupport:clean(input.familySupport)||'خصص وقتًا قصيرًا للمراجعة وشجع المتعلم على شرح ما تعلمه.',
        preparedBy:clean(input.preparedBy)||null, privacy:'host-controlled-sharing', note:'التقرير لا يستنتج مستوى المتعلم؛ يعتمد فقط على المعلومات التي أدخلها الأستاذ أو المضيف.' };
    }

    function matchLearningResources(input) {
      input = input && typeof input === 'object' ? input : {};
      const resources = Array.isArray(input.resources) ? input.resources : [];
      const wanted = {stage:clean(input.stage),subject:clean(input.subject),language:clean(input.language),difficulty:clean(input.difficulty)};
      const scored = resources.filter(r=>r&&clean(r.id)&&clean(r.title)).map(r=>{ let score=0, reasons=[]; ['stage','subject','language','difficulty'].forEach(k=>{if(wanted[k]&&clean(r[k])){if(clean(r[k]).toLowerCase()===wanted[k].toLowerCase()){score+=2;reasons.push(k+'-match');}else score-=1;}}); return {resource:{id:clean(r.id),title:clean(r.title),type:clean(r.type)||null,uri:clean(r.uri)||null},score,reasons}; }).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
      return { version: VERSION, results:scored.slice(0,Math.max(1,Math.min(50,Number(input.limit)||10))), totalCandidates:resources.length,
        method:'metadata-filter-and-rank', note:'المطابقة لا تفحص محتوى المورد أو صحته أو حقوقه؛ تحقق منها قبل تقديمها للمتعلمين.' };
    }

    // A compact formative-assessment cycle for any subject family. All judgments
    // are supplied explicitly by the host/teacher; this engine does not grade semantics.
    const formativeOutcomes = ['demonstrated', 'partial', 'not_yet', 'unclear'];
    function createFormativeAssessmentCycle(input) {
      input = input && typeof input === 'object' ? input : {};
      const topic = clean(input.topic), subject = clean(input.subject), objective = clean(input.objective);
      const id = clean(input.id);
      if (!topic) throw Error('formative-topic-required');
      if (!subject) throw Error('formative-subject-required');
      if (!objective) throw Error('formative-objective-required');
      if (!id) throw Error('formative-cycle-id-required');
      const stage = stageKey(input.stage || input.grade) || null;
      const family = familyKey(subject), moves = familyMoves[family];
      const prompts = {
        mathematics: 'ما التقدير أو الخاصية التي تتوقعها؟ وضّح كيف تتحقق من إجابتك.',
        sciences: 'ما الملاحظة أو المعطى الذي يدعم تفسيرك؟ ميّز بين الدليل والاستنتاج.',
        languages: 'أنشئ مثالًا جديدًا يحقق الهدف، ثم اشرح اختيارك اللغوي أو التواصلي.',
        humanities: 'ما الشاهد الذي يسند موقفك؟ قارن بين تفسيرين محتملين.',
        technology: 'كيف تختبر الحل عمليًا؟ وما المؤشر الذي يثبت أنه يحقق الحاجة؟',
        arts: 'اعرض اختيارًا فنيًا واحدًا واشرح أثره في العمل وفق معيار معلن.',
        general: 'قدّم تطبيقًا جديدًا للهدف واشرح ما الذي يجعله مناسبًا.'
      };
      const cycle = {
        version: VERSION, cycleType: 'explicit-evidence-formative-cycle', id, topic, subject,
        subjectFamily: family, stage, objective, status: 'awaiting_assessment', outcome: null,
        phases: [
          { id: 'diagnostic', kind: 'diagnostic', prompt: 'ما الذي تعرفه مسبقًا ويمكن أن يساعدك في فهم: ' + topic + '؟', purpose: 'تحديد نقطة الانطلاق دون إصدار حكم نهائي.' },
          { id: 'learning_evidence', kind: 'evidence', prompt: prompts[family], purpose: 'جمع شاهد ظاهر مرتبط بالهدف: ' + objective },
          { id: 'feedback', kind: 'feedback', prompt: 'اذكر جانبًا ناجحًا واحدًا وخطوة واحدة قابلة للتنفيذ لتحسين الأداء.', purpose: 'تغذية راجعة محددة وقابلة للتطبيق.' },
          { id: 'next_step', kind: 'next_step', prompt: 'أعد المحاولة أو طبّق التعلم في وضعية جديدة بحسب الشاهد والتقييم.', purpose: 'اختيار خطوة تالية ملائمة.' }
        ],
        teachingMoves: moves.slice(), assessment: null,
        note: 'الدورة إطار للتقويم التكويني؛ لا تصحح الإجابة أو تستنتج مستوى المتعلم تلقائيًا.'
      };
      return cycle;
    }
    function completeFormativeAssessmentCycle(cycle, input) {
      if (!cycle || cycle.cycleType !== 'explicit-evidence-formative-cycle' || !Array.isArray(cycle.phases)) throw Error('invalid-formative-cycle');
      input = input && typeof input === 'object' ? input : {};
      const outcome = clean(input.outcome);
      if (!formativeOutcomes.includes(outcome)) throw Error('formative-outcome-invalid');
      const evidence = clean(input.evidence);
      const assessor = clean(input.assessor);
      if (!evidence) throw Error('formative-evidence-required');
      if (!assessor) throw Error('formative-assessor-required');
      const feedback = clean(input.feedback);
      const nextAction = outcome === 'demonstrated' ? 'transfer' : outcome === 'partial' ? 'guided_practice' : outcome === 'not_yet' ? 'prerequisite_support' : 'clarify_and_collect_more_evidence';
      const status = outcome === 'demonstrated' ? 'ready_for_transfer' : outcome === 'partial' ? 'needs_guided_practice' : outcome === 'not_yet' ? 'needs_prerequisite_support' : 'awaiting_clarification';
      return Object.assign({}, cycle, { status, outcome, assessment: {
        evidence, assessor, feedback: feedback || null, assessedAt: clean(input.assessedAt) || null,
        nextAction, nextActionReason: outcome === 'demonstrated' ? 'شاهد صريح يشير إلى تحقق الهدف؛ اقترح مهمة نقل للتحقق في سياق جديد.' : outcome === 'partial' ? 'الشاهد جزئي؛ اقترح ممارسة موجهة ثم أعد التقويم.' : outcome === 'not_yet' ? 'الشاهد لا يثبت تحقق الهدف؛ افحص المتطلبات السابقة وقدّم دعمًا مناسبًا.' : 'المعطيات غير كافية للحكم؛ وضّح المطلوب واجمع شاهدًا إضافيًا.'
      }, note: 'النتيجة والخطوة التالية مبنيتان على تقييم صريح أدخله الأستاذ أو النظام المضيف، وليستا تصحيحًا دلاليًا آليًا.' });
    }

    // Teacher-authored assessment blueprint: validates alignment and coverage,
    // but does not generate questions or infer official curriculum requirements.
    const assessmentCognitiveLevels = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
    const assessmentDifficulties = ['introductory', 'moderate', 'challenging'];
    function prepareAssessmentBlueprint(input) {
      input = input && typeof input === 'object' ? input : {};
      const outcomes = Array.isArray(input.outcomes) ? input.outcomes : [];
      const items = Array.isArray(input.items) ? input.items : [];
      return {
        id: clean(input.id), subject: clean(input.subject), stage: stageKey(input.stage || input.grade) || null,
        term: clean(input.term) || null, durationMinutes: Number(input.durationMinutes), totalPoints: Number(input.totalPoints),
        outcomes: outcomes.map(o => ({ id: clean(o && o.id), description: clean(o && o.description), weight: Number(o && o.weight) })),
        items: items.map(q => ({ id: clean(q && q.id), outcomeId: clean(q && q.outcomeId), type: clean(q && q.type),
          cognitiveLevel: clean(q && q.cognitiveLevel), difficulty: clean(q && q.difficulty), points: Number(q && q.points), prompt: clean(q && q.prompt) || null })),
        author: clean(input.author) || null
      };
    }
    function validateAssessmentBlueprint(input) {
      const b = prepareAssessmentBlueprint(input), errors = [], warnings = [];
      if (!b.id) errors.push('assessment-blueprint-id-required');
      if (!b.subject) errors.push('assessment-blueprint-subject-required');
      if (!b.stage) errors.push('assessment-blueprint-stage-invalid');
      if (!Number.isInteger(b.durationMinutes) || b.durationMinutes < 1 || b.durationMinutes > 600) errors.push('assessment-blueprint-duration-invalid');
      if (!Number.isFinite(b.totalPoints) || b.totalPoints <= 0) errors.push('assessment-blueprint-total-points-invalid');
      if (!b.outcomes.length) errors.push('assessment-blueprint-outcomes-required');
      if (!b.items.length) errors.push('assessment-blueprint-items-required');
      const outcomeIds = new Set();
      b.outcomes.forEach(o => {
        if (!o.id || !o.description || outcomeIds.has(o.id)) errors.push('assessment-blueprint-outcome-invalid:' + (o.id || 'missing-id'));
        outcomeIds.add(o.id);
        if (!Number.isFinite(o.weight) || o.weight <= 0 || o.weight > 100) errors.push('assessment-blueprint-outcome-weight-invalid:' + (o.id || 'unknown'));
      });
      const sumWeights = b.outcomes.reduce((n, o) => n + (Number.isFinite(o.weight) ? o.weight : 0), 0);
      if (b.outcomes.length && Math.abs(sumWeights - 100) > 0.01) errors.push('assessment-blueprint-outcome-weights-must-total-100');
      const itemIds = new Set(), seenOutcomes = new Set();
      b.items.forEach(q => {
        if (!q.id || itemIds.has(q.id)) errors.push('assessment-blueprint-item-id-invalid:' + (q.id || 'missing-id'));
        itemIds.add(q.id);
        if (!outcomeIds.has(q.outcomeId)) errors.push('assessment-blueprint-item-outcome-unknown:' + (q.id || 'unknown'));
        else seenOutcomes.add(q.outcomeId);
        if (!q.type) errors.push('assessment-blueprint-item-type-required:' + (q.id || 'unknown'));
        if (!assessmentCognitiveLevels.includes(q.cognitiveLevel)) errors.push('assessment-blueprint-cognitive-level-invalid:' + (q.id || 'unknown'));
        if (!assessmentDifficulties.includes(q.difficulty)) errors.push('assessment-blueprint-difficulty-invalid:' + (q.id || 'unknown'));
        if (!Number.isFinite(q.points) || q.points <= 0) errors.push('assessment-blueprint-item-points-invalid:' + (q.id || 'unknown'));
      });
      b.outcomes.forEach(o => { if (o.id && !seenOutcomes.has(o.id)) warnings.push('assessment-outcome-not-covered:' + o.id); });
      const allocated = b.items.reduce((n, q) => n + (Number.isFinite(q.points) && q.points > 0 ? q.points : 0), 0);
      if (Number.isFinite(b.totalPoints) && Math.abs(allocated - b.totalPoints) > 0.01) errors.push('assessment-blueprint-points-do-not-match-total');
      const valid = errors.length === 0;
      return { version: VERSION, valid, errors, warnings, allocatedPoints: allocated, totalPoints: b.totalPoints,
        coveredOutcomes: seenOutcomes.size, outcomeCount: b.outcomes.length,
        blueprint: valid ? Object.assign({ blueprintType: 'teacher-authored-outcome-aligned-assessment' }, b) : null,
        policy: 'teacher-authored-content-and-outcomes; explicit-alignment-validation; no-question-generation-or-official-curriculum-inference' };
    }
    function createAssessmentBlueprint(input) {
      const checked = validateAssessmentBlueprint(input);
      if (!checked.valid) throw Error('assessment-blueprint-invalid:' + checked.errors.join('|'));
      return Object.assign({ status: 'draft', createdAt: clean(input && input.createdAt) || null }, checked.blueprint,
        { validation: { valid: true, warnings: checked.warnings, allocatedPoints: checked.allocatedPoints },
          note: 'مخطط تقويم من إعداد الأستاذ؛ صحة مواءمة الأهداف مع المنهاج الرسمي ومحتوى الأسئلة مسؤولية الجهة التربوية.' });
    }
    function summarizeAssessmentBlueprint(blueprint) {
      if (!blueprint || blueprint.blueprintType !== 'teacher-authored-outcome-aligned-assessment' || !Array.isArray(blueprint.items) || !Array.isArray(blueprint.outcomes)) throw Error('invalid-assessment-blueprint');
      const sumBy = key => blueprint.items.reduce((acc, q) => { const k = q[key] || 'unspecified'; acc[k] = (acc[k] || 0) + q.points; return acc; }, {});
      const pointsByOutcome = blueprint.outcomes.map(o => ({ id: o.id, description: o.description, targetWeight: o.weight,
        allocatedPoints: blueprint.items.filter(q => q.outcomeId === o.id).reduce((n, q) => n + q.points, 0) }));
      return { version: VERSION, id: blueprint.id, subject: blueprint.subject, stage: blueprint.stage,
        itemCount: blueprint.items.length, totalPoints: blueprint.totalPoints, durationMinutes: blueprint.durationMinutes,
        pointsByOutcome, pointsByCognitiveLevel: sumBy('cognitiveLevel'), pointsByDifficulty: sumBy('difficulty'), pointsByType: sumBy('type'),
        coveragePercent: blueprint.outcomes.length ? Math.round(pointsByOutcome.filter(x => x.allocatedPoints > 0).length / blueprint.outcomes.length * 100) : 0,
        safeguards: ['توزيع النقاط لا يثبت جودة السؤال أو صدقه.', 'لا يتحقق المحرك من مطابقة الأهداف للتدرجات الرسمية.', 'يجب مراجعة الأسئلة وملاءمتها للطور والزمن من الأستاذ قبل اعتماد الاختبار.'] };
    }

    // Builds a curriculum-traceable assessment skeleton from explicitly supplied progression data.
    // It allocates task slots; it does not invent question text or claim official curriculum verification.
    const assessmentSourceTypes = ['official_document', 'teacher_authored', 'connected_database', 'platform_suggestion'];
    function prepareCurriculumAssessmentPlan(input) {
      input = input && typeof input === 'object' ? input : {};
      const progression = input.progression && typeof input.progression === 'object' ? input.progression : {};
      const outcomes = Array.isArray(input.outcomes) ? input.outcomes : [];
      return {
        id: clean(input.id), country: clean(input.country || 'DZ'), academicYear: clean(input.academicYear) || null,
        subject: clean(input.subject), stage: stageKey(input.stage || input.grade) || null, grade: clean(input.grade),
        term: clean(input.term), durationMinutes: Number(input.durationMinutes), totalPoints: Number(input.totalPoints),
        competency: clean(input.competency), curriculumReference: clean(input.curriculumReference) || null,
        progression: { sourceType: clean(progression.sourceType), sourceTitle: clean(progression.sourceTitle) || null,
          sourceReference: clean(progression.sourceReference) || null, lessons: (Array.isArray(progression.lessons) ? progression.lessons : []).map(clean).filter(Boolean),
          topics: (Array.isArray(progression.topics) ? progression.topics : []).map(clean).filter(Boolean),
          verificationClaim: progression.verified === true ? 'user_asserted_verified' : 'not_verified' },
        outcomes: outcomes.map(o => ({ id: clean(o && o.id), description: clean(o && o.description), lesson: clean(o && o.lesson),
          weight: Number(o && o.weight), cognitiveTargets: (Array.isArray(o && o.cognitiveTargets) ? o.cognitiveTargets : []).map(clean).filter(x => assessmentCognitiveLevels.includes(x)) })),
        taskCount: Number(input.taskCount), taskTypes: (Array.isArray(input.taskTypes) ? input.taskTypes : ['short_answer', 'application', 'problem_situation']).map(clean).filter(Boolean),
        author: clean(input.author) || null
      };
    }
    function validateCurriculumAssessmentPlan(input) {
      const p = prepareCurriculumAssessmentPlan(input), errors = [], warnings = [];
      if (!p.id) errors.push('curriculum-assessment-id-required');
      if (p.country !== 'DZ') errors.push('curriculum-assessment-country-must-be-DZ');
      if (!p.subject) errors.push('curriculum-assessment-subject-required');
      if (!p.stage) errors.push('curriculum-assessment-stage-invalid');
      if (!p.grade) errors.push('curriculum-assessment-grade-required');
      if (!p.term) errors.push('curriculum-assessment-term-required');
      if (!p.competency) errors.push('curriculum-assessment-competency-required');
      if (!Number.isInteger(p.durationMinutes) || p.durationMinutes < 1 || p.durationMinutes > 600) errors.push('curriculum-assessment-duration-invalid');
      if (!Number.isFinite(p.totalPoints) || p.totalPoints <= 0) errors.push('curriculum-assessment-total-points-invalid');
      if (!Number.isInteger(p.taskCount) || p.taskCount < 1 || p.taskCount > 40) errors.push('curriculum-assessment-task-count-invalid');
      if (!assessmentSourceTypes.includes(p.progression.sourceType)) errors.push('curriculum-assessment-progression-source-invalid');
      if (!p.progression.lessons.length) errors.push('curriculum-assessment-progression-lessons-required');
      if (!p.outcomes.length) errors.push('curriculum-assessment-outcomes-required');
      if (!p.taskTypes.length) errors.push('curriculum-assessment-task-types-required');
      const lessonSet = new Set(p.progression.lessons), outcomeIds = new Set();
      p.outcomes.forEach(o => {
        if (!o.id || outcomeIds.has(o.id) || !o.description || !o.lesson) errors.push('curriculum-assessment-outcome-invalid:' + (o.id || 'missing-id'));
        outcomeIds.add(o.id);
        if (o.lesson && !lessonSet.has(o.lesson)) errors.push('curriculum-assessment-outcome-lesson-not-in-progression:' + (o.id || 'unknown'));
        if (!Number.isFinite(o.weight) || o.weight <= 0 || o.weight > 100) errors.push('curriculum-assessment-outcome-weight-invalid:' + (o.id || 'unknown'));
      });
      const totalWeight = p.outcomes.reduce((n, o) => n + (Number.isFinite(o.weight) ? o.weight : 0), 0);
      if (p.outcomes.length && Math.abs(totalWeight - 100) > 0.01) errors.push('curriculum-assessment-outcome-weights-must-total-100');
      if (p.progression.sourceType === 'platform_suggestion') warnings.push('curriculum-progression-is-platform-suggestion-not-official-sequence');
      if (p.progression.verificationClaim === 'not_verified') warnings.push('curriculum-progression-not-verified-against-ministry-source');
      if (!p.curriculumReference) warnings.push('curriculum-reference-not-supplied');
      const valid = errors.length === 0;
      return { version: VERSION, valid, errors, warnings, totalOutcomeWeight: totalWeight,
        plan: valid ? Object.assign({ planType: 'dz-curriculum-traceable-assessment-skeleton' }, p) : null,
        policy: 'uses-explicitly-supplied-progression-and-outcomes; user-asserted-source-status-is-not-independent-verification; no-question-text-generation' };
    }
    function createCurriculumAssessmentPlan(input) {
      const checked = validateCurriculumAssessmentPlan(input);
      if (!checked.valid) throw Error('curriculum-assessment-plan-invalid:' + checked.errors.join('|'));
      const p = checked.plan, slots = [], counts = p.outcomes.map(o => ({ outcome: o, count: 0, remainder: 0 }));
      // Largest-remainder allocation guarantees exactly taskCount slots.
      counts.forEach(x => { const exact = p.taskCount * x.outcome.weight / 100; x.count = Math.floor(exact); x.remainder = exact - x.count; });
      let remaining = p.taskCount - counts.reduce((n, x) => n + x.count, 0);
      counts.slice().sort((a, b) => b.remainder - a.remainder || a.outcome.id.localeCompare(b.outcome.id)).slice(0, remaining).forEach(x => x.count++);
      let index = 0;
      counts.forEach(x => { for (let i = 0; i < x.count; i++) {
        const cognitive = x.outcome.cognitiveTargets.length ? x.outcome.cognitiveTargets[i % x.outcome.cognitiveTargets.length] : assessmentCognitiveLevels[Math.min(5, Math.floor(index * 6 / p.taskCount))];
        const difficulty = index < Math.ceil(p.taskCount / 3) ? 'introductory' : index < Math.ceil(2 * p.taskCount / 3) ? 'moderate' : 'challenging';
        slots.push({ id: 'task-' + (index + 1), outcomeId: x.outcome.id, lesson: x.outcome.lesson,
          type: p.taskTypes[index % p.taskTypes.length], cognitiveLevel: cognitive, difficulty,
          points: Math.round((p.totalPoints / p.taskCount) * 100) / 100,
          prompt: null, contentStatus: 'awaiting-teacher-or-connected-database-content' }); index++;
      }});
      // Correct rounding drift on the final slot so allocated points equal the requested total.
      const allocated = slots.reduce((n, x) => n + x.points, 0);
      slots[slots.length - 1].points = Math.round((slots[slots.length - 1].points + p.totalPoints - allocated) * 100) / 100;
      return { version: VERSION, status: 'draft', planType: 'dz-curriculum-traceable-assessment-skeleton', id: p.id,
        country: p.country, academicYear: p.academicYear, subject: p.subject, stage: p.stage, grade: p.grade, term: p.term,
        durationMinutes: p.durationMinutes, totalPoints: p.totalPoints, competency: p.competency,
        curriculumReference: p.curriculumReference, progression: p.progression, outcomes: p.outcomes, items: slots,
        validation: { valid: true, warnings: checked.warnings }, createdAt: clean(input && input.createdAt) || null,
        note: 'هذه بنية أولية للاختبار موزعة على الدروس والكفاءات المدخلة؛ نصوص الأسئلة غير مولدة. عند ربط قاعدة البيانات يمكن استرجاع تمارين ومحتوى مطابقين ثم يراجع الأستاذ الملاءمة والتدرج قبل الاعتماد.' };
    }
    function summarizeCurriculumAssessmentPlan(plan) {
      if (!plan || plan.planType !== 'dz-curriculum-traceable-assessment-skeleton' || !Array.isArray(plan.items)) throw Error('invalid-curriculum-assessment-plan');
      const byOutcome = plan.outcomes.map(o => ({ id: o.id, description: o.description, lesson: o.lesson,
        taskCount: plan.items.filter(x => x.outcomeId === o.id).length,
        points: Math.round(plan.items.filter(x => x.outcomeId === o.id).reduce((n, x) => n + x.points, 0) * 100) / 100 }));
      const byLevel = plan.items.reduce((a, x) => (a[x.cognitiveLevel] = (a[x.cognitiveLevel] || 0) + 1, a), {});
      return { version: VERSION, id: plan.id, subject: plan.subject, stage: plan.stage, grade: plan.grade, term: plan.term,
        taskCount: plan.items.length, totalPoints: plan.items.reduce((n, x) => n + x.points, 0), byOutcome, byCognitiveLevel: byLevel,
        contentReady: plan.items.filter(x => !!x.prompt).length, awaitingContent: plan.items.filter(x => !x.prompt).length,
        sourceType: plan.progression && plan.progression.sourceType, sourceVerification: plan.progression && plan.progression.verificationClaim,
        note: 'الملخص يصف توزيع البنية فقط؛ لا يثبت صحة المرجع أو جودة الأسئلة أو المطابقة الرسمية.' };
    }

    // Teacher-authored rubric configurable for Algerian school stages and all subjects.
    // Curriculum references are stored as supplied; no official alignment is inferred.
    const rubricLevels = Object.freeze([
      { key: 'not_yet', label: 'غير متحقق بعد', value: 0 },
      { key: 'developing', label: 'في طور الاكتساب', value: 1 },
      { key: 'proficient', label: 'متحكم', value: 2 },
      { key: 'advanced', label: 'متحكم بتميز', value: 3 }
    ]);
    const rubricEvaluatorRoles = ['teacher', 'self', 'peer'];
    function prepareAssessmentRubric(input) {
      input = input && typeof input === 'object' ? input : {};
      return {
        id: clean(input.id), title: clean(input.title), subject: clean(input.subject),
        stage: stageKey(input.stage || input.grade) || null, grade: clean(input.grade) || null,
        term: clean(input.term) || null, domain: clean(input.domain) || null,
        competency: clean(input.competency) || null, learningOutcome: clean(input.learningOutcome) || null,
        curriculumReference: clean(input.curriculumReference) || null,
        curriculumSource: clean(input.curriculumSource) || null,
        criteria: (Array.isArray(input.criteria) ? input.criteria : []).map(c => ({
          id: clean(c && c.id), label: clean(c && c.label), description: clean(c && c.description),
          indicators: (Array.isArray(c && c.indicators) ? c.indicators : []).map(clean).filter(Boolean),
          weight: Number(c && c.weight)
        })), author: clean(input.author) || null
      };
    }
    function validateAssessmentRubric(input) {
      const rubric = prepareAssessmentRubric(input), errors = [], ids = new Set();
      if (!rubric.id) errors.push('assessment-rubric-id-required');
      if (!rubric.title) errors.push('assessment-rubric-title-required');
      if (!rubric.subject) errors.push('assessment-rubric-subject-required');
      if (!rubric.stage) errors.push('assessment-rubric-stage-invalid');
      if (!rubric.criteria.length) errors.push('assessment-rubric-criteria-required');
      rubric.criteria.forEach(c => {
        if (!c.id || ids.has(c.id) || !c.label || !c.description || !c.indicators.length) errors.push('assessment-rubric-criterion-invalid:' + (c.id || 'missing-id'));
        ids.add(c.id);
        if (!Number.isFinite(c.weight) || c.weight <= 0 || c.weight > 100) errors.push('assessment-rubric-criterion-weight-invalid:' + (c.id || 'unknown'));
      });
      const weight = rubric.criteria.reduce((n, c) => n + (Number.isFinite(c.weight) ? c.weight : 0), 0);
      if (rubric.criteria.length && Math.abs(weight - 100) > 0.01) errors.push('assessment-rubric-weights-must-total-100');
      return { version: VERSION, valid: errors.length === 0, errors, totalWeight: weight,
        rubric: errors.length ? null : Object.assign({ rubricType: 'teacher-authored-curriculum-adaptable-rubric' }, rubric),
        policy: 'teacher-authored-criteria; curriculum-reference-is-verbatim-user-supplied; no-official-alignment-inference' };
    }
    function createAssessmentRubric(input) {
      const checked = validateAssessmentRubric(input);
      if (!checked.valid) throw Error('assessment-rubric-invalid:' + checked.errors.join('|'));
      return Object.assign({ status: 'draft', createdAt: clean(input && input.createdAt) || null }, checked.rubric,
        { levels: rubricLevels.map(x => Object.assign({}, x)),
          note: 'شبكة قابلة للتكييف مع المادة والطور والكفاءة؛ المرجع المنهاجي يدخله الأستاذ ولا يصادق المحرك على رسميته أو مطابقته.' });
    }
    function evaluateAssessmentRubric(rubric, input) {
      input = input && typeof input === 'object' ? input : {};
      if (!rubric || rubric.rubricType !== 'teacher-authored-curriculum-adaptable-rubric' || !Array.isArray(rubric.criteria)) throw Error('invalid-assessment-rubric');
      const role = clean(input.evaluatorRole);
      if (!rubricEvaluatorRoles.includes(role)) throw Error('assessment-rubric-evaluator-role-invalid');
      const ratings = input.ratings && typeof input.ratings === 'object' ? input.ratings : {};
      const criterionIds = new Set(rubric.criteria.map(c => c.id));
      Object.keys(ratings).forEach(id => { if (!criterionIds.has(id)) throw Error('assessment-rubric-rating-criterion-unknown:' + id); });
      const rows = [];
      rubric.criteria.forEach(c => {
        if (!Object.prototype.hasOwnProperty.call(ratings, c.id)) { rows.push({ criterionId: c.id, label: c.label, weight: c.weight, status: 'not_assessed', value: null, evidence: null }); return; }
        const rating = ratings[c.id] && typeof ratings[c.id] === 'object' ? ratings[c.id] : {};
        const level = rubricLevels.find(x => x.key === clean(rating.level));
        if (!level) throw Error('assessment-rubric-rating-level-invalid:' + c.id);
        const evidence = clean(rating.evidence);
        if (!evidence) throw Error('assessment-rubric-rating-evidence-required:' + c.id);
        rows.push({ criterionId: c.id, label: c.label, weight: c.weight, status: level.key, levelLabel: level.label, value: level.value, evidence });
      });
      const assessed = rows.filter(x => x.value !== null), assessedWeight = assessed.reduce((n, x) => n + x.weight, 0);
      const weightedLevel = assessedWeight ? assessed.reduce((n, x) => n + x.value * x.weight, 0) / assessedWeight : null;
      const score = weightedLevel === null ? null : Math.round(weightedLevel / 3 * 10000) / 100;
      return { version: VERSION, rubricId: rubric.id, subject: rubric.subject, stage: rubric.stage,
        competency: rubric.competency, learningOutcome: rubric.learningOutcome,
        evaluatorRole: role, evaluatorId: clean(input.evaluatorId) || null,
        official: role === 'teacher', assessedCriteria: assessed.length, totalCriteria: rows.length,
        coveragePercent: rows.length ? Math.round(assessed.length / rows.length * 100) : 0,
        assessedWeight, score, rows, unassessedCriteria: rows.filter(x => x.value === null).map(x => x.criterionId),
        assessedAt: clean(input.assessedAt) || null,
        note: role === 'teacher' ? 'تقييم الأستاذ وحده موسوم كتقييم رسمي داخل هذا السجل؛ لا يعني اعتمادًا وزاريًا.' : 'التقييم الذاتي أو تقييم الأقران وصفي وغير رسمي ولا يدمج مع تقييم الأستاذ.' };
    }
    function summarizeAssessmentRubricEvaluations(evaluations) {
      const rows = (Array.isArray(evaluations) ? evaluations : []).filter(x => x && x.version === VERSION && Array.isArray(x.rows));
      const byRole = {};
      rubricEvaluatorRoles.forEach(role => { const selected = rows.filter(x => x.evaluatorRole === role && x.score !== null); byRole[role] = {
        count: selected.length, meanScore: selected.length ? Math.round(selected.reduce((n, x) => n + x.score, 0) / selected.length * 100) / 100 : null
      }; });
      return { version: VERSION, totalEvaluations: rows.length,
        officialTeacherEvaluations: rows.filter(x => x.evaluatorRole === 'teacher' && x.official).length,
        byRole, note: 'تعرض النتائج حسب دور المقيم؛ لا تدمج التقييمات الذاتية وتقييمات الأقران في نتيجة الأستاذ.' };
    }

    function validateLearningPathwayPackage(input) {
      input = input && typeof input === 'object' ? input : {};
      const path = input.pathway, errors=[];
      if(!path||path.pathwayType!=='evidence-guided-personal-learning-pathway'||!Array.isArray(path.steps)) errors.push('pathway-package-invalid');
      else { const ids=new Set(); path.steps.forEach(s=>{if(!s||!clean(s.id)||ids.has(clean(s.id))) errors.push('pathway-package-step-id-invalid'); else ids.add(clean(s.id));});
        path.steps.forEach(s=>(Array.isArray(s.dependsOn)?s.dependsOn:[]).forEach(id=>{if(!ids.has(id)) errors.push('pathway-package-dependency-missing:'+id);}));
        if(!clean(path.subject)||!clean(path.goal)) errors.push('pathway-package-metadata-missing'); }
      const valid=errors.length===0;
      return { version:VERSION, valid, errors, package:valid?{format:'sm-learning-pathway',schemaVersion:1,exportedAt:clean(input.exportedAt)||null,pathway:JSON.parse(JSON.stringify(path))}:null,
        note:'التصدير نسخة بيانات محمولة فقط؛ لا يتصل بخادم ولا ينفذ مزامنة أو حفظًا تلقائيًا.' };
    }

    function summarizeCompetencyProgress(profile) {
      if (!profile || profile.profileType !== 'explicit-competency-evidence' || !Array.isArray(profile.competencies) || !Array.isArray(profile.evidence)) throw Error('invalid-competency-profile');
      const rows = profile.competencies.map(def => {
        const history = profile.evidence.filter(x => x && x.competencyId === def.id);
        const latest = history.length ? history[history.length - 1] : null;
        const first = history.length ? history[0] : null;
        const delta = first && latest ? latest.value - first.value : null;
        return { id: def.id, name: def.name, weight: def.weight, evidenceCount: history.length,
          latestLevel: latest ? latest.level : 'not_assessed', latestValue: latest ? latest.value : null,
          trend: delta == null ? 'insufficient-evidence' : delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'stable',
          changeFromFirst: delta, latestEvidence: latest ? { taskId: latest.taskId, evidence: latest.evidence, assessedBy: latest.assessedBy, recordedAt: latest.recordedAt } : null,
          history: history.map(x => ({ level: x.level, taskId: x.taskId, evidence: x.evidence, assessedBy: x.assessedBy, recordedAt: x.recordedAt })) };
      });
      const assessed = rows.filter(x => x.latestValue != null);
      const totalWeight = assessed.reduce((n, x) => n + x.weight, 0);
      const weighted = totalWeight ? assessed.reduce((n, x) => n + x.latestValue * x.weight, 0) / totalWeight : null;
      return { version: VERSION, stage: profile.stage, subject: profile.subject, subjectFamily: profile.subjectFamily,
        competencies: rows, assessedCompetencies: assessed.length, totalCompetencies: rows.length,
        coverage: Math.round(assessed.length / rows.length * 100), weightedLevel: weighted == null ? null : Math.round(weighted * 100) / 100,
        strengths: rows.filter(x => x.latestLevel === 'demonstrated').map(x => x.id),
        priorities: rows.filter(x => x.latestLevel === 'not_yet' || x.latestLevel === 'emerging').map(x => x.id),
        unassessed: rows.filter(x => x.latestLevel === 'not_assessed').map(x => x.id),
        safeguards: ['المستوى يعكس آخر تقييم موثق فقط ولا يمثل صفة ثابتة للمتعلم.', 'لا تحتسب الكفاءة غير المقيمة ضمن المتوسط.', 'المحرك لا يستنتج الكفاءة من نص أو منتج؛ يجب تمرير تقييم وشاهد صريحين.', 'تفسير المعايير وملاءمتها للمنهاج مسؤولية الأستاذ أو المضيف.'] };
    }
    // Curriculum resource registry adapter: validates and searches metadata supplied by
    // a teacher or a future connected library. It never fetches, stores, or invents content.
    const curriculumResourceTypes = ['textbook_lesson','exercise','worksheet','assessment','video_lesson','reference'];
    const curriculumReviewStates = ['pending','reviewed','approved','rejected'];
    function prepareCurriculumResource(input) {
      input = input && typeof input === 'object' ? input : {};
      const tags = v => Array.isArray(v) ? v.map(clean).filter(Boolean) : [];
      return { id: clean(input.id), country: clean(input.country || 'DZ').toUpperCase(),
        title: clean(input.title), resourceType: clean(input.resourceType), stage: clean(input.stage),
        grade: clean(input.grade), subject: clean(input.subject), term: clean(input.term),
        lesson: clean(input.lesson), competency: clean(input.competency), outcomeIds: tags(input.outcomeIds),
        keywords: tags(input.keywords), language: clean(input.language || 'ar'), difficulty: clean(input.difficulty),
        uri: clean(input.uri), sourceTitle: clean(input.sourceTitle), sourceType: clean(input.sourceType),
        curriculumReference: clean(input.curriculumReference), rightsBasis: clean(input.rightsBasis),
        review: { status: clean(input.review && input.review.status || 'pending'), reviewer: clean(input.review && input.review.reviewer), reviewedAt: clean(input.review && input.review.reviewedAt) } };
    }
    function validateCurriculumResource(input) {
      const r = prepareCurriculumResource(input), errors = [], warnings = [];
      if (!r.id) errors.push('curriculum-resource-id-required');
      if (r.country !== 'DZ') errors.push('curriculum-resource-country-must-be-DZ');
      if (!r.title) errors.push('curriculum-resource-title-required');
      if (!curriculumResourceTypes.includes(r.resourceType)) errors.push('curriculum-resource-type-invalid');
      if (!['ابتدائي','متوسط','ثانوي','primary','middle','secondary','all'].includes(r.stage)) errors.push('curriculum-resource-stage-invalid');
      if (!r.grade) errors.push('curriculum-resource-grade-required');
      if (!r.subject) errors.push('curriculum-resource-subject-required');
      if (!r.lesson && !r.competency && !r.keywords.length) errors.push('curriculum-resource-learning-link-required');
      if (r.uri && !/^https?:\/\//i.test(r.uri)) errors.push('curriculum-resource-uri-invalid');
      if (!curriculumReviewStates.includes(r.review.status)) errors.push('curriculum-resource-review-status-invalid');
      if (r.review.status === 'approved' && (!r.review.reviewer || !r.review.reviewedAt)) errors.push('curriculum-resource-approval-evidence-required');
      if (!r.curriculumReference) warnings.push('curriculum-reference-not-supplied');
      if (!r.sourceTitle || !r.sourceType) warnings.push('curriculum-resource-source-metadata-incomplete');
      if (!r.rightsBasis) warnings.push('curriculum-resource-rights-basis-not-recorded');
      if (r.review.status === 'pending') warnings.push('curriculum-resource-pending-human-review');
      return { version: VERSION, valid: errors.length === 0, errors, warnings, resource: errors.length ? null : r,
        eligibleForMatching: errors.length === 0 && ['reviewed','approved'].includes(r.review.status),
        policy: 'metadata-only; human review and rights verification required; no external fetch or content ingestion' };
    }
    function searchCurriculumResources(input) {
      input = input && typeof input === 'object' ? input : {};
      const resources = Array.isArray(input.resources) ? input.resources : [];
      const q = clean(input.query).toLowerCase();
      const filters = ['stage','grade','subject','term','lesson','competency','language','difficulty'];
      const wanted = {}; filters.forEach(k => wanted[k] = clean(input[k]).toLowerCase());
      const includePending = input.includePending === true;
      const accepted = [], rejected = [];
      resources.forEach((raw,index) => {
        const check = validateCurriculumResource(raw);
        if (!check.valid) { rejected.push({index,id:clean(raw&&raw.id)||null,errors:check.errors}); return; }
        const r = check.resource;
        if (!check.eligibleForMatching && !(includePending && r.review.status === 'pending')) return;
        let score = 0, reasons = [], mismatch = false;
        filters.forEach(k => { if (!wanted[k]) return; const actual = clean(r[k]).toLowerCase();
          if (actual === wanted[k] || (k === 'stage' && actual === 'all')) { score += k === 'stage' || k === 'grade' || k === 'subject' ? 4 : 2; reasons.push(k+'-match'); }
          else mismatch = true;
        });
        if (mismatch) return;
        if (q) { const haystack = [r.title,r.lesson,r.competency].concat(r.keywords).join(' ').toLowerCase();
          if (haystack.includes(q)) { score += 3; reasons.push('query-match'); }
          else if (!tokenize(q).some(t => tokenize(haystack).includes(t))) return;
          else { score += 1; reasons.push('query-token-match'); }
        }
        accepted.push({resource:{id:r.id,title:r.title,resourceType:r.resourceType,stage:r.stage,grade:r.grade,subject:r.subject,term:r.term,lesson:r.lesson,competency:r.competency,outcomeIds:r.outcomeIds.slice(),uri:r.uri,sourceTitle:r.sourceTitle,reviewStatus:r.review.status},score,reasons});
      });
      accepted.sort((a,b)=>b.score-a.score || a.resource.id.localeCompare(b.resource.id));
      return {version:VERSION,results:accepted.slice(0,Math.max(1,Math.min(50,Number(input.limit)||10))),totalMatched:accepted.length,
        rejected,filters:Object.fromEntries(filters.filter(k=>wanted[k]).map(k=>[k,wanted[k]])),
        note:'نتائج وصفية من بيانات الموارد المقدمة؛ لا يعني التطابق صحة المحتوى أو رسميته. الموارد المعلقة لا تظهر إلا بطلب صريح، ويجب مراجعة الحقوق والمصدر قبل الاستخدام.'};
    }
    function matchAssessmentPlanResources(plan, resources, options) {
      options = options && typeof options === 'object' ? options : {};
      if (!plan || plan.planType !== 'dz-curriculum-traceable-assessment-skeleton' || !Array.isArray(plan.items)) throw Error('invalid-curriculum-assessment-plan');
      const matches = plan.items.map(item => {
        const query = {resources,stage:plan.stage,grade:plan.grade,subject:plan.subject,term:plan.term,lesson:item.lesson,limit:options.limit||3};
        const result = searchCurriculumResources(query);
        const candidates = result.results.filter(x => !x.resource.outcomeIds || x.resource.outcomeIds.length === 0 || x.resource.outcomeIds.includes(item.outcomeId));
        return {itemId:item.id,outcomeId:item.outcomeId,lesson:item.lesson,candidates:candidates.map(x=>x.resource),status:candidates.length?'resources-found-needing-teacher-selection':'no-reviewed-resource-match'};
      });
      return {version:VERSION,planId:plan.id,matches,matchedItems:matches.filter(x=>x.candidates.length).length,
        unmatchedItems:matches.filter(x=>!x.candidates.length).map(x=>x.itemId),
        policy:'suggested references only; does not copy resource content into questions; teacher must select and verify suitability, source and usage rights'};
    }

    // Structured learning-content model. This normalizes educator/library-supplied
    // metadata; it does not extract or interpret textbook prose automatically.
    const learningContentReviewStates = ['pending','reviewed','approved','rejected'];
    function prepareLearningContentUnit(input) {
      input = input && typeof input === 'object' ? input : {};
      const list = (v, keys) => Array.isArray(v) ? v.map((x, i) => {
        if (typeof x === 'string') return { id: 'item-' + (i + 1), title: clean(x), description: '' };
        x = x && typeof x === 'object' ? x : {};
        const out = { id: clean(x.id) || 'item-' + (i + 1), title: clean(x.title || x.name || x.term || x.description), description: clean(x.description) };
        keys.forEach(k => { if (x[k] !== undefined) out[k] = clean(x[k]); });
        return out;
      }).filter(x => x.title) : [];
      const source = input.source && typeof input.source === 'object' ? input.source : {};
      const review = input.review && typeof input.review === 'object' ? input.review : {};
      return { id: clean(input.id), country: clean(input.country || 'DZ').toUpperCase(), stage: clean(input.stage),
        grade: clean(input.grade), term: clean(input.term), subject: clean(input.subject), lesson: clean(input.lesson || input.title),
        curriculumReference: clean(input.curriculumReference), chapter: clean(input.chapter), sequence: Number.isFinite(Number(input.sequence)) ? Number(input.sequence) : null,
        language: clean(input.language || 'ar'), concepts: list(input.concepts, ['definition','conceptType']),
        learningObjectives: list(input.learningObjectives, ['competencyId','domain']),
        prerequisites: list(input.prerequisites, ['competencyId']), vocabulary: list(input.vocabulary, ['meaning']),
        activities: list(input.activities, ['activityType','duration']), assessmentPrompts: list(input.assessmentPrompts, ['format','outcomeId']),
        source: { resourceId: clean(source.resourceId), title: clean(source.title), publisher: clean(source.publisher), edition: clean(source.edition), pageStart: Number.isFinite(Number(source.pageStart)) ? Number(source.pageStart) : null, pageEnd: Number.isFinite(Number(source.pageEnd)) ? Number(source.pageEnd) : null, uri: clean(source.uri) },
        review: { status: clean(review.status || 'pending'), reviewer: clean(review.reviewer), reviewedAt: clean(review.reviewedAt), note: clean(review.note) } };
    }
    function validateLearningContentUnit(input) {
      const u = prepareLearningContentUnit(input), errors = [], warnings = [];
      if (!u.id) errors.push('learning-content-id-required');
      if (u.country !== 'DZ') errors.push('learning-content-country-must-be-DZ');
      if (!['ابتدائي','متوسط','ثانوي','primary','middle','secondary','all'].includes(u.stage)) errors.push('learning-content-stage-invalid');
      if (!u.grade) errors.push('learning-content-grade-required');
      if (!u.subject) errors.push('learning-content-subject-required');
      if (!u.lesson) errors.push('learning-content-lesson-required');
      if (!u.learningObjectives.length) errors.push('learning-content-objective-required');
      if (!u.concepts.length) warnings.push('learning-content-concepts-not-recorded');
      if (!u.source.title && !u.source.resourceId) warnings.push('learning-content-source-not-linked');
      if (u.source.uri && !/^https?:\/\//i.test(u.source.uri)) errors.push('learning-content-source-uri-invalid');
      if (u.source.pageStart !== null && u.source.pageStart < 1) errors.push('learning-content-page-start-invalid');
      if (u.source.pageEnd !== null && (u.source.pageEnd < 1 || (u.source.pageStart !== null && u.source.pageEnd < u.source.pageStart))) errors.push('learning-content-page-range-invalid');
      if (!learningContentReviewStates.includes(u.review.status)) errors.push('learning-content-review-status-invalid');
      if (u.review.status === 'approved' && (!u.review.reviewer || !u.review.reviewedAt)) errors.push('learning-content-approval-evidence-required');
      const groups = ['concepts','learningObjectives','prerequisites','vocabulary','activities','assessmentPrompts'];
      groups.forEach(k => { const ids = u[k].map(x => x.id); if (new Set(ids).size !== ids.length) errors.push('learning-content-duplicate-' + k + '-id'); });
      if (!u.curriculumReference) warnings.push('learning-content-curriculum-reference-not-supplied');
      if (u.review.status === 'pending') warnings.push('learning-content-pending-human-review');
      return { version: VERSION, valid: errors.length === 0, errors, warnings, unit: errors.length ? null : u,
        eligibleForTeachingUse: errors.length === 0 && ['reviewed','approved'].includes(u.review.status),
        policy: 'structured teacher/library metadata only; source verification and pedagogical approval remain human responsibilities' };
    }
    function createLearningContentMap(input) {
      input = input && typeof input === 'object' ? input : {};
      const rows = Array.isArray(input.units) ? input.units : [], units = [], rejected = [], seen = new Set();
      rows.forEach((raw, index) => {
        const check = validateLearningContentUnit(raw), id = clean(raw && raw.id);
        if (!check.valid || seen.has(id)) { rejected.push({ index, id: id || null, errors: check.errors.concat(seen.has(id) ? ['learning-content-duplicate-unit-id'] : []) }); return; }
        seen.add(id); units.push(check.unit);
      });
      const approved = units.filter(x => ['reviewed','approved'].includes(x.review.status));
      return { version: VERSION, mapType: 'dz-curriculum-structured-learning-content', units, rejected,
        stats: { input: rows.length, accepted: units.length, rejected: rejected.length, readyForTeachingUse: approved.length,
          byStage: units.reduce((a,x) => (a[x.stage]=(a[x.stage]||0)+1,a), {}),
          bySubject: units.reduce((a,x) => (a[x.subject]=(a[x.subject]||0)+1,a), {}),
          objectives: units.reduce((n,x) => n+x.learningObjectives.length,0), concepts: units.reduce((n,x) => n+x.concepts.length,0) },
        limitations: ['لا يستخرج هذا الإصدار المفاهيم أو الأهداف من نصوص الكتب تلقائيًا؛ يجب أن تقدمها المكتبة أو الأستاذ في حقول منظمة.',
          'لا يثبت المرجع أو صحة المحتوى أو مطابقته الرسمية بمجرد تسجيله.',
          'الموارد غير المراجعة تبقى مسودات ولا تعد جاهزة للاستخدام التعليمي.'] };
    }
    function summarizeLearningContentMap(map) {
      const m = map && typeof map === 'object' ? map : {}, units = Array.isArray(m.units) ? m.units : [];
      const reviewed = units.filter(x => x && x.review && ['reviewed','approved'].includes(x.review.status));
      const countBy = key => units.reduce((a,x) => { const v = clean(x && x[key]) || 'غير محدد'; a[v]=(a[v]||0)+1; return a; }, {});
      return { version: VERSION, totalUnits: units.length, reviewedUnits: reviewed.length,
        pendingUnits: units.filter(x => x && x.review && x.review.status === 'pending').length,
        objectives: units.reduce((n,x) => n+(Array.isArray(x.learningObjectives)?x.learningObjectives.length:0),0),
        concepts: units.reduce((n,x) => n+(Array.isArray(x.concepts)?x.concepts.length:0),0),
        byStage: countBy('stage'), bySubject: countBy('subject'),
        readiness: units.length ? Math.round(reviewed.length/units.length*100) : 0,
        note: 'مؤشر الجاهزية يقيس حالة المراجعة المسجلة فقط، ولا يمثل قياسًا لجودة المحتوى أو اكتمال تغطية المنهاج.' };
    }

    // Host-assisted document import staging. Binary PDF/Word parsing is deliberately
    // delegated to the host; this layer validates extracted text and provenance.
    const curriculumImportFormats = ['pdf','doc','docx','txt','html','md','json'];
    const curriculumImportStates = ['metadata_only','text_extracted','extraction_failed'];
    const curriculumImportReviewStates = ['pending','approved','rejected'];
    function normalizeImportText(value) {
      return clean(value).normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/\s+/g,' ').trim().toLowerCase();
    }
    function importFingerprint(item) {
      const text = normalizeImportText(item.extractedText || '');
      const source = [item.format,item.title,item.publisher,item.edition,item.grade,item.subject,item.stage].map(normalizeImportText).join('|');
      const payload = text ? text : source;
      let hash = 2166136261;
      for (let i=0;i<payload.length;i++) { hash ^= payload.charCodeAt(i); hash = Math.imul(hash,16777619); }
      return 'fnv1a32-' + (hash>>>0).toString(16).padStart(8,'0') + '-' + payload.length;
    }
    function prepareCurriculumImport(input) {
      input = input && typeof input === 'object' ? input : {};
      const file = input.file && typeof input.file === 'object' ? input.file : {};
      const source = input.source && typeof input.source === 'object' ? input.source : {};
      const extraction = input.extraction && typeof input.extraction === 'object' ? input.extraction : {};
      const review = input.review && typeof input.review === 'object' ? input.review : {};
      const format = clean(input.format || file.format || (clean(file.name).split('.').pop() || '')).toLowerCase().replace(/^\./,'');
      const extractedText = clean(extraction.text || input.extractedText);
      const pages = Array.isArray(extraction.pages || input.pages) ? (extraction.pages || input.pages).map((x,i) => {
        x = x && typeof x === 'object' ? x : { text:x };
        return { page: Number(x.page || x.pageNumber || i+1), text: clean(x.text), section: clean(x.section) };
      }).filter(x => x.text) : [];
      const state = clean(extraction.status || input.extractionStatus || (extractedText || pages.length ? 'text_extracted' : 'metadata_only'));
      const item = { id:clean(input.id), file:{name:clean(file.name || input.fileName),format,sizeBytes:Number.isFinite(Number(file.sizeBytes || input.sizeBytes))?Number(file.sizeBytes || input.sizeBytes):null,mimeType:clean(file.mimeType)},
        title:clean(input.title || source.title || file.name), publisher:clean(input.publisher || source.publisher), edition:clean(input.edition || source.edition),
        stage:clean(input.stage), grade:clean(input.grade), subject:clean(input.subject), term:clean(input.term), language:clean(input.language || 'ar'),
        source:{resourceId:clean(source.resourceId),uri:clean(source.uri),rightsBasis:clean(source.rightsBasis),rightsNote:clean(source.rightsNote),pageStart:source.pageStart !== undefined && source.pageStart !== null && source.pageStart !== '' && Number.isFinite(Number(source.pageStart))?Number(source.pageStart):null,pageEnd:source.pageEnd !== undefined && source.pageEnd !== null && source.pageEnd !== '' && Number.isFinite(Number(source.pageEnd))?Number(source.pageEnd):null},
        extraction:{status:state,tool:clean(extraction.tool),version:clean(extraction.version),extractedAt:clean(extraction.extractedAt),error:clean(extraction.error)},
        extractedText,pages,review:{status:clean(review.status || 'pending'),reviewer:clean(review.reviewer),reviewedAt:clean(review.reviewedAt),note:clean(review.note)} };
      item.fingerprint = importFingerprint(item);
      return item;
    }
    function validateCurriculumImport(input) {
      const item = prepareCurriculumImport(input), errors=[], warnings=[];
      if (!item.id) errors.push('curriculum-import-id-required');
      if (!curriculumImportFormats.includes(item.file.format)) errors.push('curriculum-import-format-unsupported');
      if (!item.file.name) errors.push('curriculum-import-file-name-required');
      if (item.file.sizeBytes !== null && item.file.sizeBytes <= 0) errors.push('curriculum-import-file-size-invalid');
      if (!item.title) errors.push('curriculum-import-title-required');
      if (!['ابتدائي','متوسط','ثانوي','primary','middle','secondary','all'].includes(item.stage)) errors.push('curriculum-import-stage-invalid');
      if (!item.grade) errors.push('curriculum-import-grade-required');
      if (!item.subject) errors.push('curriculum-import-subject-required');
      if (!curriculumImportStates.includes(item.extraction.status)) errors.push('curriculum-import-extraction-status-invalid');
      if (item.extraction.status === 'text_extracted' && !item.extractedText && !item.pages.length) errors.push('curriculum-import-extracted-text-required');
      if (item.extraction.status === 'extraction_failed' && !item.extraction.error) warnings.push('curriculum-import-extraction-error-not-described');
      if (item.extraction.status === 'metadata_only') warnings.push('curriculum-import-metadata-only-not-searchable');
      if (item.source.uri && !/^https?:\/\//i.test(item.source.uri)) errors.push('curriculum-import-source-uri-invalid');
      if (!item.source.rightsBasis) warnings.push('curriculum-import-rights-basis-not-recorded');
      if (item.source.pageStart !== null && item.source.pageStart < 1) errors.push('curriculum-import-page-start-invalid');
      if (item.source.pageEnd !== null && (item.source.pageEnd < 1 || (item.source.pageStart !== null && item.source.pageEnd < item.source.pageStart))) errors.push('curriculum-import-page-range-invalid');
      item.pages.forEach(x => { if (!Number.isInteger(x.page) || x.page < 1) errors.push('curriculum-import-extracted-page-number-invalid'); });
      if (!curriculumImportReviewStates.includes(item.review.status)) errors.push('curriculum-import-review-status-invalid');
      if (item.review.status === 'approved' && (!item.review.reviewer || !item.review.reviewedAt)) errors.push('curriculum-import-approval-evidence-required');
      if (item.review.status === 'approved' && (item.extraction.status !== 'text_extracted' || (!item.extractedText && !item.pages.length))) errors.push('curriculum-import-content-required-before-approval');
      if (item.review.status === 'pending') warnings.push('curriculum-import-pending-human-review');
      return {version:VERSION,valid:errors.length===0,errors,warnings,item:errors.length?null:item,eligibleForTeachingUse:errors.length===0 && item.review.status==='approved' && item.extraction.status==='text_extracted' && !!(item.extractedText || item.pages.length), searchable:errors.length===0 && item.extraction.status==='text_extracted' && !!(item.extractedText || item.pages.length)};
    }
    function buildCurriculumImportBatch(input) {
      input = input && typeof input === 'object' ? input : {};
      const rows = Array.isArray(input.items) ? input.items : [], items=[], rejected=[], fingerprints=new Map(), ids=new Set();
      rows.forEach((raw,index) => {
        const item=prepareCurriculumImport(raw), check=validateCurriculumImport(item), duplicateId=ids.has(item.id), duplicateFingerprint=fingerprints.has(item.fingerprint);
        if (!check.valid || duplicateId || duplicateFingerprint) {
          const errors=check.errors.slice();
          if (duplicateId) errors.push('curriculum-import-duplicate-id');
          if (duplicateFingerprint) errors.push('curriculum-import-possible-duplicate-content');
          rejected.push({index,id:item.id||null,fingerprint:item.fingerprint,duplicateOf:duplicateFingerprint?fingerprints.get(item.fingerprint):null,errors}); return;
        }
        ids.add(item.id); fingerprints.set(item.fingerprint,item.id); items.push(item);
      });
      const ready=items.filter(x=>validateCurriculumImport(x).eligibleForTeachingUse).length;
      return {version:VERSION,batchType:'dz-curriculum-document-import-staging',items,rejected,stats:{input:rows.length,accepted:items.length,rejected:rejected.length,extracted:items.filter(x=>x.extraction.status==='text_extracted').length,metadataOnly:items.filter(x=>x.extraction.status==='metadata_only').length,extractionFailed:items.filter(x=>x.extraction.status==='extraction_failed').length,readyForTeachingUse:ready},limitations:['لا يقرأ المحرك ملفات PDF أو Word الثنائية مباشرة؛ يجب على التطبيق المضيف تنفيذ الاستخراج وتمرير النص والصفحات.','بصمة FNV-1a بطول 32 بت مؤشر أولي لكشف التكرار المحتمل وليست إثباتًا قطعيًا؛ يجب مراجعة التطابقات قبل حذف أي ملف.','لا يُعتمد المحتوى ولا يُتاح للتعليم قبل مراجعة بشرية وتسجيل أساس الحقوق ومصدره.']};
    }
    function reviewCurriculumImportItem(input, decision) {
      const item=prepareCurriculumImport(input), d=decision && typeof decision==='object'?decision:{};
      if (!['approved','rejected','pending'].includes(clean(d.status))) throw Error('curriculum-import-review-decision-invalid');
      if (!clean(d.reviewer) || !clean(d.reviewedAt)) throw Error('curriculum-import-reviewer-and-date-required');
      const next=Object.assign({},item,{review:{status:clean(d.status),reviewer:clean(d.reviewer),reviewedAt:clean(d.reviewedAt),note:clean(d.note)}});
      const check=validateCurriculumImport(next);
      if (!check.valid) throw Error('curriculum-import-review-invalid:' + check.errors.join(','));
      return check.item;
    }
    function summarizeCurriculumImportBatch(batch) {
      const b=batch && typeof batch==='object'?batch:{}, items=Array.isArray(b.items)?b.items:[];
      const byStage={},bySubject={};
      items.forEach(x=>{const stage=x.stage||'غير محدد',subject=x.subject||'غير محدد';byStage[stage]=(byStage[stage]||0)+1;bySubject[subject]=(bySubject[subject]||0)+1;});
      const approved=items.filter(x=>validateCurriculumImport(x).eligibleForTeachingUse).length;
      return {version:VERSION,total:items.length,rejected:Array.isArray(b.rejected)?b.rejected.length:0,approved,awaitingReview:items.filter(x=>x.review&&x.review.status==='pending').length,searchable:items.filter(x=>x.extraction&&x.extraction.status==='text_extracted').length,metadataOnly:items.filter(x=>x.extraction&&x.extraction.status==='metadata_only').length,byStage,bySubject,readiness:items.length?Math.round(approved/items.length*100):0,note:'الجاهزية تقيس الاعتماد المسجل ولا تثبت صحة المحتوى أو رسميته أو اكتمال المنهاج.'};
    }

    // Deterministic, provenance-preserving text segmentation for host-extracted curriculum text.
    const contentChunkKinds = ['paragraph','list','heading','mixed'];
    function isLikelyHeading(line) {
      const t = clean(line);
      if (!t || t.length > 100) return false;
      return /^(?:الوحدة|المقطع|الميدان|المحور|الفصل|الدرس|النشاط|[0-9٠-٩]+[.)、-]|[أ-ي][.)、-])\s*/.test(t) || (/^[^.!؟?؛:]{3,70}$/.test(t) && t.split(/\s+/).length <= 9 && !/[،,]$/.test(t));
    }
    function splitContentSentences(text) {
      return clean(text).split(/(?<=[.!؟?؛])\s+/).map(x => x.trim()).filter(Boolean);
    }
    function splitContentBlocks(text) {
      const lines = clean(text).replace(/\r/g,'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
      const blocks=[]; let heading='';
      lines.forEach(line=>{
        if (isLikelyHeading(line)) { heading=line; blocks.push({kind:'heading',heading,text:line}); return; }
        const kind=/^(?:[-*•▪]|\d+[.)]|[٠-٩]+[.)])\s/.test(line)?'list':'paragraph';
        blocks.push({kind,heading,text:line});
      });
      return blocks;
    }
    function splitLongContentBlock(block, maxChars) {
      if (block.text.length<=maxChars) return [block];
      const sentences=splitContentSentences(block.text), out=[]; let part='';
      sentences.forEach(sentence=>{
        if (part && (part.length+sentence.length+1)>maxChars) { out.push(Object.assign({},block,{text:part})); part=''; }
        if (sentence.length>maxChars) {
          if (part) { out.push(Object.assign({},block,{text:part})); part=''; }
          for(let i=0;i<sentence.length;i+=maxChars) out.push(Object.assign({},block,{text:sentence.slice(i,i+maxChars)}));
        } else part += (part?' ':'')+sentence;
      });
      if(part) out.push(Object.assign({},block,{text:part}));
      return out;
    }
    function prepareLearningContentChunks(input) {
      input=input&&typeof input==='object'?input:{};
      const maxChars=Math.max(200,Math.min(2400,Number(input.maxChars)||900));
      const pages=Array.isArray(input.pages)?input.pages.map((p,i)=>({page:Number(p&& (p.page||p.pageNumber))||Number(input.pageStart)||i+1,text:clean(p&&p.text!=null?p.text:p),section:clean(p&&p.section)})).filter(p=>p.text):
        (clean(input.text||input.extractedText)?[{page:Number(input.pageStart)||1,text:clean(input.text||input.extractedText),section:''}]:[]);
      const chunks=[]; let sequence=0;
      pages.forEach(page=>{
        const blocks=splitContentBlocks(page.text); let current=null;
        blocks.forEach(block=>{
          if(block.kind==='heading') { current=block.text; }
          const pieces=splitLongContentBlock(block,maxChars);
          pieces.forEach(piece=>{
            if(piece.kind==='heading') return;
            sequence++;
            chunks.push({id:clean(input.id)||'content',chunkId:(clean(input.id)||'content')+'-p'+page.page+'-c'+sequence,
              sequence,page:page.page,section:piece.heading||page.section||current||'',kind:piece.kind,text:piece.text,
              normalizedText:normalizeImportText(piece.text),charCount:piece.text.length,wordCount:piece.text.split(/\s+/).filter(Boolean).length,
              source:{resourceId:clean(input.resourceId),title:clean(input.title),grade:clean(input.grade),stage:clean(input.stage),subject:clean(input.subject),term:clean(input.term),uri:clean(input.uri)}});
          });
        });
      });
      return {version:VERSION,chunkType:'provenance-preserving-curriculum-text-chunks',sourceId:clean(input.id)||null,
        maxChars,chunks,stats:{pages:pages.length,chunks:chunks.length,characters:chunks.reduce((n,x)=>n+x.charCount,0),words:chunks.reduce((n,x)=>n+x.wordCount,0)},
        limitations:['التقسيم يعتمد على الفقرات والعناوين وعلامات الترقيم، ولا يمثل فهمًا دلاليًا أو استخراجًا موثوقًا للمفاهيم.','قد تحتاج العناوين غير النمطية إلى تحديد يدوي أو تحسين من أداة الاستخراج.','يجب الاحتفاظ بالصفحات والمصدر ومراجعة المقاطع قبل اعتمادها في الإجابات التعليمية.']};
    }
    function validateLearningContentChunks(input) {
      const result=input&&typeof input==='object'?input:{}, chunks=Array.isArray(result.chunks)?result.chunks:[], errors=[],warnings=[],ids=new Set();
      chunks.forEach((c,i)=>{
        if(!clean(c&&c.chunkId)) errors.push('content-chunk-id-required@'+i);
        else if(ids.has(c.chunkId)) errors.push('content-chunk-duplicate-id@'+i); else ids.add(c.chunkId);
        if(!Number.isInteger(Number(c&&c.page))||Number(c.page)<1) errors.push('content-chunk-page-invalid@'+i);
        if(!clean(c&&c.text)) errors.push('content-chunk-text-required@'+i);
        if(c&&Number(c.charCount)!==clean(c.text).length) errors.push('content-chunk-character-count-mismatch@'+i);
        if(c&&c.kind&&!contentChunkKinds.includes(c.kind)) errors.push('content-chunk-kind-invalid@'+i);
        if(c&&c.text&&Number(c.charCount)>Number(result.maxChars||2400)) warnings.push('content-chunk-exceeds-configured-limit@'+i);
      });
      if(!chunks.length) warnings.push('content-chunks-empty');
      return {version:VERSION,valid:errors.length===0,errors,warnings,total:chunks.length,hasPageProvenance:chunks.length>0&&chunks.every(x=>Number.isInteger(Number(x.page))&&Number(x.page)>0),hasSourceMetadata:chunks.some(x=>x.source&&(x.source.resourceId||x.source.title||x.source.uri))};
    }
    function summarizeLearningContentChunks(input) {
      const chunks=Array.isArray(input&&input.chunks)?input.chunks:[],byPage={},byKind={};
      chunks.forEach(c=>{const p=String(c.page);byPage[p]=(byPage[p]||0)+1;byKind[c.kind]=(byKind[c.kind]||0)+1;});
      return {version:VERSION,totalChunks:chunks.length,totalPages:Object.keys(byPage).length,totalCharacters:chunks.reduce((n,c)=>n+(Number(c.charCount)||0),0),totalWords:chunks.reduce((n,c)=>n+(Number(c.wordCount)||0),0),byPage,byKind,validation:validateLearningContentChunks(input),note:'الإحصاءات تصف التقسيم النصي فقط ولا تقيس الفهم أو صحة المحتوى.'};
    }

    // Deterministic lexical index for curriculum chunks; no embeddings or semantic claims.
    function createLearningContentIndex(input) {
      input=input&&typeof input==='object'?input:{};
      const chunks=Array.isArray(input.chunks)?input.chunks:[];
      const validation=validateLearningContentChunks({chunks,maxChars:input.maxChars||2400});
      const entries=chunks.filter(c=>c&&clean(c.chunkId)&&clean(c.text)).map(c=>{
        const source=c.source&&typeof c.source==='object'?c.source:{};
        const terms=tokenize(c.text), uniqueTerms=Array.from(new Set(terms));
        return {chunkId:clean(c.chunkId),sourceId:clean(c.id)||clean(input.sourceId)||null,page:Number(c.page),section:clean(c.section),kind:clean(c.kind)||'paragraph',text:clean(c.text),terms:uniqueTerms,
          metadata:{resourceId:clean(source.resourceId),title:clean(source.title),grade:clean(source.grade),stage:clean(source.stage),subject:clean(source.subject),term:clean(source.term),uri:clean(source.uri)}};
      });
      const duplicateIds=entries.length-new Set(entries.map(x=>x.chunkId)).size;
      return {version:VERSION,indexType:'deterministic-lexical-curriculum-index',sourceId:clean(input.sourceId)||null,entries,stats:{inputChunks:chunks.length,indexedChunks:entries.length,uniqueTerms:Array.from(new Set(entries.reduce((a,x)=>a.concat(x.terms),[]))).length,duplicateIds},limitations:['البحث معجمي حتمي يعتمد على تطابق الكلمات بعد تطبيعها، وليس فهمًا دلاليًا أو تضمينات متجهية.','لا يثبت ترتيب النتائج صحة المحتوى أو رسميته؛ راجع المصدر والصفحة قبل اعتماد الإجابة.','لا تُدرج المقاطع التي تفتقر إلى معرّف أو نص صالح.']};
    }
    function validateLearningContentIndex(input) {
      const index=input&&typeof input==='object'?input:{},entries=Array.isArray(index.entries)?index.entries:[],errors=[],warnings=[],ids=new Set();
      if(index.indexType!=='deterministic-lexical-curriculum-index') errors.push('content-index-type-invalid');
      entries.forEach((e,i)=>{
        if(!clean(e&&e.chunkId)) errors.push('content-index-chunk-id-required@'+i);
        else if(ids.has(e.chunkId)) errors.push('content-index-duplicate-chunk-id@'+i); else ids.add(e.chunkId);
        if(!Number.isInteger(Number(e&&e.page))||Number(e.page)<1) errors.push('content-index-page-invalid@'+i);
        if(!clean(e&&e.text)) errors.push('content-index-text-required@'+i);
        if(!Array.isArray(e&&e.terms)||!e.terms.length) warnings.push('content-index-terms-empty@'+i);
        if(!e||!e.metadata||typeof e.metadata!=='object') errors.push('content-index-metadata-invalid@'+i);
      });
      if(!entries.length) warnings.push('content-index-empty');
      return {version:VERSION,valid:errors.length===0,errors,warnings,totalEntries:entries.length,uniqueChunkIds:ids.size,hasPageProvenance:entries.length>0&&entries.every(e=>Number.isInteger(Number(e.page))&&Number(e.page)>0)};
    }
    function searchLearningContentIndex(input) {
      input=input&&typeof input==='object'?input:{};
      const index=input.index&&typeof input.index==='object'?input.index:{},validation=validateLearningContentIndex(index),query=clean(input.query),semantic=buildSemanticUnderstanding({query,language:input.language,semanticLexicon:input.semanticLexicon}),analysis=semantic.analysis,queryTerms=Array.from(new Set(analysis.contentTerms.length?analysis.contentTerms:analysis.tokens));
      const filters=input.filters&&typeof input.filters==='object'?input.filters:{},limit=Math.max(1,Math.min(50,Number(input.limit)||8));
      if(!validation.valid)return {version:VERSION,query,results:[],totalMatches:0,errors:validation.errors,note:'تعذر البحث لأن فهرس المقاطع غير صالح.'};
      if(!queryTerms.length)return {version:VERSION,query,results:[],totalMatches:0,errors:[],note:'أدخل كلمات بحث للعثور على المقاطع.'};
      const queryPlan=buildCurriculumSearchQuery({query,synonyms:input.synonyms}),expandedOnly=queryPlan.expandedTerms.filter(t=>!queryTerms.includes(t));
      const conceptTerms=[];semantic.concepts.forEach(c=>{const def=(input.semanticLexicon.concepts||[]).find(x=>clean(x.id)===c.conceptId);(def?[def.label].concat(def.aliases||[],def.relatedTerms||[]):[]).forEach(v=>tokenize(v).forEach(t=>{if(!queryTerms.includes(t)&&!expandedOnly.includes(t))conceptTerms.push(t);}));});
      const allTerms=Array.from(new Set(queryTerms.concat(expandedOnly,conceptTerms)));
      const matches=index.entries.filter(e=>Object.keys(filters).every(k=>{if(filters[k]==null||clean(filters[k])==='')return true;const actual=k==='resourceId'?e.metadata.resourceId:k==='title'?e.metadata.title:k==='grade'?e.metadata.grade:k==='stage'?e.metadata.stage:k==='subject'?e.metadata.subject:k==='term'?e.metadata.term:k==='page'?String(e.page):null;return actual!=null&&normalizeImportText(actual)===normalizeImportText(filters[k]);})).map(e=>{
        const terms=new Set((e.terms||[]).concat(tokenize(e.text))),matched=queryTerms.filter(t=>terms.has(t)),matchedExpansionTerms=expandedOnly.filter(t=>terms.has(t)),matchedConceptTerms=conceptTerms.filter(t=>terms.has(t));
        const stemMatches=queryTerms.filter(t=>{const st=lightSemanticStem(t,analysis.language);return st.length>=3&&Array.from(terms).some(x=>lightSemanticStem(x,analysis.language)===st);});
        const phrase=semanticNormalize(e.text).includes(semanticNormalize(query));
        const metadataText=tokenize([e.section,e.metadata.title,e.metadata.subject,e.metadata.grade].join(' '));
        const metadataMatches=allTerms.filter(t=>metadataText.includes(t)).length;
        if(!matched.length&&!matchedExpansionTerms.length&&!matchedConceptTerms.length&&!stemMatches.length&&!phrase)return null;
        const coverage=matched.length/Math.max(1,queryTerms.length),stemCoverage=stemMatches.length/Math.max(1,queryTerms.length),expCoverage=matchedExpansionTerms.length/Math.max(1,expandedOnly.length),conceptCoverage=matchedConceptTerms.length/Math.max(1,conceptTerms.length);
        const score=Math.min(100,Math.round(coverage*58+stemCoverage*12+expCoverage*10+conceptCoverage*12+(metadataMatches/Math.max(1,allTerms.length))*5+(phrase?15:0)));
        const matchedSynonyms=queryPlan.synonymExpansions.filter(x=>tokenize(x.variant).some(t=>matchedExpansionTerms.includes(t)));
        const matchReasons=[];if(matched.length)matchReasons.push('direct-terms');if(stemMatches.length)matchReasons.push('light-morphology');if(matchedExpansionTerms.length)matchReasons.push('teacher-synonyms');if(matchedConceptTerms.length)matchReasons.push('grounded-concept-lexicon');if(phrase)matchReasons.push('exact-phrase');
        return {chunkId:e.chunkId,sourceId:e.sourceId,page:e.page,section:e.section,kind:e.kind,text:e.text,metadata:Object.assign({},e.metadata),score,matchedTerms:Array.from(new Set(matched.concat(matchedExpansionTerms,matchedConceptTerms,stemMatches))),matchedQueryTerms:matched,matchedExpansionTerms,matchedConceptTerms,matchedStemTerms:stemMatches,matchedSynonyms,matchReasons,matchType:matchReasons.join('+')};
      }).filter(Boolean).sort((a,b)=>b.score-a.score||b.matchedQueryTerms.length-a.matchedQueryTerms.length||a.page-b.page||a.chunkId.localeCompare(b.chunkId));
      return {version:VERSION,query,semanticUnderstanding:semantic,queryPlan,results:matches.slice(0,limit),totalMatches:matches.length,filtersApplied:Object.keys(filters).filter(k=>filters[k]!=null&&clean(filters[k])!==''),searchType:semantic.concepts.length?'grounded-concept-hybrid':(queryPlan.synonymExpansions.length?'teacher-expanded-lexical':'explainable-hybrid-semantic-lexical'),pipeline:['normalization','language-detection','stopword-filtering','light-morphological-analysis','intent-classification','teacher-lexicon-concept-matching','synonym-expansion','hybrid-ranking','provenance-preservation'],limitations:semantic.limits.concat(['المطابقة الصرفية تقريبية وليست تحليلاً صرفياً كاملاً.','لا توجد embeddings أو neural reranker في هذا الإصدار؛ لا تُدّعى دلالة غير مدعومة بالمعجم أو النص.','النتائج مرشحات استرجاع وليست تصديقاً لصحة المحتوى.'])};
    }
    function summarizeLearningContentIndex(input) {
      const index=input&&typeof input==='object'?input:{},entries=Array.isArray(index.entries)?index.entries:[],byStage={},bySubject={},byResource={};
      entries.forEach(e=>{const m=e.metadata||{};if(m.stage)byStage[m.stage]=(byStage[m.stage]||0)+1;if(m.subject)bySubject[m.subject]=(bySubject[m.subject]||0)+1;const r=m.resourceId||e.sourceId||'غير محدد';byResource[r]=(byResource[r]||0)+1;});
      return {version:VERSION,totalEntries:entries.length,uniqueTerms:Array.from(new Set(entries.reduce((a,e)=>a.concat(Array.isArray(e.terms)?e.terms:[]),[]))).length,byStage,bySubject,byResource,validation:validateLearningContentIndex(index),note:'الإحصاءات تصف فهرسًا معجميًا ولا تقيس الفهم الدلالي أو موثوقية المحتوى.'};
    }

    function createLearningKnowledgeGraph(input) {
      input=input&&typeof input==='object'?input:{};
      const concepts=Array.isArray(input.concepts)?input.concepts:[], relations=Array.isArray(input.relations)?input.relations:[], ids=new Set(), errors=[], warnings=[];
      concepts.forEach((c,i)=>{if(!c||!clean(c.id))errors.push('knowledge-concept-id-required@'+i);else if(ids.has(clean(c.id)))errors.push('knowledge-concept-id-duplicate@'+i);else ids.add(clean(c.id));if(!c||!clean(c.label))errors.push('knowledge-concept-label-required@'+i);});
      const allowed=['prerequisite','related','part_of','example_of','supports'];
      relations.forEach((r,i)=>{if(!r||!ids.has(clean(r.from))||!ids.has(clean(r.to)))errors.push('knowledge-relation-endpoint-invalid@'+i);if(r&&r.from===r.to)errors.push('knowledge-relation-self-link@'+i);if(!r||!allowed.includes(r.type))errors.push('knowledge-relation-type-invalid@'+i);});
      if(!concepts.length)warnings.push('knowledge-graph-empty');
      const graph={version:VERSION,graphType:'teacher-authored-learning-knowledge-graph',stage:clean(input.stage)||null,grade:clean(input.grade)||null,subject:clean(input.subject)||null,concepts:concepts.filter(c=>c&&clean(c.id)&&clean(c.label)).map(c=>({id:clean(c.id),label:clean(c.label),description:clean(c.description),chunkIds:Array.isArray(c.chunkIds)?c.chunkIds.map(clean).filter(Boolean):[],competencyId:clean(c.competencyId)||null})),relations:relations.filter(r=>r&&ids.has(clean(r.from))&&ids.has(clean(r.to))&&allowed.includes(r.type)).map(r=>({from:clean(r.from),to:clean(r.to),type:r.type,note:clean(r.note)}))};
      return {version:VERSION,valid:!errors.length,errors,warnings,graph:errors.length?null:graph,stats:{concepts:graph.concepts.length,relations:graph.relations.length},note:'العلاقات يحددها الأستاذ أو مصدر موثق؛ لا يستنتج المحرك صحة العلاقات تلقائيًا.'};
    }
    function validateLearningKnowledgeGraph(input) {
      const g=input&&input.graph?input.graph:input||{},result=createLearningKnowledgeGraph(g);return {version:VERSION,valid:result.valid,errors:result.errors,warnings:result.warnings,conceptCount:Array.isArray(g.concepts)?g.concepts.length:0,relationCount:Array.isArray(g.relations)?g.relations.length:0};
    }
    function summarizeLearningKnowledgeGraph(input) {
      const g=input&&input.graph?input.graph:input||{},concepts=Array.isArray(g.concepts)?g.concepts:[],relations=Array.isArray(g.relations)?g.relations:[],byType={};relations.forEach(r=>{byType[r.type]=(byType[r.type]||0)+1;});return {version:VERSION,conceptCount:concepts.length,relationCount:relations.length,byRelationType:byType,isolatedConcepts:concepts.filter(c=>!relations.some(r=>r.from===c.id||r.to===c.id)).map(c=>c.id),validation:validateLearningKnowledgeGraph(g)};
    }

    // Traverse teacher-authored concept relations without inferring new links.
    function traceLearningKnowledgePath(input) {
      input=input&&typeof input==='object'?input:{};const raw=input.graph&&input.graph.graph?input.graph.graph:input.graph||{},check=validateLearningKnowledgeGraph(raw),concepts=Array.isArray(raw.concepts)?raw.concepts:[],relations=Array.isArray(raw.relations)?raw.relations:[],from=clean(input.fromConceptId),to=clean(input.toConceptId),direction=['outgoing','incoming','both'].includes(input.direction)?input.direction:'outgoing',allowed=Array.isArray(input.relationTypes)&&input.relationTypes.length?new Set(input.relationTypes):null,byId=new Map(concepts.map(c=>[c.id,c]));
      if(!check.valid)return {version:VERSION,valid:false,errors:check.errors,path:[],status:'invalid-graph'};
      const errors=[];if(!byId.has(from))errors.push('knowledge-path-start-not-found');if(!byId.has(to))errors.push('knowledge-path-target-not-found');if(errors.length)return {version:VERSION,valid:false,errors,path:[],status:'invalid-endpoints'};
      const queue=[from],prev=new Map([[from,null]]),via=new Map();while(queue.length&&!prev.has(to)){const current=queue.shift();const next=relations.filter(r=>(!allowed||allowed.has(r.type))&&((direction==='outgoing'&&r.from===current)||(direction==='incoming'&&r.to===current)||(direction==='both'&&(r.from===current||r.to===current)))).map(r=>({id:r.from===current?r.to:r.from,relation:r}));for(const n of next){if(!prev.has(n.id)){prev.set(n.id,current);via.set(n.id,n.relation);queue.push(n.id);}}}
      if(!prev.has(to))return {version:VERSION,valid:true,status:'no-path',fromConceptId:from,toConceptId:to,path:[],visitedCount:prev.size,note:'عدم العثور على مسار لا يثبت عدم وجود علاقة معرفية؛ البحث اقتصر على الروابط والاتجاهات المحددة.'};
      const ids=[];for(let id=to;id!==null;id=prev.get(id))ids.push(id);ids.reverse();const path=ids.map((id,i)=>({order:i+1,conceptId:id,label:byId.get(id).label,description:byId.get(id).description||'',relationFromPrevious:i?{from:via.get(id).from,to:via.get(id).to,type:via.get(id).type,note:via.get(id).note||''}:null}));
      return {version:VERSION,valid:true,status:'path-found',fromConceptId:from,toConceptId:to,direction,path,edgeCount:Math.max(0,path.length-1),visitedCount:prev.size,note:'المسار يعرض أقصر سلسلة وفق العلاقات المدخلة فقط؛ لا يثبت ترتيبًا رسميًا أو ضرورة تربوية إلا إذا راجعه الأستاذ.'};
    }
    function getLearningKnowledgeNeighborhood(input) {
      input=input&&typeof input==='object'?input:{};const raw=input.graph&&input.graph.graph?input.graph.graph:input.graph||{},check=validateLearningKnowledgeGraph(raw),concepts=Array.isArray(raw.concepts)?raw.concepts:[],relations=Array.isArray(raw.relations)?raw.relations:[],start=clean(input.conceptId),direction=['outgoing','incoming','both'].includes(input.direction)?input.direction:'both',depth=Math.max(1,Math.min(4,Number(input.depth)||1)),allowed=Array.isArray(input.relationTypes)&&input.relationTypes.length?new Set(input.relationTypes):null,byId=new Map(concepts.map(c=>[c.id,c]));
      if(!check.valid)return {version:VERSION,valid:false,errors:check.errors,concepts:[],relations:[]};if(!byId.has(start))return {version:VERSION,valid:false,errors:['knowledge-neighborhood-concept-not-found'],concepts:[],relations:[]};
      const distance=new Map([[start,0]]),queue=[start],selected=new Map();while(queue.length){const current=queue.shift(),d=distance.get(current);if(d>=depth)continue;relations.forEach(r=>{if(allowed&&!allowed.has(r.type))return;const match=(direction==='outgoing'&&r.from===current)||(direction==='incoming'&&r.to===current)||(direction==='both'&&(r.from===current||r.to===current));if(!match)return;selected.set([r.from,r.to,r.type].join('|'),r);const next=r.from===current?r.to:r.from;if(!distance.has(next)){distance.set(next,d+1);queue.push(next);}});}
      return {version:VERSION,valid:true,centerConceptId:start,direction,depth,concepts:Array.from(distance.entries()).map(([id,d])=>({id,label:byId.get(id).label,description:byId.get(id).description||'',distance:d})).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)),relations:Array.from(selected.values()).map(r=>({from:r.from,to:r.to,type:r.type,note:r.note||''})),note:'النطاق يضم العقد التي يمكن الوصول إليها ضمن العمق والاتجاه وأنواع العلاقات المحددة؛ لا تُستنتج روابط غير موجودة في الرسم.'};
    }

    function createLearningObjectiveMap(input) {
      input=input&&typeof input==='object'?input:{};const objectives=Array.isArray(input.objectives)?input.objectives:[],resources=Array.isArray(input.resources)?input.resources:[],activities=Array.isArray(input.activities)?input.activities:[],ids=new Set(),errors=[],warnings=[];
      objectives.forEach((o,i)=>{if(!o||!clean(o.id)||!clean(o.description||o.text))errors.push('objective-required-fields@'+i);else if(ids.has(clean(o.id)))errors.push('objective-id-duplicate@'+i);else ids.add(clean(o.id));});
      const check=(rows,label)=>rows.forEach((r,i)=>(Array.isArray(r.objectiveIds)?r.objectiveIds:[]).forEach(id=>{if(!ids.has(clean(id)))errors.push(label+'-objective-reference-invalid@'+i+':'+clean(id));}));check(resources,'resource');check(activities,'activity');
      const map={version:VERSION,mapType:'teacher-authored-learning-objective-map',stage:clean(input.stage)||null,grade:clean(input.grade)||null,subject:clean(input.subject)||null,objectives:objectives.filter(o=>o&&clean(o.id)&&clean(o.description||o.text)).map(o=>({id:clean(o.id),description:clean(o.description||o.text),competencyId:clean(o.competencyId)||null,successEvidence:clean(o.successEvidence)||null})),resources:resources.filter(Boolean).map(r=>({id:clean(r.id),objectiveIds:(r.objectiveIds||[]).map(clean),chunkIds:(r.chunkIds||[]).map(clean),sourceId:clean(r.sourceId)||null})),activities:activities.filter(Boolean).map(a=>({id:clean(a.id),objectiveIds:(a.objectiveIds||[]).map(clean),type:clean(a.type)||'activity'}))};
      const uncovered=map.objectives.filter(o=>!map.resources.some(r=>r.objectiveIds.includes(o.id))&&!map.activities.some(a=>a.objectiveIds.includes(o.id))).map(o=>o.id);if(uncovered.length)warnings.push('objectives-without-resource-or-activity:'+uncovered.join(','));
      return {version:VERSION,valid:!errors.length,errors,warnings,map:errors.length?null:map,coverage:{objectives:map.objectives.length,withResources:map.objectives.filter(o=>map.resources.some(r=>r.objectiveIds.includes(o.id))).length,withActivities:map.objectives.filter(o=>map.activities.some(a=>a.objectiveIds.includes(o.id))).length,uncovered}};
    }
    function validateLearningObjectiveMap(input){const r=createLearningObjectiveMap(input&&input.map?input.map:input);return {version:VERSION,valid:r.valid,errors:r.errors,warnings:r.warnings,coverage:r.coverage};}
    function summarizeLearningObjectiveMap(input){const r=validateLearningObjectiveMap(input),m=input&&input.map?input.map:input||{};return {version:VERSION,objectives:Array.isArray(m.objectives)?m.objectives.length:0,resources:Array.isArray(m.resources)?m.resources.length:0,activities:Array.isArray(m.activities)?m.activities.length:0,coverage:r.coverage,validation:r};}

    // Deterministic, explainable semantic pipeline. It does not claim neural/embedding inference.
    const semanticStopwords = {
      ar: new Set(['ما','ماذا','كيف','هل','هو','هي','من','في','على','عن','الى','إلى','مع','هذا','هذه','ذلك','تلك','ماهو','هيه','و','او','ثم','the','a','an']),
      fr: new Set(['le','la','les','un','une','des','de','du','et','ou','est','sont','comment','quoi','que','pour','dans','sur']),
      en: new Set(['the','a','an','is','are','what','how','why','when','where','of','to','in','on','for','and','or','with'])
    };
    function detectSemanticLanguage(text){const t=clean(text);if(/[\u0600-\u06FF]/.test(t))return 'ar';if(/[àâçéèêëîïôûùüÿœ]/i.test(t))return 'fr';return 'en';}
    function semanticNormalize(text){return clean(text).normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[’‘`]/g,"'").replace(/\s+/g,' ').trim();}
    function lightSemanticStem(term,lang){let t=semanticNormalize(term);if(lang==='ar'){t=t.replace(/^(وال|بال|كال|فال|لل|ال|و|ف|ب|ك|ل)/,'');if(t.length>5)t=t.replace(/(يات|ات|ون|ين|ان|ها|هم|هن|كم|نا|ية|يه|ه)$/,'');}else if(lang==='fr'){if(t.length>5)t=t.replace(/(ements|ement|ations|ation|iques|ique|ées|es|s)$/,'');}else if(t.length>5)t=t.replace(/(ingly|edly|ing|ed|ies|es|s)$/,'');return t;}
    function semanticIntent(query,lang){const q=semanticNormalize(query);const patterns=lang==='ar'?[
      ['definition',/ما هو|ماهي|عرّف|عرف|مفهوم|تعريف/],['explanation',/اشرح|فسر|وضح|لماذا|كيف/],['comparison',/قارن|الفرق بين|ما الفرق/],['cause_effect',/سبب|نتيجة|يؤدي الى|ينتج عن/],['procedure',/كيف .*نحسب|خطوات|طريقة|احسب/],['example',/مثال|اعطني مثالا|تطبيق/]
    ]:lang==='fr'?[['definition',/qu'est-ce|définir|definition/],['explanation',/explique|pourquoi|comment/],['comparison',/différence|comparer/],['procedure',/étapes|calculer|méthode/]]:[['definition',/what is|define|meaning/],['explanation',/explain|why|how does/],['comparison',/compare|difference between/],['cause_effect',/cause|effect|result/],['procedure',/steps|how to|calculate/],['example',/example|instance/]];for(const x of patterns)if(x[1].test(q))return x[0];return 'general';}
    function analyzeSemanticQuery(input){input=input&&typeof input==='object'?input:{ };const query=clean(input.query),language=['ar','fr','en'].includes(input.language)?input.language:detectSemanticLanguage(query),normalized=semanticNormalize(query),tokens=tokenize(normalized),filtered=tokens.filter(t=>!semanticStopwords[language].has(t)),stems=Array.from(new Set(filtered.map(t=>lightSemanticStem(t,language)).filter(Boolean)));return {version:VERSION,stage:'query-analysis',query,language,normalized,tokens,contentTerms:filtered,stems,intent:semanticIntent(query,language),phrases:(normalized.match(/[\p{L}\p{N}]+(?:\s+[\p{L}\p{N}]+){1,3}/gu)||[]).slice(0,8),features:{tokenCount:tokens.length,contentTermCount:filtered.length,hasQuestionMark:/[؟?]/.test(query)}};}
    function buildSemanticUnderstanding(input){input=input&&typeof input==='object'?input:{};const analysis=analyzeSemanticQuery(input),lex=input.semanticLexicon&&typeof input.semanticLexicon==='object'?input.semanticLexicon:{},concepts=Array.isArray(lex.concepts)?lex.concepts:[],matched=[];concepts.forEach(c=>{const labels=[c.label].concat(c.aliases||[],c.relatedTerms||[]).filter(Boolean);const hits=labels.map(label=>({label:clean(label),terms:tokenize(label)})).filter(x=>x.terms.length&&x.terms.every(t=>analysis.tokens.includes(t)||analysis.stems.includes(lightSemanticStem(t,analysis.language))));if(hits.length)matched.push({conceptId:clean(c.id)||null,label:clean(c.label),matchedLabels:hits.map(x=>x.label),description:clean(c.description),subject:clean(c.subject)||null,stage:clean(c.stage)||null,confidence:Math.min(1,0.65+0.1*(hits.length-1)),source:clean(c.source)||'teacher-authored-lexicon'});});return {version:VERSION,analysis,concepts:matched,semanticStatus:matched.length?'concepts-grounded-in-supplied-lexicon':'lexical-analysis-only',limits:['التحليل الصرفي قواعد خفيفة قابلة للخطأ ولا يعادل محللاً لغوياً متخصصاً.','المفاهيم والعلاقات الدلالية لا تُقبل إلا من معجم يقدمه الأستاذ أو مصدر معتمد.','لا يتضمن هذا الإصدار نموذج تضمينات أو استدلالاً عصبياً أو فهماً عاماً مضموناً.']};}
    // Full, deterministic semantic stack. Optional vectors are supplied by a host model;
    // this engine never fabricates embeddings or claims neural inference when none exist.
    function analyzeSemanticMorphology(input) {
      input=input&&typeof input==='object'?input:{};const language=['ar','fr','en'].includes(input.language)?input.language:detectSemanticLanguage(input.text||input.query),text=semanticNormalize(input.text||input.query),raw=tokenize(text);
      const rows=raw.map(token=>{let stem=lightSemanticStem(token,language),prefixes=[],suffixes=[];
        if(language==='ar'){let t=token;const pre=['وال','بال','كال','فال','لل','ال','و','ف','ب','ك','ل'];for(const x of pre){if(t.startsWith(x)&&t.length-x.length>=3){prefixes.push(x);t=t.slice(x.length);break;}}const suf=['يات','ات','ون','ين','ان','هما','كما','ها','هم','هن','كم','نا','ية','يه','ه'];for(const x of suf){if(t.endsWith(x)&&t.length-x.length>=3){suffixes.push(x);t=t.slice(0,-x.length);break;}}stem=t;}
        return {token,stem,prefixes,suffixes,method:language==='ar'?'rule-based-arabic-clitic-and-affix':'light-suffix-heuristic'};});
      return {version:VERSION,language,text,tokens:rows,limitations:['تحليل صرفي حاسوبي تقريبي؛ لا يحدد الجذر الثلاثي بدقة ولا يحسم الإعراب أو المعنى من الصيغة وحدها.']};
    }
    function analyzeSemanticContext(input) {
      input=input&&typeof input==='object'?input:{};const query=clean(input.query),history=Array.isArray(input.history)?input.history:[],context=clean(input.context),combined=[context].concat(history.slice(-6).map(x=>clean(typeof x==='string'?x:x&& (x.content||x.text)))).filter(Boolean),analysis=analyzeSemanticQuery({query,language:input.language}),terms=new Set(analysis.contentTerms),contextTerms=Array.from(new Set(combined.reduce((a,x)=>a.concat(tokenize(x)),[]))),overlap=contextTerms.filter(t=>terms.has(t));
      const pronouns=analysis.language==='ar'?['هذا','هذه','ذلك','تلك','هو','هي','هم','ها']:analysis.language==='fr'?['il','elle','ce','cela','ils','elles']:['it','this','that','they','he','she'];
      const hasReference=analysis.tokens.some(t=>pronouns.includes(t));return {version:VERSION,query,language:analysis.language,contextTurnCount:combined.length,contextTerms:contextTerms.slice(0,80),overlapTerms:overlap,hasContextualReference:hasReference,contextRelevance:contextTerms.length?Math.round(overlap.length/Math.max(1,terms.size)*100):0,needsClarification:hasReference&&!overlap.length,interpretationPolicy:hasReference&&!overlap.length?'ask-for-referent':'use-current-query-with-relevant-context'};
    }
    function classifySemanticIntent(input) {
      input=input&&typeof input==='object'?input:{};const a=analyzeSemanticQuery(input),q=a.normalized,l=a.language,patterns=l==='ar'?[['definition',/ما هو|ماهي|عرّف|عرف|مفهوم|تعريف/],['explanation',/اشرح|فسر|وضح|لماذا|كيف/],['comparison',/قارن|الفرق بين|ما الفرق/],['cause_effect',/سبب|نتيجة|يؤدي الى|ينتج عن/],['procedure',/كيف .*نحسب|خطوات|طريقة|احسب/],['example',/مثال|اعطني مثالا|تطبيق/],['summarization',/لخص|ملخص|اختصر/],['translation',/ترجم|ترجمة/],['evaluation',/قيّم|قيم|صحح|تحقق من/]]:l==='fr'?[['definition',/qu'est-ce|définir|definition/],['explanation',/explique|pourquoi|comment/],['comparison',/différence|comparer/],['procedure',/étapes|calculer|méthode/],['summarization',/résume|résumé/],['translation',/traduis|traduction/]]:[['definition',/what is|define|meaning/],['explanation',/explain|why|how does/],['comparison',/compare|difference between/],['cause_effect',/cause|effect|result/],['procedure',/steps|how to|calculate/],['example',/example|instance/],['summarization',/summari[sz]e|summary/],['translation',/translate|translation/],['evaluation',/evaluate|check|correct/]];
      const intents=patterns.filter(x=>x[1].test(q)).map(x=>x[0]);return {version:VERSION,primaryIntent:intents[0]||a.intent||'general',intents:intents.length?intents:['general'],isMultiIntent:intents.length>1,language:l,confidence:intents.length?0.78:0.35,signals:intents.map(x=>'pattern:'+x),note:'تصنيف مقاصد قائم على قواعد لغوية؛ يظل اقتراحًا قابلًا للتصحيح وليس فهمًا مضمونًا.'};
    }
    function matchSemanticConcepts(input) {
      input=input&&typeof input==='object'?input:{};const analysis=analyzeSemanticQuery(input),lex=input.semanticLexicon&&typeof input.semanticLexicon==='object'?input.semanticLexicon:{},concepts=Array.isArray(lex.concepts)?lex.concepts:[],subject=clean(input.subject),stage=clean(input.stage),found=[];
      concepts.forEach(c=>{const labels=[c.label].concat(c.aliases||[],c.relatedTerms||[]).filter(Boolean),hits=[];labels.forEach(label=>{const ts=tokenize(label),matched=ts.filter(t=>analysis.tokens.includes(t)||analysis.stems.includes(lightSemanticStem(t,analysis.language)));if(ts.length&&matched.length===ts.length)hits.push({label:clean(label),matchedTerms:matched});});if(hits.length){const contextual=(subject&&clean(c.subject)===subject?0.08:0)+(stage&&clean(c.stage)===stage?0.04:0);found.push({conceptId:clean(c.id)||null,label:clean(c.label),matchedLabels:hits.map(h=>h.label),description:clean(c.description),subject:clean(c.subject)||null,stage:clean(c.stage)||null,confidence:Math.min(0.99,0.65+0.1*(hits.length-1)+contextual),source:clean(c.source)||'teacher-authored-lexicon',relations:Array.isArray(c.relations)?c.relations.slice():[]});}});
      return found.sort((a,b)=>b.confidence-a.confidence||String(a.conceptId).localeCompare(String(b.conceptId)));
    }
    function buildSemanticKnowledgeGraph(input) {
      input=input&&typeof input==='object'?input:{};const concepts=Array.isArray(input.concepts)?input.concepts:[],edges=Array.isArray(input.relations)?input.relations:[],ids=new Set(concepts.map(c=>clean(c.id)).filter(Boolean)),valid=[],rejected=[];
      edges.forEach((e,i)=>{const from=clean(e&& (e.from||e.source)),to=clean(e&& (e.to||e.target)),type=clean(e&& (e.type||e.relation));if(!ids.has(from)||!ids.has(to)||!type)rejected.push({index:i,reason:'relation-endpoint-or-type-invalid'});else valid.push({from,to,type,source:clean(e.sourceId)||'teacher-authored',direction:e.direction==='undirected'?'undirected':'directed'});});
      return {version:VERSION,graphType:'explicitly-supplied-semantic-concept-graph',nodes:concepts.filter(c=>clean(c.id)).map(c=>({id:clean(c.id),label:clean(c.label),description:clean(c.description)})),edges:valid,rejected,stats:{nodes:ids.size,edges:valid.length},policy:'لا تُنشأ علاقة مفاهيمية تلقائيًا؛ لا يقبل إلا ما يمرره مصدر موثوق أو الأستاذ.'};
    }
    function traceSemanticRelations(input) {
      input=input&&typeof input==='object'?input:{};const graph=input.graph&&typeof input.graph==='object'?input.graph:{},start=clean(input.from),target=clean(input.to),maxDepth=Math.max(1,Math.min(8,Number(input.maxDepth)||4)),edges=Array.isArray(graph.edges)?graph.edges:[],queue=[{id:start,path:[]}],seen=new Set([start]);
      while(queue.length){const cur=queue.shift();if(cur.id===target)return {version:VERSION,found:true,path:cur.path,relationCount:cur.path.length,sourcePolicy:'explicit-graph-edges-only'};if(cur.path.length>=maxDepth)continue;edges.forEach(e=>{let next=null;if(e.from===cur.id)next=e.to;else if(e.direction==='undirected'&&e.to===cur.id)next=e.from;if(next&&!seen.has(next)){seen.add(next);queue.push({id:next,path:cur.path.concat([{from:e.from,to:e.to,type:e.type,source:e.source}])});}});}
      return {version:VERSION,found:false,path:[],reason:'no-explicit-relation-path-within-depth',sourcePolicy:'explicit-graph-edges-only'};
    }
    function cosineSimilarity(a,b){if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)return null;let dot=0,na=0,nb=0;for(let i=0;i<a.length;i++){const x=Number(a[i]),y=Number(b[i]);if(!Number.isFinite(x)||!Number.isFinite(y))return null;dot+=x*y;na+=x*x;nb+=y*y;}return na&&nb?dot/(Math.sqrt(na)*Math.sqrt(nb)):0;}
    function searchSemanticVectors(input) {
      input=input&&typeof input==='object'?input:{};const q=input.queryVector,rows=Array.isArray(input.items)?input.items:[],scored=[],rejected=[];rows.forEach((item,i)=>{const score=cosineSimilarity(q,item&&item.vector);if(score==null)rejected.push({index:i,id:item&&item.id||null,reason:'missing-or-incompatible-vector'});else scored.push({id:clean(item.id)||null,score:Number(score.toFixed(6)),text:clean(item.text),sourceId:clean(item.sourceId)||null,page:Number.isInteger(Number(item.page))?Number(item.page):null,metadata:item.metadata||{}});});scored.sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id)));return {version:VERSION,method:'cosine-similarity-over-host-supplied-vectors',results:scored.slice(0,Math.max(1,Math.min(100,Number(input.limit)||10))),rejected,vectorCount:scored.length,embeddingProviderRequired:true,note:'المحرك لا ينشئ embeddings؛ يجب أن يقدم المضيف متجه السؤال ومتجهات العناصر من نموذج تضمين متوافق.'};
    }
    function createSemanticMemory(input) {
      input=input&&typeof input==='object'?input:{};const entries=Array.isArray(input.entries)?input.entries:[],seen=new Set(),valid=[],rejected=[];entries.forEach((e,i)=>{const id=clean(e&&e.id),content=clean(e&&(e.content||e.text));if(!id||!content||seen.has(id)){rejected.push({index:i,id:id||null,reason:!id?'memory-id-required':!content?'memory-content-required':'duplicate-memory-id'});return;}seen.add(id);valid.push({id,content,language:clean(e.language)||detectSemanticLanguage(content),conceptIds:Array.isArray(e.conceptIds)?e.conceptIds.map(clean).filter(Boolean):[],tags:Array.isArray(e.tags)?e.tags.map(clean).filter(Boolean):[],sourceId:clean(e.sourceId)||null,createdAt:clean(e.createdAt)||null,updatedAt:clean(e.updatedAt)||null});});return {version:VERSION,memoryType:'portable-semantic-memory-records',entries:valid,rejected,stats:{accepted:valid.length,rejected:rejected.length},persistence:'caller-managed; no hidden or automatic storage'};
    }
    function retrieveSemanticMemory(input) {
      input=input&&typeof input==='object'?input:{};const query=analyzeSemanticQuery(input),memory=input.memory&&typeof input.memory==='object'?input.memory:{},terms=new Set(query.contentTerms),conceptIds=new Set(Array.isArray(input.conceptIds)?input.conceptIds.map(clean):[]),rows=(Array.isArray(memory.entries)?memory.entries:[]).map(e=>{const ts=tokenize(e.content),matched=ts.filter(t=>terms.has(t)),conceptHits=(e.conceptIds||[]).filter(x=>conceptIds.has(x)),score=Math.min(100,Math.round(matched.length/Math.max(1,terms.size)*70+conceptHits.length*30));return Object.assign({},e,{score,matchedTerms:Array.from(new Set(matched)),matchedConceptIds:conceptHits});}).filter(e=>e.score>0).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id)));return {version:VERSION,results:rows.slice(0,Math.max(1,Math.min(50,Number(input.limit)||8))),totalMatches:rows.length,policy:'explicit-memory-only; no automatic learner profiling'};
    }
    function validateSemanticConsistency(input) {
      input=input&&typeof input==='object'?input:{};const claims=Array.isArray(input.claims)?input.claims:[],evidence=Array.isArray(input.evidence)?input.evidence:[],checks=[],unsupported=[];claims.forEach((claim,i)=>{const id=clean(claim.id)||'claim-'+(i+1),text=clean(claim.text),refs=Array.isArray(claim.evidenceIds)?claim.evidenceIds:[],matched=refs.map(ref=>evidence.find(e=>clean(e.id)===clean(ref))).filter(Boolean),missing=refs.filter(ref=>!evidence.some(e=>clean(e.id)===clean(ref)));const row={claimId:id,text,hasEvidence:matched.length>0,missingEvidenceIds:missing,evidenceIds:matched.map(e=>clean(e.id)),status:matched.length&&!missing.length?'evidence-linked':missing.length?'broken-evidence-reference':'unsupported'};checks.push(row);if(row.status!=='evidence-linked')unsupported.push(id);});return {version:VERSION,valid:unsupported.length===0,checks,unsupportedClaimIds:unsupported,policy:'structural-evidence-link-validation-only; does-not-verify-truth-or-entailment'};
    }
    function runSemanticPipeline(input) {
      input=input&&typeof input==='object'?input:{};const query=clean(input.query),analysis=analyzeSemanticQuery(input),morphology=analyzeSemanticMorphology({text:query,language:analysis.language}),context=analyzeSemanticContext(input),intent=classifySemanticIntent(input),concepts=matchSemanticConcepts(input),understanding={version:VERSION,query,analysis,morphology,context,intent,concepts,semanticStatus:concepts.length?'grounded-concept-and-context-analysis':'multilingual-lexical-context-analysis',stages:['normalization','language-identification','morphology','context-resolution','multi-intent-classification','concept-linking','optional-vector-retrieval','evidence-consistency-check','optional-explicit-rule-reasoning'],limitations:['المعالجة الحتمية لا تعادل نموذجًا لغويًا عصبيًا عامًا.','المتجهات لا تعمل إلا إذا وفرها المضيف؛ لا توجد خدمة embeddings مدمجة.','الاستدلال يقتصر على العلاقات والقواعد والأدلة الصريحة المقدمة.']};
      if(input.graph)understanding.relationPath=traceSemanticRelations({graph:input.graph,from:input.fromConceptId,to:input.toConceptId,maxDepth:input.maxDepth});
      if(input.vectorSearch)understanding.vectorSearch=searchSemanticVectors(input.vectorSearch);
      if(input.memory)understanding.memory=retrieveSemanticMemory({memory:input.memory,query,conceptIds:concepts.map(c=>c.conceptId)});
      if(Array.isArray(input.claims))understanding.consistency=validateSemanticConsistency({claims:input.claims,evidence:input.evidence});
      if(input.reasoning||Array.isArray(input.facts)||Array.isArray(input.rules)||Array.isArray(input.claims))understanding.reasoning=runEducationalReasoning(input.reasoning&&typeof input.reasoning==='object'?Object.assign({},input,input.reasoning):input);
      return understanding;
    }

    // Educational reasoning layer: deterministic, auditable, and restricted to explicit facts/rules.
    // It does not perform open-ended neural reasoning or prove that supplied premises are true.
    function classifyReasoningClaims(input) {
      input=input&&typeof input==='object'?input:{};const rows=Array.isArray(input.claims)?input.claims:[];
      const factMarkers=/(حقيقة|ثبت|ينص|يذكر|ورد في|according to|states that|according to the text|selon le texte|indique que)/i;
      const hypothesisMarkers=/(ربما|قد يكون|من المحتمل|نفترض|افترض|possibly|perhaps|assume|suppose|peut-être|supposons)/i;
      const inferenceMarkers=/(إذن|لذلك|وبالتالي|نستنتج|يترتب على|therefore|thus|we infer|hence|donc|par conséquent)/i;
      const opinionMarkers=/(أرى|أعتقد|برأيي|في رأيي|أظن|in my opinion|i think|à mon avis|je pense)/i;
      const claims=rows.map((r,i)=>{r=r&&typeof r==='object'?r:{text:r};const text=clean(r.text||r.claim),explicit=clean(r.kind||r.type).toLowerCase();let kind=['fact','hypothesis','inference','opinion','unknown'].includes(explicit)?explicit:'unknown';if(kind==='unknown'){if(opinionMarkers.test(text))kind='opinion';else if(hypothesisMarkers.test(text))kind='hypothesis';else if(inferenceMarkers.test(text))kind='inference';else if(factMarkers.test(text)||Array.isArray(r.evidenceIds)&&r.evidenceIds.length)kind='fact';}
        return {id:clean(r.id)||'claim-'+(i+1),text,kind,conceptId:clean(r.conceptId)||null,evidenceIds:Array.isArray(r.evidenceIds)?Array.from(new Set(r.evidenceIds.map(clean).filter(Boolean))):[],sourceId:clean(r.sourceId)||null,explicitKind:!!explicit};});
      return {version:VERSION,claims,counts:claims.reduce((a,c)=>(a[c.kind]=(a[c.kind]||0)+1,a),{}),policy:'classification-is-heuristic; source-linked does-not-mean-verified-true'};
    }
    function decomposeReasoningQuestion(input) {
      input=input&&typeof input==='object'?input:{};const query=clean(input.query),language=['ar','fr','en'].includes(input.language)?input.language:detectSemanticLanguage(query),intent=classifySemanticIntent({query,language}),parts=query.split(/\s*(?:،|؛|\?|؟|\n|وبعد ذلك|ثمّ|ثم|and then|then|et\s+ensuite)\s*/i).map(clean).filter(Boolean),steps=[];
      const labels={definition:'تحديد المفهوم أو تعريفه',explanation:'شرح المفهوم أو الظاهرة',comparison:'تحديد أوجه المقارنة',cause_effect:'تحليل السبب والنتيجة',procedure:'ترتيب خطوات الإجراء',example:'تقديم مثال أو تطبيق',summarization:'تلخيص المعلومات',translation:'ترجمة المحتوى',evaluation:'فحص الإجابة أو تقييمها',general:'فهم المطلوب'};
      const intents=intent.intents.filter(x=>x!=='general');(intents.length?intents:['general']).forEach((name,i)=>steps.push({step:i+1,task:name,description:labels[name]||labels.general,source:'intent-pattern'}));
      if(parts.length>1)return {version:VERSION,query,language,isMultiStep:true,segments:parts.map((text,i)=>({step:i+1,text})),steps,requiresOrderingReview:true,note:'تقسيم لغوي أولي؛ راجع ترتيب الخطوات والعلاقات الشرطية قبل التنفيذ.'};
      return {version:VERSION,query,language,isMultiStep:steps.length>1,segments:[{step:1,text:query}],steps,requiresOrderingReview:steps.length>1,note:'تجزئة المطلوب وفق إشارات لغوية؛ لا تعني أن كل خطوة قد نُفذت أو حُلّت.'};
    }
    function deriveExplicitRuleConclusions(input) {
      input=input&&typeof input==='object'?input:{};const initial=Array.isArray(input.facts)?input.facts:[],rules=Array.isArray(input.rules)?input.rules:[],facts=[],rejected=[],seen=new Set();
      initial.forEach((f,i)=>{f=f&&typeof f==='object'?f:{};const id=clean(f.id)||'fact-'+(i+1),conceptId=clean(f.conceptId);if(!conceptId||seen.has(id)){rejected.push({index:i,id,reason:!conceptId?'fact-concept-id-required':'duplicate-fact-id'});return;}seen.add(id);facts.push({id,conceptId,value:f.value==null?null:f.value,text:clean(f.text),kind:'given',evidenceIds:Array.isArray(f.evidenceIds)?Array.from(new Set(f.evidenceIds.map(clean).filter(Boolean))):[],sourceId:clean(f.sourceId)||null});});
      const derived=[],usedRules=new Set();let changed=true,round=0,maxRounds=Math.max(1,Math.min(12,Number(input.maxRounds)||6));
      while(changed&&round<maxRounds){changed=false;round++;rules.forEach((rule,ri)=>{rule=rule&&typeof rule==='object'?rule:{};const ruleId=clean(rule.id)||'rule-'+(ri+1),premises=Array.isArray(rule.premises)?rule.premises:[],conclusion=rule.conclusion&&typeof rule.conclusion==='object'?rule.conclusion:{};if(!premises.length||!clean(conclusion.conceptId))return;const matched=premises.map(p=>{const spec=typeof p==='string'?{conceptId:p}:p||{};return facts.find(f=>f.conceptId===clean(spec.conceptId)&& (spec.value===undefined||spec.value===null||String(f.value)===String(spec.value)));});if(matched.some(x=>!x))return;const premiseFactIds=matched.map(x=>x.id),signature=ruleId+'|'+premiseFactIds.slice().sort().join(',')+'|'+clean(conclusion.conceptId)+'|'+String(conclusion.value==null?'':conclusion.value);if(usedRules.has(signature))return;usedRules.add(signature);const id='inference-'+(derived.length+1),evidenceIds=Array.from(new Set(matched.flatMap(x=>x.evidenceIds))),sourceIds=Array.from(new Set(matched.map(x=>x.sourceId).concat(clean(rule.sourceId)||[]).filter(Boolean)));const row={id,conceptId:clean(conclusion.conceptId),value:conclusion.value==null?null:conclusion.value,text:clean(conclusion.text),kind:'derived',ruleId,premiseFactIds,evidenceIds,sourceIds,derivation:'explicit-rule-forward-chaining'};facts.push(row);derived.push(row);changed=true;});}
      return {version:VERSION,facts,derived,rejected,rulesApplied:Array.from(new Set(derived.map(x=>x.ruleId))),rounds:round,limitReached:changed&&round>=maxRounds,policy:'only-explicit-premises-and-rules; conclusions inherit premise evidence references and are not independent verification'};
    }
    function detectSemanticContradictions(input) {
      input=input&&typeof input==='object'?input:{};const claims=Array.isArray(input.claims)?input.claims:[],pairs=Array.isArray(input.contradictionPairs)?input.contradictionPairs:[],found=[],used=new Set();
      const add=(a,b,reason)=>{const key=[clean(a.id),clean(b.id)].sort().join('|');if(!key||used.has(key))return;used.add(key);found.push({claimIds:[clean(a.id),clean(b.id)],conceptId:clean(a.conceptId)||clean(b.conceptId)||null,reason,verification:'candidate-contradiction-requires-review'});};
      pairs.forEach(pair=>{const a=claims.find(c=>clean(c.id)===clean(pair&&pair.a)),b=claims.find(c=>clean(c.id)===clean(pair&&pair.b));if(a&&b)add(a,b,'explicitly-declared-contradiction-pair');});
      const neg=/\b(ليس|ليست|لا|لم|لن|غير|عدم|never|not|no|doesn't|isn't|n'est pas|ne .* pas)\b/i;
      const positive=/\b(هو|هي|يحدث|يوجد|يساوي|is|are|does|exists|equals|est|sont)\b/i;
      for(let i=0;i<claims.length;i++)for(let j=i+1;j<claims.length;j++){const a=claims[i]||{},b=claims[j]||{};if(!clean(a.conceptId)||clean(a.conceptId)!==clean(b.conceptId))continue;const av=a.polarity|| (neg.test(clean(a.text))?'negative':positive.test(clean(a.text))?'positive':null),bv=b.polarity||(neg.test(clean(b.text))?'negative':positive.test(clean(b.text))?'positive':null);if(av&&bv&&av!==bv)add(a,b,'opposing-explicit-polarity-on-same-concept');}
      return {version:VERSION,contradictions:found,count:found.length,hasCandidates:found.length>0,policy:'conservative-candidate-detection; does-not-resolve-which-claim-is-true'};
    }
    function validateReasoningChain(input) {
      input=input&&typeof input==='object'?input:{};const steps=Array.isArray(input.steps)?input.steps:[],facts=Array.isArray(input.facts)?input.facts:[],rules=Array.isArray(input.rules)?input.rules:[],factIds=new Set(facts.map(f=>clean(f.id))),ruleIds=new Set(rules.map(r=>clean(r.id))),checks=[],invalid=[];
      steps.forEach((s,i)=>{const missingPremises=(Array.isArray(s.premiseFactIds)?s.premiseFactIds:[]).filter(id=>!factIds.has(clean(id)));const ruleExists=ruleIds.has(clean(s.ruleId));const row={stepId:clean(s.id)||'step-'+(i+1),ruleExists,missingPremiseFactIds:missingPremises,valid:ruleExists&&missingPremises.length===0};checks.push(row);if(!row.valid)invalid.push(row.stepId);});
      return {version:VERSION,valid:invalid.length===0,checks,invalidStepIds:invalid,policy:'checks-rule-and-premise-references-only; no proof of rule soundness'};
    }
    function evaluateReasoningSufficiency(input) {
      input=input&&typeof input==='object'?input:{};const evidence=Array.isArray(input.evidence)?input.evidence:[],claims=Array.isArray(input.claims)?input.claims:[],required=Array.isArray(input.requiredEvidenceIds)?input.requiredEvidenceIds.map(clean):[],available=new Set(evidence.map(e=>clean(e.id)).filter(Boolean)),missing=required.filter(id=>!available.has(id)),linked=claims.filter(c=>Array.isArray(c.evidenceIds)&&c.evidenceIds.some(id=>available.has(clean(id)))),unlinked=claims.filter(c=>!Array.isArray(c.evidenceIds)||!c.evidenceIds.some(id=>available.has(clean(id)))),requiredConcepts=Array.isArray(input.requiredConceptIds)?input.requiredConceptIds.map(clean):[],coveredConcepts=new Set(claims.map(c=>clean(c.conceptId)).filter(Boolean)),missingConcepts=requiredConcepts.filter(id=>!coveredConcepts.has(id)),hasAnyEvidence=evidence.some(e=>clean(e.id)&&clean(e.text||e.content));
      const sufficient=missing.length===0&&missingConcepts.length===0&&unlinked.length===0&&hasAnyEvidence&&claims.length>0;
      return {version:VERSION,sufficient,status:sufficient?'evidence-coverage-satisfied':'insufficient-or-incomplete',availableEvidenceCount:evidence.length,linkedClaimCount:linked.length,unlinkedClaimIds:unlinked.map(c=>clean(c.id)),missingRequiredEvidenceIds:missing,missingRequiredConceptIds:missingConcepts,clarificationQuestions:sufficient?[]:[clean(input.clarificationQuestion)||'ما المصدر أو المعلومة الناقصة التي يمكن الاستناد إليها؟'],policy:'coverage-assessment-only; evidence-presence-does-not-prove-truth-or-entailment'};
    }
    function buildEducationalReasoningChain(input) {
      input=input&&typeof input==='object'?input:{};const claims=classifyReasoningClaims({claims:input.claims}),derivation=deriveExplicitRuleConclusions({facts:input.facts,rules:input.rules,maxRounds:input.maxRounds}),contradictions=detectSemanticContradictions({claims:claims.claims,contradictionPairs:input.contradictionPairs}),evidence=Array.isArray(input.evidence)?input.evidence:[],claimChecks=validateSemanticConsistency({claims:claims.claims,evidence}),sufficiency=evaluateReasoningSufficiency({claims:claims.claims,evidence,requiredEvidenceIds:input.requiredEvidenceIds,requiredConceptIds:input.requiredConceptIds,clarificationQuestion:input.clarificationQuestion});
      const steps=derivation.derived.map((d,i)=>({id:'reason-step-'+(i+1),type:'inference',conclusionFactId:d.id,ruleId:d.ruleId,premiseFactIds:d.premiseFactIds,evidenceIds:d.evidenceIds,sourceIds:d.sourceIds}));
      return {version:VERSION,chainType:'explicit-evidence-and-rule-grounded',claims:claims.claims,facts:derivation.facts,steps,derivation,contradictions,claimEvidence:claimChecks,sufficiency,summary:{givenFacts:derivation.facts.filter(f=>f.kind==='given').length,derivedConclusions:derivation.derived.length,contradictionCandidates:contradictions.count,unsupportedClaims:claimChecks.unsupportedClaimIds.length},policy:'chain-is-auditable-not-self-validating; review source quality and rule validity'};
    }
    function runEducationalReasoning(input) {
      input=input&&typeof input==='object'?input:{};const decomposition=decomposeReasoningQuestion(input),chain=buildEducationalReasoningChain(input),validation=validateReasoningChain({steps:chain.steps,facts:chain.facts,rules:input.rules});
      const status=chain.contradictions.hasCandidates?'review-contradictions':!chain.sufficiency.sufficient?'insufficient-evidence':!validation.valid?'invalid-reasoning-links':chain.derivation.derived.length?'derived-with-explicit-rules':'no-supported-inference';
      return {version:VERSION,reasoningType:'deterministic-educational-reasoning',query:clean(input.query),decomposition,chain,validation,status,answerPolicy:status==='derived-with-explicit-rules'?'present-conclusions-with-rule-and-evidence-trace':status==='insufficient-evidence'?'ask-for-missing-evidence-or-clarification':'do-not-present-an-unsupported-conclusion',limitations:['لا ينفذ هذا المحرك استدلالًا لغويًا عصبيًا مفتوح المجال.','صحة النتيجة تعتمد على صحة الوقائع والقواعد التي يقدمها المضيف.','كشف التناقضات ترشيحي ويحتاج مراجعة بشرية؛ لا يختار المحرك الحقيقة تلقائيًا.']};
    }

    function buildCurriculumSearchQuery(input){input=input&&typeof input==='object'?input:{};const query=clean(input.query),base=Array.from(new Set(tokenize(query))),synonyms=input.synonyms&&typeof input.synonyms==='object'?input.synonyms:{},expanded=new Set(base),matched=[];base.forEach(term=>{const vals=Array.isArray(synonyms[term])?synonyms[term]:[];vals.forEach(v=>{tokenize(v).forEach(t=>expanded.add(t));matched.push({term,variant:clean(v)});});});return {version:VERSION,query,normalizedTerms:base,expandedTerms:Array.from(expanded),synonymExpansions:matched,filters:{stage:clean(input.stage)||null,grade:clean(input.grade)||null,subject:clean(input.subject)||null,term:clean(input.term)||null,resourceId:clean(input.resourceId)||null},searchMode:matched.length?'teacher-supplied-lexical-expansion':'normalized-lexical',limitations:['التوسيع يعتمد حصريًا على مرادفات يقدمها الأستاذ أو مصدر معتمد.','لا يوجد تحليل دلالي أو اشتقاق صرفي أو نموذج تضمينات.']};}

    function buildCurriculumEvidenceBundle(input){input=input&&typeof input==='object'?input:{};const rows=Array.isArray(input.results)?input.results:[],seen=new Set(),items=[],rejected=[];rows.forEach((r,i)=>{const id=clean(r&& (r.chunkId||r.id)),text=clean(r&&r.text),page=Number(r&&r.page),source=r&&r.metadata&&typeof r.metadata==='object'?r.metadata:{};const reasons=[];if(!id)reasons.push('chunk-id-required');if(!text)reasons.push('text-required');if(input.requireSource!==false&&!clean(r&&r.sourceId||source.resourceId||source.title))reasons.push('source-required');if(r&&r.page!=null&&(!Number.isInteger(page)||page<1))reasons.push('page-invalid');if(id&&seen.has(id))reasons.push('duplicate-chunk');if(reasons.length){rejected.push({index:i,reasons});return;}seen.add(id);items.push({evidenceId:'ev-'+id,chunkId:id,sourceId:clean(r.sourceId||source.resourceId)||null,sourceTitle:clean(source.title)||null,page:Number.isInteger(page)&&page>0?page:null,section:clean(r.section)||null,text,score:Number.isFinite(Number(r.score))?Number(r.score):null,metadata:Object.assign({},source)});});const limit=Math.max(1,Math.min(100,Number(input.limit)||20));return {version:VERSION,bundleType:'source-preserving-curriculum-evidence',query:clean(input.query),items:items.slice(0,limit),rejected,stats:{received:rows.length,accepted:Math.min(items.length,limit),rejected:rejected.length,withPage:items.filter(x=>x.page).length,withSource:items.filter(x=>x.sourceId||x.sourceTitle).length},note:'الحزمة تحفظ النصوص ومراجعها ولا تثبت صحة المصدر أو صحة الاستنتاج؛ يجب الرجوع إلى الأصل.'};}

    // Build a source-grounded teaching context from indexed curriculum chunks.
    // This is retrieval and response guidance only; it does not generate or verify an answer.
    function buildGroundedTeachingContext(input) {
      input = input && typeof input === 'object' ? input : {};
      const query = clean(input.query);
      const index = input.index && typeof input.index === 'object' ? input.index : {};
      const validation = validateLearningContentIndex(index);
      const errors = [];
      if (!query) errors.push('grounded-query-required');
      if (!validation.valid) errors.push.apply(errors, validation.errors.map(x => 'index:' + x));
      if (errors.length) return { version: VERSION, valid: false, errors, query, status: 'not-ready', evidence: [], citations: [], responsePolicy: null };

      const filters = input.filters && typeof input.filters === 'object' ? Object.assign({}, input.filters) : {};
      ['stage','grade','subject','term','resourceId'].forEach(k => {
        if (input[k] != null && clean(input[k])) filters[k] = clean(input[k]);
      });
      const found = searchLearningContentIndex({ index, query, filters, limit: input.limit || 12, synonyms: input.synonyms });
      const evidence = [], untraceable = [], seen = new Set();
      found.results.forEach((r, i) => {
        const sourceId = clean(r.sourceId || r.metadata && r.metadata.resourceId);
        const title = clean(r.metadata && r.metadata.title);
        const page = Number(r.page);
        const reasons = [];
        if (!sourceId) reasons.push('source-id-missing');
        if (!title) reasons.push('source-title-missing');
        if (!Number.isInteger(page) || page < 1) reasons.push('page-reference-missing');
        if (!clean(r.chunkId) || seen.has(clean(r.chunkId))) reasons.push('chunk-id-missing-or-duplicate');
        if (reasons.length) { untraceable.push({ index: i, chunkId: clean(r.chunkId) || null, reasons }); return; }
        seen.add(clean(r.chunkId));
        evidence.push({
          evidenceId: 'ev-' + clean(r.chunkId), chunkId: clean(r.chunkId),
          excerpt: clean(r.text), score: r.score, matchedTerms: r.matchedTerms.slice(), matchedQueryTerms: (r.matchedQueryTerms || []).slice(), matchedExpansionTerms: (r.matchedExpansionTerms || []).slice(), matchedSynonyms: (r.matchedSynonyms || []).map(x => ({ term: x.term, variant: x.variant })),
          source: { id: sourceId, title, page, section: clean(r.section) || null,
            uri: clean(r.metadata && r.metadata.uri) || null,
            grade: clean(r.metadata && r.metadata.grade) || null,
            stage: clean(r.metadata && r.metadata.stage) || null,
            subject: clean(r.metadata && r.metadata.subject) || null,
            term: clean(r.metadata && r.metadata.term) || null }
        });
      });
      const target = input.learningTarget && typeof input.learningTarget === 'object' ? input.learningTarget : {};
      const learningTarget = {
        lesson: clean(target.lesson) || null,
        competencyId: clean(target.competencyId) || null,
        competency: clean(target.competency) || null,
        outcomeId: clean(target.outcomeId) || null,
        outcome: clean(target.outcome) || null,
        suppliedBy: clean(target.suppliedBy) || null
      };
      const status = evidence.length ? 'traceable-evidence-found' : 'insufficient-traceable-evidence';
      return {
        version: VERSION, valid: true, status, query,
        scope: { stage: filters.stage || null, grade: filters.grade || null, subject: filters.subject || null, term: filters.term || null, resourceId: filters.resourceId || null },
        learningTarget,
        evidence, citations: evidence.map(e => ({ evidenceId: e.evidenceId, sourceId: e.source.id, sourceTitle: e.source.title, page: e.source.page, uri: e.source.uri })),
        retrieval: { searchType: found.searchType, queryPlan: found.queryPlan || null, totalMatches: found.totalMatches, returned: found.results.length, traceable: evidence.length, excludedUntraceable: untraceable.length, untraceable },
        responsePolicy: {
          mode: evidence.length ? 'answer-from-provided-evidence-only' : 'abstain-or-ask-for-source',
          instructions: evidence.length ? [
            'أجب في حدود المقاطع المسترجعة فقط، ولا تضف حقائق تخصصية غير مسندة إليها.',
            'اربط كل معلومة مستمدة من المقاطع بإحالة المصدر ورقم الصفحة.',
            'إذا لم تكف المقاطع للإجابة عن جزء من السؤال، صرّح بذلك وحدد ما ينقص.',
            'لا تصف المرجع بأنه رسمي أو معتمد إلا إذا قدم المضيف دليل اعتماد مستقلًا.',
            'اربط الإجابة بالهدف أو الكفاءة فقط إذا كانت بيانات الهدف مقدمة صراحة.'
          ] : [
            'لا تخترع إجابة أو مصدرًا أو رقم صفحة.',
            'صرّح بأن الأدلة القابلة للتتبع غير كافية، واطلب مرجعًا أو توضيحًا مناسبًا.'
          ]
        },
        limitations: [
          'هذه حزمة استرجاع وسياق وليست إجابة مولدة ولا تحققًا من صحة النص.',
          'البحث معجمي حتمي؛ قد يفوّت المرادفات والصيغ غير المتطابقة.',
          'المصدر والصفحة يثبتان موضع النص في البيانات المقدمة ولا يثبتان رسميته أو صحة كل استنتاج.'
        ]
      };
    }

    function createLearnerMisconceptionCatalog(input){input=input&&typeof input==='object'?input:{};const rows=Array.isArray(input.items)?input.items:[],ids=new Set(),errors=[];rows.forEach((x,i)=>{if(!x||!clean(x.id)||!clean(x.label)||!clean(x.conceptId))errors.push('misconception-required-fields@'+i);else if(ids.has(clean(x.id)))errors.push('misconception-id-duplicate@'+i);else ids.add(clean(x.id));});const items=rows.filter(x=>x&&clean(x.id)&&clean(x.label)&&clean(x.conceptId)).map(x=>({id:clean(x.id),label:clean(x.label),conceptId:clean(x.conceptId),subject:clean(x.subject)||null,stage:clean(x.stage)||null,grade:clean(x.grade)||null,errorCodes:Array.isArray(x.errorCodes)?x.errorCodes.map(clean).filter(Boolean):[],signals:Array.isArray(x.signals)?x.signals.map(clean).filter(Boolean):[],remediation:clean(x.remediation)||null,sourceId:clean(x.sourceId)||null,reviewStatus:clean(x.reviewStatus)||'pending'}));return {version:VERSION,valid:!errors.length,errors,catalog:errors.length?null:{catalogType:'reviewable-misconception-catalog',items},stats:{items:items.length,reviewed:items.filter(x=>x.reviewStatus==='approved').length},note:'التصورات تسجل من ملاحظات أو مصادر موثقة؛ لا يشخص المحرك تصور المتعلم من نصه تلقائيًا.'};}
    function matchLearnerMisconceptions(input){input=input&&typeof input==='object'?input:{};const catalog=input.catalog&&input.catalog.catalog?input.catalog.catalog:input.catalog||{},items=Array.isArray(catalog.items)?catalog.items:[],codes=Array.isArray(input.errorCodes)?input.errorCodes.map(clean):[],concept=clean(input.conceptId),stage=clean(input.stage),subject=clean(input.subject);const matches=items.filter(x=>(!concept||x.conceptId===concept)&&(!stage||!x.stage||x.stage===stage)&&(!subject||!x.subject||x.subject===subject)&&x.errorCodes.some(c=>codes.includes(c))).map(x=>({id:x.id,label:x.label,conceptId:x.conceptId,remediation:x.remediation,reviewStatus:x.reviewStatus,sourceId:x.sourceId}));return {version:VERSION,matches,totalMatches:matches.length,matchBasis:'explicit-error-code-and-metadata',note:'المطابقة لا تعني تشخيصًا آليًا؛ errorCodes يجب أن تأتي من تقييم صريح.'};}

    function planLearningPrerequisitePath(input){input=input&&typeof input==='object'?input:{};const g=input.graph&&input.graph.graph?input.graph.graph:input.graph||{},concepts=Array.isArray(g.concepts)?g.concepts:[],rels=Array.isArray(g.relations)?g.relations.filter(r=>r.type==='prerequisite'):[],byId=new Map(concepts.map(c=>[c.id,c])),target=clean(input.targetConceptId),mastered=new Set((Array.isArray(input.masteredConceptIds)?input.masteredConceptIds:[]).map(clean)),errors=[],visiting=new Set(),visited=new Set(),order=[];if(!byId.has(target))errors.push('prerequisite-target-not-found');function visit(id){if(visited.has(id)||mastered.has(id))return;if(visiting.has(id)){errors.push('prerequisite-cycle:'+id);return;}visiting.add(id);rels.filter(r=>r.to===id).forEach(r=>visit(r.from));visiting.delete(id);visited.add(id);order.push(id);}if(byId.has(target))visit(target);const steps=order.filter(id=>!mastered.has(id)).map((id,i)=>({order:i+1,conceptId:id,label:byId.get(id).label,description:byId.get(id).description||'',isTarget:id===target}));return {version:VERSION,valid:!errors.length,errors,targetConceptId:target,steps,alreadyMastered:Array.from(mastered).filter(id=>byId.has(id)),unresolved:steps.map(s=>s.conceptId),note:'يعتمد المسار على علاقات prerequisite التي أدخلها الأستاذ؛ لا يستنتج المحرك المتطلبات الرسمية تلقائيًا.'};}

    // Combine an authored prerequisite graph with explicit learner evidence.
    // Missing evidence remains unassessed; only the latest supplied record per concept is used.
    function planLearnerKnowledgeReview(input) {
      input=input&&typeof input==='object'?input:{};
      const raw=input.graph&&input.graph.graph?input.graph.graph:input.graph||{};
      const check=validateLearningKnowledgeGraph(raw);
      if(!check.valid)return {version:VERSION,valid:false,errors:check.errors,items:[],status:'invalid-graph'};
      const target=clean(input.targetConceptId), concepts=raw.concepts||[], byId=new Map(concepts.map(c=>[c.id,c]));
      if(!byId.has(target))return {version:VERSION,valid:false,errors:['learner-review-target-not-found'],items:[],status:'invalid-target'};
      const evidence=Array.isArray(input.evidence)?input.evidence:[], latest=new Map(), rejected=[];
      evidence.forEach((e,i)=>{
        const id=clean(e&&e.conceptId), outcome=clean(e&&e.outcome);
        if(!e||!byId.has(id)||!['mastered','partial','struggling'].includes(outcome)||!clean(e.note)){
          rejected.push({index:i,reason:!byId.has(id)?'concept-not-found':!['mastered','partial','struggling'].includes(outcome)?'outcome-invalid':'evidence-note-required'});return;
        }
        const row={conceptId:id,outcome,note:clean(e.note),evidenceId:clean(e.evidenceId)||null,source:clean(e.source)||'unspecified',assessorRole:clean(e.assessorRole)||'unspecified',recordedAt:clean(e.recordedAt)||null,taskId:clean(e.taskId)||null};
        const prior=latest.get(id);
        const time=row.recordedAt?Date.parse(row.recordedAt):NaN, priorTime=prior&&prior.recordedAt?Date.parse(prior.recordedAt):NaN;
        if(!prior || (Number.isFinite(time)&&(!Number.isFinite(priorTime)||time>=priorTime)) || (!Number.isFinite(time)&&!Number.isFinite(priorTime))) latest.set(id,row);
      });
      const mastered=Array.from(latest.values()).filter(e=>e.outcome==='mastered').map(e=>e.conceptId);
      const route=planLearningPrerequisitePath({graph:raw,targetConceptId:target,masteredConceptIds:mastered});
      if(!route.valid)return {version:VERSION,valid:false,errors:route.errors,items:[],status:'invalid-prerequisite-path',rejectedEvidence:rejected};
      const priority={struggling:1,partial:2,not_assessed:3};
      const items=route.steps.map(step=>{
        const e=latest.get(step.conceptId), outcome=e?e.outcome:'not_assessed';
        return {order:step.order,conceptId:step.conceptId,label:step.label,description:step.description,isTarget:step.isTarget,
          evidenceStatus:outcome,priority:priority[outcome],reason:outcome==='struggling'?'explicit-struggling-evidence':outcome==='partial'?'explicit-partial-evidence':'no-recorded-evidence',
          evidence:e?{evidenceId:e.evidenceId,source:e.source,assessorRole:e.assessorRole,recordedAt:e.recordedAt,taskId:e.taskId,note:e.note}:null,
          competencyId:(byId.get(step.conceptId)||{}).competencyId||null,sourceChunkIds:Array.isArray((byId.get(step.conceptId)||{}).chunkIds)?byId.get(step.conceptId).chunkIds.slice():[]};
      }).sort((a,b)=>a.priority-b.priority||a.order-b.order);
      return {version:VERSION,valid:true,status:items.length?'review-suggested':'no-review-needed',targetConceptId:target,
        items,rejectedEvidence:rejected,summary:{totalPrerequisiteConcepts:route.steps.length,reviewSuggested:items.length,byStatus:{struggling:items.filter(x=>x.evidenceStatus==='struggling').length,partial:items.filter(x=>x.evidenceStatus==='partial').length,notAssessed:items.filter(x=>x.evidenceStatus==='not_assessed').length},alreadyMastered:route.alreadyMastered},
        ordering:'priority-then-prerequisite-order',policy:'latest-explicit-evidence-only; missing-is-not-assessed; no-persistent-mastery-inference',
        note:'اقتراح المراجعة مبني على آخر شاهد صريح لكل مفهوم وعلى علاقات المتطلبات القبلية التي أدخلها الأستاذ. غياب الشاهد يعني غير مقيم وليس غير متقن؛ النتيجة لا تصنف المتعلم تصنيفًا دائمًا.'};
    }

    // Build remediation activity briefs from a validated review plan and host-authored templates.
    // The engine structures the intervention; it does not invent subject-specific facts or questions.
    function buildTargetedRemediationPlan(input) {
      input = input && typeof input === 'object' ? input : {};
      const review = input.reviewPlan && input.reviewPlan.plan ? input.reviewPlan.plan : input.reviewPlan || {};
      const templates = Array.isArray(input.activityTemplates) ? input.activityTemplates : [];
      const errors = [];
      if (review.valid !== true || !Array.isArray(review.items)) errors.push('valid-learner-review-plan-required');
      const stage = clean(input.stage), grade = clean(input.grade), subject = clean(input.subject);
      if (!stage) errors.push('remediation-stage-required');
      if (!subject) errors.push('remediation-subject-required');
      const seen = new Set(), validTemplates = [], rejectedTemplates = [];
      templates.forEach((t, index) => {
        const reasons = [];
        if (!t || !clean(t.id) || !clean(t.conceptId) || !clean(t.title) || !clean(t.prompt)) reasons.push('template-required-fields');
        if (t && t.activityType && !['explanation','worked_example','guided_practice','independent_practice','application','reflection','diagnostic'].includes(clean(t.activityType))) reasons.push('template-activity-type-invalid');
        if (t && clean(t.id) && seen.has(clean(t.id))) reasons.push('template-id-duplicate');
        if (t && clean(t.id)) seen.add(clean(t.id));
        if (reasons.length) rejectedTemplates.push({ index, id: t && clean(t.id) || null, reasons });
        else validTemplates.push({ id: clean(t.id), conceptId: clean(t.conceptId), title: clean(t.title), prompt: clean(t.prompt),
          activityType: clean(t.activityType) || 'guided_practice', statuses: Array.isArray(t.statuses) ? t.statuses.map(clean) : [],
          stage: clean(t.stage) || null, grade: clean(t.grade) || null, subject: clean(t.subject) || null,
          hints: Array.isArray(t.hints) ? t.hints.map(clean).filter(Boolean).slice(0, 4) : [],
          successCriteria: clean(t.successCriteria) || null, sourceId: clean(t.sourceId) || null, page: Number.isInteger(Number(t.page)) && Number(t.page) > 0 ? Number(t.page) : null,
          reviewStatus: clean(t.reviewStatus) || 'pending' });
      });
      if (errors.length) return { version: VERSION, valid: false, errors, activities: [], rejectedTemplates };
      const statusGuidance = {
        struggling: { focus: 'إعادة بناء المفهوم ومعالجة موضع التعثر بخطوات قصيرة', sequence: ['تحقق من فهم المطلوب والمعرفة السابقة دون إصدار حكم جديد.', 'قدّم تمثيلًا أو مثالًا تأسيسيًا مناسبًا للمادة.', 'وجّه المتعلم إلى خطوة واحدة ثم اجمع شاهدًا جديدًا.'] },
        partial: { focus: 'استكمال الجزء غير المتحقق وتقليل المساعدة تدريجيًا', sequence: ['حدد الجزء الذي ظهر فيه الأداء الجزئي وفق الشاهد.', 'قدّم تدريبًا موجهًا مع تلميح محدود.', 'اطلب محاولة مستقلة قصيرة للتحقق من التحسن.'] },
        not_assessed: { focus: 'تشخيص أولي منخفض المخاطر قبل اختيار المعالجة', sequence: ['ابدأ بسؤال تشخيصي أو مهمة قصيرة.', 'لا تفترض وجود ضعف قبل جمع الشاهد.', 'اختر النشاط التالي بعد مراجعة نتيجة التشخيص.'] }
      };
      const activities = review.items.map((item, index) => {
        const guidance = statusGuidance[item.evidenceStatus] || statusGuidance.not_assessed;
        const matched = validTemplates.filter(t => t.conceptId === item.conceptId &&
          (!t.statuses.length || t.statuses.includes(item.evidenceStatus)) && (!t.stage || t.stage === stage) &&
          (!t.grade || !grade || t.grade === grade) && (!t.subject || t.subject === subject));
        return { order: index + 1, conceptId: item.conceptId, conceptLabel: item.label, competencyId: item.competencyId || null,
          evidenceStatus: item.evidenceStatus, evidenceId: item.evidence && item.evidence.evidenceId || null,
          priority: item.priority, focus: guidance.focus, suggestedSequence: guidance.sequence.slice(),
          activities: matched.map(t => ({ id: t.id, title: t.title, prompt: t.prompt, activityType: t.activityType, hints: t.hints,
            successCriteria: t.successCriteria, sourceId: t.sourceId, page: t.page, reviewStatus: t.reviewStatus,
            requiresTeacherApproval: t.reviewStatus !== 'approved' })),
          needsAuthoredActivity: matched.length === 0, sourceChunkIds: Array.isArray(item.sourceChunkIds) ? item.sourceChunkIds.slice() : [] };
      });
      return { version: VERSION, valid: true, planType: 'evidence-guided-remediation-activity-plan', status: activities.length ? 'remediation-planned' : 'no-remediation-required',
        context: { stage, grade: grade || null, subject, targetConceptId: review.targetConceptId || null }, activities, rejectedTemplates,
        summary: { concepts: activities.length, withMatchedActivities: activities.filter(x => x.activities.length).length,
          needingTeacherAuthoredActivity: activities.filter(x => x.needsAuthoredActivity).length,
          templatesMatched: activities.reduce((n, x) => n + x.activities.length, 0), awaitingApproval: activities.reduce((n, x) => n + x.activities.filter(a => a.requiresTeacherApproval).length, 0) },
        policy: 'explicit-review-evidence; stage-grade-subject-filtering; teacher-authored-or-approved-activities; no-automatic-content-generation',
        note: 'هذه خطة علاجية منظمة وليست أسئلة مولدة تلقائيًا. الأنشطة المطابقة تأتي من قوالب يقدمها المضيف؛ وكل نشاط غير معتمد يحتاج مراجعة الأستاذ قبل عرضه للمتعلم.' };
    }

    function planAdaptiveDialogueMove(input) {
      input = input && typeof input === 'object' ? input : {};
      const allowedAssessments = ['correct', 'partial', 'incorrect', 'unclear'];
      const assessment = clean(input.assessment).toLowerCase();
      const errors = [];
      if (!allowedAssessments.includes(assessment)) errors.push('adaptive-dialogue-assessment-invalid');
      const hintCount = input.hintCount == null ? 0 : Number(input.hintCount);
      if (!Number.isInteger(hintCount) || hintCount < 0) errors.push('adaptive-dialogue-hint-count-invalid');
      const maxHints = input.maxHints == null ? 1 : Number(input.maxHints);
      if (!Number.isInteger(maxHints) || maxHints < 0 || maxHints > 5) errors.push('adaptive-dialogue-max-hints-invalid');
      if (errors.length) return { version: VERSION, valid: false, errors, decision: null, selectedSupport: null, pendingSupports: [] };

      const stage = clean(input.stage), grade = clean(input.grade), subject = clean(input.subject);
      let move, reason, learnerPrompt, teacherAction;
      if (assessment === 'correct') {
        move = 'consolidate'; reason = 'assessment-correct';
        learnerPrompt = 'اشرح الدليل أو الخطوة التي ساعدتك على الوصول إلى الإجابة، ثم جرّب وضعية جديدة.';
        teacherAction = 'ثبّت التعلم واطلب تبريرًا أو نقلًا إلى وضعية جديدة.';
      } else if (assessment === 'unclear') {
        move = 'clarify'; reason = 'assessment-unclear';
        learnerPrompt = 'أعد صياغة فكرتك أو حدّد الجزء الذي تقصده حتى نفهم طريقة تفكيرك.';
        teacherAction = 'اطلب توضيحًا ولا تفترض أن الإجابة خاطئة.';
      } else if (assessment === 'partial') {
        if (hintCount < maxHints) {
          move = 'hint'; reason = 'partial-response-with-hint-capacity';
          learnerPrompt = 'أنت أنجزت جزءًا صحيحًا. راجع المعطيات وفكّر في الخطوة التالية.';
          teacherAction = 'قدّم تلميحًا واحدًا مرتبطًا بالخطوة التالية، دون كشف الحل كاملًا.';
        } else {
          move = 'worked_example'; reason = 'partial-response-hint-limit-reached';
          learnerPrompt = 'تابع المثال المحلول، ثم حاول إنجاز خطوة مماثلة بنفسك.';
          teacherAction = 'اعرض مثالًا محلولًا قصيرًا ثم أعد المسؤولية للمتعلم.';
        }
      } else {
        if (input.repeatedDifficulty === true || hintCount >= maxHints) {
          move = 'prerequisite_check'; reason = input.repeatedDifficulty === true ? 'repeated-difficulty-reported-by-host' : 'hint-limit-reached';
          learnerPrompt = 'لنتحقق أولًا من فكرة سابقة قد تساعدك على فهم هذه المهمة.';
          teacherAction = 'افحص المتطلب القبلي بسؤال تشخيصي قصير قبل متابعة الدرس.';
        } else {
          move = 'worked_example'; reason = 'incorrect-response-first-support';
          learnerPrompt = 'لنشاهد مثالًا محلولًا خطوة خطوة، ثم نجرب مثالًا قريبًا.';
          teacherAction = 'قدّم نموذجًا محلولًا واضحًا، مع تفسير سبب كل خطوة.';
        }
      }

      const supports = Array.isArray(input.supports) ? input.supports : [];
      const seen = new Set(), approved = [], pending = [], rejectedSupports = [];
      supports.forEach((support, index) => {
        const id = clean(support && support.id);
        const reasons = [];
        if (!id) reasons.push('support-id-required');
        else if (seen.has(id)) reasons.push('duplicate-support-id');
        if (!clean(support && support.title) || !clean(support && support.content)) reasons.push('support-title-and-content-required');
        if (!support || clean(support.move) !== move) reasons.push('support-move-mismatch');
        if (support && Array.isArray(support.assessments) && support.assessments.length && !support.assessments.includes(assessment)) reasons.push('support-assessment-mismatch');
        if (support && support.stage && stage && clean(support.stage) !== stage) reasons.push('support-stage-mismatch');
        if (support && support.grade && grade && clean(support.grade) !== grade) reasons.push('support-grade-mismatch');
        if (support && support.subject && subject && clean(support.subject) !== subject) reasons.push('support-subject-mismatch');
        if (support && !clean(support.sourceId)) reasons.push('support-source-required');
        if (id) seen.add(id);
        if (reasons.length) { rejectedSupports.push({ index, id: id || null, reasons }); return; }
        const item = { id, title: clean(support.title), content: clean(support.content), move,
          stage: clean(support.stage) || null, grade: clean(support.grade) || null,
          subject: clean(support.subject) || null, sourceId: clean(support.sourceId),
          page: Number.isInteger(Number(support.page)) && Number(support.page) > 0 ? Number(support.page) : null,
          reviewStatus: clean(support.reviewStatus) || 'pending' };
        if (item.reviewStatus === 'approved') approved.push(item);
        else pending.push(item);
      });
      const selectedSupport = approved[0] || null;
      return { version: VERSION, valid: true, assessment, context: { stage: stage || null, grade: grade || null, subject: subject || null },
        decision: { move, reason, hintCount, maxHints, repeatedDifficultyReported: input.repeatedDifficulty === true,
          teacherAction, learnerPrompt }, selectedSupport, pendingSupports: pending, rejectedSupports,
        requiresTeacherAuthoredSupport: !selectedSupport,
        policy: 'explicit-host-assessment; approved-support-only; stage-grade-subject-filtering; no-semantic-answer-grading',
        note: 'يختار المحرك نوع الخطوة الحوارية من تقييم صريح يقدمه الأستاذ أو التطبيق المضيف. لا يحلل نص إجابة المتعلم دلاليًا ولا يقرر صحتها، ولا يعرض موردًا غير معتمد بوصفه مساندة جاهزة.' };
    }

    function matchCurriculumQuestionBank(input){input=input&&typeof input==='object'?input:{};const rows=Array.isArray(input.questions)?input.questions:[],plan=input.plan&&input.plan.plan?input.plan.plan:input.plan||{},wanted=new Set((Array.isArray(input.objectiveIds)?input.objectiveIds:(Array.isArray(plan.outcomes)?plan.outcomes.map(x=>x.id):[])).map(clean)),stage=clean(input.stage||plan.stage),grade=clean(input.grade||plan.grade),subject=clean(input.subject||plan.subject),matches=[],rejected=[];rows.forEach((q,i)=>{const reasons=[];if(!q||!clean(q.id)||!clean(q.prompt))reasons.push('question-id-and-prompt-required');if(stage&&q.stage&&q.stage!==stage)reasons.push('stage-mismatch');if(grade&&q.grade&&q.grade!==grade)reasons.push('grade-mismatch');if(subject&&q.subject&&q.subject!==subject)reasons.push('subject-mismatch');const ids=(q&&Array.isArray(q.objectiveIds)?q.objectiveIds:[]).map(clean),overlap=ids.filter(id=>wanted.has(id));if(wanted.size&&!overlap.length)reasons.push('objective-not-matched');if(reasons.length){rejected.push({index:i,id:q&&q.id||null,reasons});return;}matches.push({id:clean(q.id),prompt:clean(q.prompt),type:clean(q.type)||'unspecified',points:Number(q.points)||null,objectiveIds:ids,matchedObjectiveIds:overlap,sourceId:clean(q.sourceId)||null,page:Number.isInteger(Number(q.page))&&Number(q.page)>0?Number(q.page):null,difficulty:clean(q.difficulty)||null});});matches.sort((a,b)=>b.matchedObjectiveIds.length-a.matchedObjectiveIds.length);return {version:VERSION,matches,rejected,totalMatched:matches.length,coverage:Array.from(wanted).map(id=>({objectiveId:id,questionCount:matches.filter(q=>q.matchedObjectiveIds.includes(id)).length})),note:'المطابقة وصفية وفق البيانات المدخلة؛ لا تتحقق من صحة السؤال أو مطابقته الرسمية للمنهاج.'};}

    function buildCurriculumLessonSequence(input){input=input&&typeof input==='object'?input:{};const objectives=Array.isArray(input.objectives)?input.objectives:[],activities=Array.isArray(input.activities)?input.activities:[],resources=Array.isArray(input.resources)?input.resources:[],duration=Number(input.durationMinutes),errors=[],warnings=[];if(!clean(input.stage))errors.push('lesson-sequence-stage-required');if(!clean(input.subject))errors.push('lesson-sequence-subject-required');if(!Number.isFinite(duration)||duration<=0)errors.push('lesson-sequence-duration-invalid');if(!objectives.length)errors.push('lesson-sequence-objectives-required');const ids=new Set(objectives.map(o=>clean(o.id)));if(objectives.some(o=>!clean(o.id)||!clean(o.description||o.text)))errors.push('lesson-sequence-objective-invalid');const rows=activities.map((a,i)=>({id:clean(a.id)||'activity-'+(i+1),title:clean(a.title)||'نشاط '+(i+1),type:clean(a.type)||'practice',durationMinutes:Math.max(0,Number(a.durationMinutes)||0),objectiveIds:(a.objectiveIds||[]).map(clean).filter(id=>ids.has(id)),resourceIds:(a.resourceIds||[]).map(clean),teacherNotes:clean(a.teacherNotes)}));if(rows.some(a=>!a.objectiveIds.length))warnings.push('activities-without-linked-objective');const allocated=rows.reduce((n,a)=>n+a.durationMinutes,0);if(allocated>duration)errors.push('lesson-sequence-activity-duration-exceeds-total');const covered=new Set(rows.reduce((a,x)=>a.concat(x.objectiveIds),[]));const uncovered=objectives.filter(o=>!covered.has(clean(o.id))).map(o=>clean(o.id));if(uncovered.length)warnings.push('objectives-without-activity:'+uncovered.join(','));const resourceIds=new Set(resources.map(r=>clean(r.id)));rows.forEach((a,i)=>a.resourceIds.forEach(id=>{if(!resourceIds.has(id))warnings.push('unknown-resource-reference:'+i+':'+id);}));return {version:VERSION,valid:!errors.length,errors,warnings,sequence:errors.length?null:{sequenceType:'teacher-authored-curriculum-lesson-sequence',stage:clean(input.stage),grade:clean(input.grade)||null,subject:clean(input.subject),term:clean(input.term)||null,durationMinutes:duration,objectives:objectives.map(o=>({id:clean(o.id),description:clean(o.description||o.text)})),activities:rows,resources:resources.map(r=>({id:clean(r.id),title:clean(r.title),sourceId:clean(r.sourceId)||null,page:r.page||null}))},coverage:{objectiveCount:objectives.length,coveredObjectives:objectives.length-uncovered.length,uncoveredObjectives:uncovered,allocatedMinutes:allocated,unallocatedMinutes:Math.max(0,duration-allocated)}};}

    function validateCurriculumResourceRights(input){input=input&&typeof input==='object'?input:{};const rows=Array.isArray(input.resources)?input.resources:[],items=[],errors=[],warnings=[];rows.forEach((r,i)=>{const reasons=[],status=clean(r&&r.rightsStatus)||'unknown',license=clean(r&&r.license),permission=clean(r&&r.permissionReference);if(!r||!clean(r.id))reasons.push('resource-id-required');if(!clean(r&&r.sourceId||r&&r.sourceTitle))reasons.push('resource-source-required');if(!['public_domain','open_license','permission_granted','owned','restricted','unknown'].includes(status))reasons.push('rights-status-invalid');if(['open_license','permission_granted'].includes(status)&&!license&&!permission)reasons.push('rights-evidence-required');if(status==='restricted')warnings.push('restricted-resource:'+clean(r&&r.id));if(status==='unknown')warnings.push('rights-unknown:'+clean(r&&r.id));items.push({id:clean(r&&r.id),sourceId:clean(r&&r.sourceId)||null,sourceTitle:clean(r&&r.sourceTitle)||null,rightsStatus:status,license:license||null,permissionReference:permission||null,attributionRequired:r&&r.attributionRequired===true,commercialUseAllowed:r&&r.commercialUseAllowed===true,eligibleForInternalReview:reasons.length===0&&status!=='restricted'&&status!=='unknown',eligibleForRedistribution:reasons.length===0&&['public_domain','open_license','permission_granted','owned'].includes(status),errors:reasons});if(reasons.length)errors.push({index:i,id:r&&r.id||null,reasons});});return {version:VERSION,valid:!errors.length,errors,warnings,resources:items,summary:{total:items.length,eligibleForInternalReview:items.filter(x=>x.eligibleForInternalReview).length,eligibleForRedistribution:items.filter(x=>x.eligibleForRedistribution).length,restricted:items.filter(x=>x.rightsStatus==='restricted').length,unknown:items.filter(x=>x.rightsStatus==='unknown').length},note:'هذه بوابة تنظيمية أولية وليست استشارة قانونية؛ لا تستنتج الملكية من وجود الملف أو من مصدره، ويجب التحقق من شروط الترخيص قبل النسخ أو النشر.'};}

    function auditCurriculumCoverage(input){input=input&&typeof input==='object'?input:{};const objectives=Array.isArray(input.objectives)?input.objectives:[],resources=Array.isArray(input.resources)?input.resources:[],activities=Array.isArray(input.activities)?input.activities:[],assessments=Array.isArray(input.assessments)?input.assessments:[],warnings=[],rows=objectives.map(o=>{const id=clean(o.id),rs=resources.filter(r=>(r.objectiveIds||[]).map(clean).includes(id)),as=activities.filter(a=>(a.objectiveIds||[]).map(clean).includes(id)),qs=assessments.filter(q=>(q.objectiveIds||[]).map(clean).includes(id));const gaps=[];if(!rs.length)gaps.push('resource');if(!as.length)gaps.push('activity');if(!qs.length)gaps.push('assessment');return {objectiveId:id,description:clean(o.description||o.text),resourceCount:rs.length,activityCount:as.length,assessmentCount:qs.length,covered:gaps.length===0,gaps};});const uncovered=rows.filter(r=>!r.covered);if(uncovered.length)warnings.push('objectives-with-coverage-gaps:'+uncovered.length);const score=rows.length?Math.round(rows.filter(r=>r.covered).length/rows.length*100):0;return {version:VERSION,auditType:'teacher-authored-curriculum-coverage-audit',context:{stage:clean(input.stage)||null,grade:clean(input.grade)||null,subject:clean(input.subject)||null,term:clean(input.term)||null},valid:rows.length>0,rows,summary:{objectives:rows.length,fullyCovered:rows.length-uncovered.length,withGaps:uncovered.length,coveragePercent:score,resources:resources.length,activities:activities.length,assessments:assessments.length},warnings,note:'نسبة التغطية حساب بنيوي وفق الروابط المدخلة فقط؛ لا تثبت جودة التدريس أو صحة المواءمة الرسمية مع المنهاج الجزائري.'};}

    // v1.72 unified semantic intelligence: compound tasks, concept-linked memory,
    // multilingual vector-index contracts, auditable reasoning, and one orchestrator.
    function decomposeCompoundQuestion(input) {
      input=input&&typeof input==='object'?input:{};const query=clean(input.query),language=['ar','fr','en'].includes(input.language)?input.language:detectSemanticLanguage(query);
      const clauses=query.split(/\s*(?:[؛;\n]+|ثم|بعد ذلك|كذلك|وأيضًا|بالإضافة إلى|مع ذكر|وقارن|ثم قارن|\bet puis\b|\bensuite\b|\bainsi que\b|\bcomparez aussi\b|\band then\b|\balso\b|\badditionally\b|\band compare\b|\bthen compare\b)\s*/i).map(clean).filter(Boolean);
      const base=classifySemanticIntent({query,language});
      const tasks=clauses.map((clause,index)=>{const intent=classifySemanticIntent({query:clause,language});return {id:'task-'+(index+1),order:index+1,query:clause,intents:intent.intents,primaryIntent:intent.primaryIntent||intent.intents[0]||'general',dependsOn:index?['task-'+index]:[],status:'planned'};});
      const all=Array.from(new Set(tasks.reduce((a,t)=>a.concat(t.intents),[]).concat(base.intents||[])));
      return {version:VERSION,language,query,tasks:tasks.length?tasks:[{id:'task-1',order:1,query,intents:base.intents,primaryIntent:base.primaryIntent||'general',dependsOn:[],status:'planned'}],intents:all,isMultiTask:tasks.length>1||all.length>1,executionPolicy:'preserve-order; resolve-prerequisites-before-dependent-tasks',limitations:['تقسيم المهام يعتمد على علامات لغوية وقواعد؛ قد يحتاج السؤال الملتبس إلى توضيح بشري.']};
    }
    function createSemanticMemoryV2(input) {
      input=input&&typeof input==='object'?input:{};const base=createSemanticMemory({entries:input.entries}),graph=buildSemanticKnowledgeGraph({concepts:input.concepts||[],relations:input.relations||[]});
      const byId=new Map(graph.nodes.map(n=>[n.id,n])),rawById=new Map((Array.isArray(input.entries)?input.entries:[]).map(e=>[clean(e&&e.id),e||{}]));const entries=base.entries.map(e=>{const raw=rawById.get(e.id)||{};return Object.assign({},e,{sourceTitle:clean(raw.sourceTitle)||null,page:Number.isInteger(Number(raw.page))&&Number(raw.page)>0?Number(raw.page):null,section:clean(raw.section)||null,provenance:raw.provenance&&typeof raw.provenance==='object'?raw.provenance:{},metadata:raw.metadata&&typeof raw.metadata==='object'?raw.metadata:{},conceptLinks:e.conceptIds.filter(id=>byId.has(id)).map(id=>({conceptId:id,label:byId.get(id).label})),relationHints:graph.edges.filter(edge=>e.conceptIds.includes(edge.from)||e.conceptIds.includes(edge.to)).map(edge=>({from:edge.from,to:edge.to,type:edge.type,source:edge.source}))});});
      return {version:VERSION,memoryType:'concept-linked-portable-semantic-memory',entries,conceptGraph:graph,rejected:base.rejected,stats:Object.assign({},base.stats,{linkedEntries:entries.filter(e=>e.conceptLinks.length).length}),persistence:'caller-managed; export/import and access control remain host responsibilities',privacy:'store only user-authorized learning records; no hidden memory writes'};
    }
    function retrieveSemanticMemoryV2(input) {
      input=input&&typeof input==='object'?input:{};const memory=input.memory||{},base=retrieveSemanticMemory({memory,query:input.query,conceptIds:input.conceptIds,limit:input.limit}),graph=memory.conceptGraph||{},seed=new Set(Array.isArray(input.conceptIds)?input.conceptIds.map(clean):[]),edges=Array.isArray(graph.edges)?graph.edges:[],related=[];
      edges.forEach(e=>{if(seed.has(e.from))related.push(e.to);if(e.direction==='undirected'&&seed.has(e.to))related.push(e.from);});const relatedSet=new Set(related);
      const expanded=(Array.isArray(memory.entries)?memory.entries:[]).filter(e=>!base.results.some(r=>r.id===e.id)&&(e.conceptIds||[]).some(id=>relatedSet.has(id))).map(e=>Object.assign({},e,{score:Math.max(1,Math.round(35/(1+(e.conceptIds||[]).filter(id=>relatedSet.has(id)).length-1))),matchType:'one-hop-explicit-concept-relation',matchedConceptIds:(e.conceptIds||[]).filter(id=>relatedSet.has(id))}));
      const results=base.results.map(e=>Object.assign({},e,{matchType:e.matchedConceptIds&&e.matchedConceptIds.length?'direct-concept-or-lexical':'lexical'})).concat(expanded).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id))).slice(0,Math.max(1,Math.min(50,Number(input.limit)||8)));
      return {version:VERSION,results,totalMatches:results.length,expandedByRelations:expanded.length,policy:'explicit-concepts-and-explicit-graph-edges-only; no automatic sensitive profiling'};
    }
    function createSemanticVectorIndex(input) {
      input=input&&typeof input==='object'?input:{};const provider=clean(input.provider),model=clean(input.model),modelVersion=clean(input.modelVersion)||null,rows=Array.isArray(input.items)?input.items:[],valid=[],rejected=[];let dimension=null;
      rows.forEach((row,i)=>{const v=row&&row.vector,reason=!clean(row&&row.id)?'item-id-required':!Array.isArray(v)||!v.length?'vector-required':v.some(x=>!Number.isFinite(Number(x)))?'vector-values-must-be-finite':dimension!==null&&v.length!==dimension?'vector-dimension-mismatch':null;
        if(reason){rejected.push({index:i,id:row&&row.id||null,reason});return;}if(dimension===null)dimension=v.length;valid.push({id:clean(row.id),vector:v.map(Number),text:clean(row.text),language:clean(row.language)||detectSemanticLanguage(row.text),sourceId:clean(row.sourceId)||null,sourceTitle:clean(row.sourceTitle)||null,page:Number.isInteger(Number(row.page))&&Number(row.page)>0?Number(row.page):null,metadata:row.metadata||{}});});
      return {version:VERSION,indexType:'multilingual-host-embedding-index',provider:provider||null,model:model||null,modelVersion,dimension,itemCount:valid.length,items:valid,rejected,ready:!!(provider&&model&&dimension&&valid.length),contract:{sameModelRequired:true,sameVersionRecommended:true,sameDimensionRequired:true,crossLanguageQualityDependsOnEmbeddingModel:true},note:'الفهرس لا يولد تضمينات. استخدم نموذج تضمين متعدد اللغات فعليًا، واحتفظ باسم المزود والنموذج والإصدار مع كل دفعة.'};
    }
    function searchSemanticVectorIndex(input) {
      input=input&&typeof input==='object'?input:{};const index=input.index||{},provider=clean(input.provider)||clean(index.provider),model=clean(input.model)||clean(index.model),version=clean(input.modelVersion)||clean(index.modelVersion);
      if(!index.ready)return {version:VERSION,valid:false,results:[],reason:'vector-index-not-ready'};
      if(provider!==clean(index.provider)||model!==clean(index.model))return {version:VERSION,valid:false,results:[],reason:'embedding-provider-or-model-mismatch'};
      if(version&&index.modelVersion&&version!==index.modelVersion)return {version:VERSION,valid:false,results:[],reason:'embedding-model-version-mismatch'};
      const result=searchSemanticVectors({queryVector:input.queryVector,items:index.items,limit:input.limit});const sourceRows=new Map(index.items.map(item=>[item.id,item]));result.results=result.results.map(row=>{const source=sourceRows.get(row.id)||{};return Object.assign({},row,{sourceTitle:source.sourceTitle||null,language:source.language||null,section:source.section||null});});
      return Object.assign({},result,{valid:result.rejected.length<index.items.length,provider:index.provider,model:index.model,modelVersion:index.modelVersion,dimension:index.dimension,multilingual:true,sourcePreservation:'sourceId/sourceTitle/page/language retained per result'});
    }
    function runUnifiedSemanticUnderstanding(input) {
      input=input&&typeof input==='object'?input:{};const query=clean(input.query),compound=decomposeCompoundQuestion({query,language:input.language}),memory=input.semanticMemory?retrieveSemanticMemoryV2({memory:input.semanticMemory,query,conceptIds:input.conceptIds,limit:input.memoryLimit}):null;
      const vectorSearch=input.vectorIndex?searchSemanticVectorIndex({index:input.vectorIndex,queryVector:input.queryVector,provider:input.embeddingProvider,model:input.embeddingModel,modelVersion:input.embeddingModelVersion,limit:input.vectorLimit}):null;
      const base=runSemanticPipeline(Object.assign({},input,{memory:undefined,vectorSearch:undefined}));
      const reasoning=runEducationalReasoning(Object.assign({},input,{query}));
      const consistency=validateSemanticConsistency({claims:Array.isArray(input.claims)?input.claims:[],evidence:Array.isArray(input.evidence)?input.evidence:[]});
      const tasks=compound.tasks.map(task=>({id:task.id,query:task.query,intents:task.intents,primaryIntent:task.primaryIntent,dependsOn:task.dependsOn,concepts:matchSemanticConcepts({query:task.query,language:compound.language,semanticLexicon:input.semanticLexicon,subject:input.subject,stage:input.stage})}));
      const reasoningReady=['derived-with-explicit-rules','no-supported-inference'].includes(reasoning.status);const ready=(!base.context.needsClarification)&&(!vectorSearch||vectorSearch.valid)&&(!consistency.unsupportedClaimIds.length)&&reasoningReady&&reasoning.status!=='review-contradictions';
      return {version:VERSION,pipeline:'unified-semantic-understanding-v1.72',query,language:compound.language,compound,baseUnderstanding:base,tasks,semanticMemory:memory,vectorSearch,reasoning,consistency,readiness:{ready,needsClarification:!!base.context.needsClarification,hasContradictions:!!(reasoning.chain&&reasoning.chain.contradictions&&reasoning.chain.contradictions.hasCandidates),reasoningStatus:reasoning.status,unsupportedClaims:consistency.unsupportedClaimIds,vectorIndexValid:vectorSearch?vectorSearch.valid:null},answerPolicy:!ready?'clarify-or-request-evidence-before-confident-answer':'answer-task-by-task-with-explicit-evidence-and-source-trace',limitations:['المنسق يجمع أدوات حتمية ومصادر يمررها المضيف؛ لا يحولها إلى نموذج لغوي مستقل.','نتائج التضمين تعتمد على نموذج المزود وجودة بياناته وتوافق إصداره.','فحص الاتساق وكشف التناقضات ترشيحيان ولا يثبتان حقيقة الوقائع.','التخزين الدائم والخصوصية والصلاحيات من مسؤولية التطبيق المضيف.']};
    }

    return Object.freeze({ auditCurriculumCoverage, validateCurriculumResourceRights, buildCurriculumLessonSequence, planAdaptiveDialogueMove, matchCurriculumQuestionBank, planLearningPrerequisitePath, planLearnerKnowledgeReview, buildTargetedRemediationPlan, createLearnerMisconceptionCatalog, matchLearnerMisconceptions, buildCurriculumEvidenceBundle, buildCurriculumSearchQuery, analyzeSemanticQuery, buildSemanticUnderstanding, analyzeSemanticMorphology, analyzeSemanticContext, classifySemanticIntent, matchSemanticConcepts, buildSemanticKnowledgeGraph, traceSemanticRelations, searchSemanticVectors, createSemanticMemory, retrieveSemanticMemory, validateSemanticConsistency, runSemanticPipeline,
      decomposeCompoundQuestion, createSemanticMemoryV2, retrieveSemanticMemoryV2, createSemanticVectorIndex, searchSemanticVectorIndex, runUnifiedSemanticUnderstanding, classifyReasoningClaims, decomposeReasoningQuestion, deriveExplicitRuleConclusions, detectSemanticContradictions, validateReasoningChain, evaluateReasoningSufficiency, buildEducationalReasoningChain, runEducationalReasoning, buildGroundedTeachingContext, createLearningObjectiveMap, validateLearningObjectiveMap, summarizeLearningObjectiveMap, createLearningKnowledgeGraph, validateLearningKnowledgeGraph, summarizeLearningKnowledgeGraph, traceLearningKnowledgePath, getLearningKnowledgeNeighborhood, planLesson, feedback, diagnose, chooseNextStep, hintLadder, questioning, structureExplanation, assessChecklist, evaluatePedagogicalResponse, createLearnerProfile, recordLearningEvidence, adaptNextStep, createLearningMemory, addLearningMemoryEvidence, validateLearningMemory, summarizeLearningMemory, exportLearningMemory, importLearningMemory, mergeLearningMemories, analyzeLearningGaps, createPracticeSequence, currentPracticeTask, gradePracticeTask, analyzeLearnerErrors, createConceptDiscoveryPath, currentDiscoveryStep, submitConceptDiscoveryStep, createProjectBasedLearningPlan, currentProjectMilestone, submitProjectMilestone, projectProgress, evaluateProjectMilestone, summarizeProjectEvaluations, createCompetencyProfile, recordCompetencyEvidence, summarizeCompetencyProgress, createPersonalLearningPathway, currentPersonalLearningStep, submitPersonalLearningStep, summarizePersonalLearningPathway, chooseAdaptivePathwayRoute, planSpacedReviews, summarizeMasteryEvidence, adaptInstructionalFormat, createMultilingualTeachingFrame, createTeacherObservationChecklist, formCollaborativeGroups, createFamilyProgressReport, matchLearningResources, prepareCurriculumResource, validateCurriculumResource, searchCurriculumResources, matchAssessmentPlanResources, prepareLearningContentUnit, validateLearningContentUnit, createLearningContentMap, summarizeLearningContentMap, prepareCurriculumImport, validateCurriculumImport, buildCurriculumImportBatch, reviewCurriculumImportItem, summarizeCurriculumImportBatch, prepareLearningContentChunks, validateLearningContentChunks, summarizeLearningContentChunks, createLearningContentIndex, validateLearningContentIndex, searchLearningContentIndex, summarizeLearningContentIndex, contentChunkKinds: Object.freeze(contentChunkKinds.slice()), curriculumImportFormats: Object.freeze(curriculumImportFormats.slice()), curriculumResourceTypes: Object.freeze(curriculumResourceTypes.slice()), createFormativeAssessmentCycle, completeFormativeAssessmentCycle, prepareAssessmentBlueprint, validateAssessmentBlueprint, createAssessmentBlueprint, summarizeAssessmentBlueprint, prepareCurriculumAssessmentPlan, validateCurriculumAssessmentPlan, createCurriculumAssessmentPlan, summarizeCurriculumAssessmentPlan, prepareAssessmentRubric, validateAssessmentRubric, createAssessmentRubric, evaluateAssessmentRubric, summarizeAssessmentRubricEvaluations, validateLearningPathwayPackage, createDialogueTutor, submitDialogueTurn, submitAdaptiveDialogueTurn, evaluationRubric: Object.freeze(evaluationRubric.map(x => Object.freeze(Object.assign({}, x)))), createSession, currentTurn, submitResponse, sessionSummary, stages: Object.freeze({ primary: 'ابتدائي', middle: 'متوسط', secondary: 'ثانوي' }), subjectFamilies: Object.freeze(['mathematics', 'sciences', 'languages', 'humanities', 'technology', 'arts', 'general']) });
  }

  function trainingDataEngine() {
    const stages = ['primary', 'middle', 'secondary', 'all'];
    const sourceKinds = ['video', 'official_document', 'teacher_observation', 'synthetic'];
    const rightsBases = ['permission', 'license', 'public_domain', 'user_owned', 'transformative_observation', 'synthetic'];
    const skills = ['lesson-opening', 'concept-building', 'explanation', 'questioning', 'reasoning', 'problem-solving', 'error-feedback', 'differentiation', 'assessment', 'transfer', 'classroom-management'];
    const text = value => clean(value).replace(/\s+/g, ' ');
    function validateExample(example) {
      const e = example && typeof example === 'object' ? example : {};
      const src = e.source && typeof e.source === 'object' ? e.source : {};
      const rights = e.rights && typeof e.rights === 'object' ? e.rights : {};
      const review = e.review && typeof e.review === 'object' ? e.review : {};
      const errors = [], warnings = [];
      if (!text(e.id)) errors.push('id-required');
      if (!stages.includes(text(e.stage))) errors.push('stage-invalid');
      if (!text(e.subject)) errors.push('subject-required');
      if (!skills.includes(text(e.skill))) errors.push('skill-invalid');
      if (text(e.instruction).length < 12) errors.push('instruction-too-short');
      if (text(e.response).length < 20) errors.push('response-too-short');
      if (!sourceKinds.includes(text(src.kind))) errors.push('source-kind-invalid');
      if (['video', 'official_document'].includes(text(src.kind)) && !/^https?:\/\//i.test(text(src.url))) errors.push('source-url-required');
      if (!text(src.evidenceNote) || text(src.evidenceNote).length < 20) errors.push('source-evidence-note-required');
      if (!rightsBases.includes(text(rights.basis))) errors.push('rights-basis-invalid');
      if (text(src.kind) === 'synthetic' && text(rights.basis) !== 'synthetic') errors.push('synthetic-rights-mismatch');
      if (text(src.kind) !== 'synthetic' && text(rights.basis) === 'synthetic') errors.push('source-rights-mismatch');
      if (text(review.status) !== 'approved') errors.push('human-review-required');
      if (!text(review.reviewer) || !text(review.reviewedAt)) errors.push('review-metadata-required');
      if (text(e.response).length > 5000) warnings.push('response-long-review-for-copyright-and-quality');
      if (/\[[^\]]{0,30}(اسم|هاتف|عنوان|رقم التلميذ)[^\]]*\]/i.test(text(e.instruction) + ' ' + text(e.response))) warnings.push('check-personal-data');
      return { valid: errors.length === 0, errors, warnings };
    }
    function prepareExample(input) {
      const e = input && typeof input === 'object' ? input : {};
      const src = e.source && typeof e.source === 'object' ? e.source : {};
      const rights = e.rights && typeof e.rights === 'object' ? e.rights : {};
      const review = e.review && typeof e.review === 'object' ? e.review : {};
      return {
        id: text(e.id), stage: text(e.stage), subject: text(e.subject), grade: text(e.grade) || null,
        skill: text(e.skill), language: text(e.language) || 'ar',
        instruction: text(e.instruction), response: text(e.response),
        source: { kind: text(src.kind), url: text(src.url) || null, title: text(src.title) || null, channel: text(src.channel) || null, educator: text(src.educator) || null, inspectedAt: text(src.inspectedAt) || null, evidenceNote: text(src.evidenceNote) },
        rights: { basis: text(rights.basis), note: text(rights.note) || null },
        review: { status: text(review.status), reviewer: text(review.reviewer), reviewedAt: text(review.reviewedAt), note: text(review.note) || null }
      };
    }
    function buildDataset(examples, options) {
      options = options || {};
      const rows = Array.isArray(examples) ? examples : [];
      const accepted = [], rejected = [], warnings = [], seenIds = new Set(), seenPairs = new Set();
      rows.forEach((row, index) => {
        const normalized = prepareExample(row), check = validateExample(normalized);
        const pairKey = [normalized.stage, normalized.subject, normalized.skill, normalized.instruction, normalized.response].join('|').toLowerCase();
        if (check.valid && (options.allowSynthetic === true || normalized.source.kind !== 'synthetic') && !seenIds.has(normalized.id) && !seenPairs.has(pairKey)) {
          seenIds.add(normalized.id); seenPairs.add(pairKey);
          accepted.push(normalized);
          if (check.warnings.length) warnings.push({ id: normalized.id, warnings: check.warnings });
        } else rejected.push({ index, id: normalized.id || null, errors: check.errors.concat(normalized.source.kind === 'synthetic' && options.allowSynthetic !== true ? ['synthetic-excluded-by-default'] : []).concat(seenIds.has(normalized.id) ? ['duplicate-id'] : []).concat(seenPairs.has(pairKey) ? ['duplicate-example'] : []) });
      });
      return { version: VERSION, examples: accepted, rejected, warnings, stats: { input: rows.length, accepted: accepted.length, rejected: rejected.length, byStage: accepted.reduce((a, x) => (a[x.stage] = (a[x.stage] || 0) + 1, a), {}), bySkill: accepted.reduce((a, x) => (a[x.skill] = (a[x.skill] || 0) + 1, a), {}) }, note: 'هذا إعداد وتنقية لبيانات التدريب فقط؛ لا ينفذ تدريب أوزان نموذج لغوي.' };
    }
    function splitDataset(examples, ratios) {
      const rows = Array.isArray(examples) ? examples.slice() : [];
      ratios = ratios || {};
      const trainRatio = ratios.train == null ? 0.8 : Number(ratios.train);
      const validationRatio = ratios.validation == null ? 0.1 : Number(ratios.validation);
      const testRatio = ratios.test == null ? 0.1 : Number(ratios.test);
      if (![trainRatio, validationRatio, testRatio].every(x => Number.isFinite(x) && x >= 0) || Math.abs(trainRatio + validationRatio + testRatio - 1) > 1e-9) throw Error('split-ratios-must-sum-to-one');
      const buckets = { train: [], validation: [], test: [] };
      rows.forEach(row => {
        const id = text(row && row.id);
        let hash = 2167;
        for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
        const point = hash % 10000 / 10000;
        buckets[point < trainRatio ? 'train' : point < trainRatio + validationRatio ? 'validation' : 'test'].push(row);
      });
      return { train: buckets.train, validation: buckets.validation, test: buckets.test, ratios: { train: trainRatio, validation: validationRatio, test: testRatio }, note: 'تقسيم حتمي حسب المعرّف؛ مع مجموعات صغيرة قد لا تتطابق النسب الفعلية تمامًا.' };
    }
    function toChatJSONL(examples, options) {
      options = options || {};
      const rows = Array.isArray(examples) ? examples : [];
      return rows.map(row => {
        const e = prepareExample(row), check = validateExample(e);
        if (e.source.kind === 'synthetic' && options.allowSynthetic !== true) throw Error('synthetic-example-export-disabled:' + e.id);
        if (!check.valid) throw Error('invalid-training-example:' + e.id + ':' + check.errors.join(','));
        const system = 'أنت معلّم جزائري متمكن. راعِ طور المتعلم ومادته، ووجّه تفكيره بأسئلة وتلميحات متدرجة، واشرح المبررات التعليمية القابلة للتحقق، ولا تخترع مرجعية رسمية أو نتيجة غير مسندة.';
        const user = 'الطور: ' + e.stage + '\nالمادة: ' + e.subject + (e.grade ? '\nالمستوى: ' + e.grade : '') + '\nالمهارة التدريسية: ' + e.skill + '\nالمطلوب: ' + e.instruction;
        return JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }, { role: 'assistant', content: e.response }] });
      }).join('\n');
    }

    // Evidence-first video observation workflow. Catalogue metadata is never treated as
    // proof of what the teacher actually did in the video.
    const observationEvidenceTypes = ['video_segment', 'transcript_segment', 'teacher_observation', 'platform_metadata'];
    const reviewStatuses = ['pending', 'approved', 'rejected'];
    function prepareObservation(input) {
      const o = input && typeof input === 'object' ? input : {};
      const src = o.source && typeof o.source === 'object' ? o.source : {};
      const ev = o.evidence && typeof o.evidence === 'object' ? o.evidence : {};
      const review = o.review && typeof o.review === 'object' ? o.review : {};
      const num = v => v == null || v === '' ? null : Number(v);
      return {
        id: text(o.id), stage: text(o.stage), subject: text(o.subject), grade: text(o.grade) || null,
        skill: text(o.skill),
        source: { url: text(src.url), title: text(src.title), channel: text(src.channel), educator: text(src.educator) || null,
          evidenceType: text(src.evidenceType), startSeconds: num(src.startSeconds), endSeconds: num(src.endSeconds), transcriptRef: text(src.transcriptRef) || null },
        evidence: { note: text(ev.note), teacherAction: text(ev.teacherAction), learnerAction: text(ev.learnerAction),
          questionPattern: text(ev.questionPattern), feedbackPattern: text(ev.feedbackPattern), transferPattern: text(ev.transferPattern) },
        principle: text(o.principle), generalizableBehavior: text(o.generalizableBehavior),
        review: { status: text(review.status) || 'pending', reviewer: text(review.reviewer), reviewedAt: text(review.reviewedAt), note: text(review.note) || null }
      };
    }
    function validateObservation(input) {
      const o = prepareObservation(input), errors = [], warnings = [];
      if (!o.id) errors.push('observation-id-required');
      if (!stages.includes(o.stage)) errors.push('observation-stage-invalid');
      if (!o.subject) errors.push('observation-subject-required');
      if (!skills.includes(o.skill)) errors.push('observation-skill-invalid');
      if (!/^https?:\/\//i.test(o.source.url)) errors.push('observation-source-url-required');
      if (!o.source.title || !o.source.channel) errors.push('observation-source-metadata-required');
      if (!observationEvidenceTypes.includes(o.source.evidenceType)) errors.push('observation-evidence-type-invalid');
      if (o.evidence.note.length < 30) errors.push('observation-evidence-note-too-short');
      if (o.evidence.teacherAction.length < 12) errors.push('observation-teacher-action-required');
      if (o.principle.length < 15 || o.generalizableBehavior.length < 15) errors.push('observation-generalization-required');
      if (o.source.evidenceType === 'video_segment' && (!Number.isFinite(o.source.startSeconds) || !Number.isFinite(o.source.endSeconds) || o.source.startSeconds < 0 || o.source.endSeconds <= o.source.startSeconds)) errors.push('video-segment-timecodes-required');
      if (o.source.evidenceType === 'transcript_segment' && !o.source.transcriptRef) errors.push('transcript-reference-required');
      if (!reviewStatuses.includes(o.review.status)) errors.push('observation-review-status-invalid');
      if (o.source.evidenceType === 'platform_metadata') {
        warnings.push('metadata-only-not-evidence-of-video-teaching-practice');
        if (o.review.status === 'approved') errors.push('metadata-only-cannot-be-approved-for-training');
      }
      if (o.review.status === 'approved' && (!o.review.reviewer || !o.review.reviewedAt)) errors.push('observation-human-review-required');
      if (o.review.status === 'approved' && !['video_segment', 'transcript_segment', 'teacher_observation'].includes(o.source.evidenceType)) errors.push('direct-evidence-required-for-training');
      return { valid: errors.length === 0, errors, warnings, eligibleForTraining: errors.length === 0 && o.review.status === 'approved' && ['video_segment', 'transcript_segment', 'teacher_observation'].includes(o.source.evidenceType) };
    }
    function buildObservationRegister(observations) {
      const rows = Array.isArray(observations) ? observations : [], accepted = [], rejected = [], seen = new Set();
      rows.forEach((row, index) => {
        const item = prepareObservation(row), check = validateObservation(item);
        if (check.valid && !seen.has(item.id)) { seen.add(item.id); accepted.push(item); }
        else rejected.push({ index, id: item.id || null, errors: check.errors.concat(seen.has(item.id) ? ['duplicate-observation-id'] : []) });
      });
      const eligible = accepted.filter(x => validateObservation(x).eligibleForTraining);
      return { version: VERSION, observations: accepted, rejected, eligibleForTraining: eligible.length,
        stats: { input: rows.length, accepted: accepted.length, rejected: rejected.length,
          byStage: accepted.reduce((a,x) => (a[x.stage]=(a[x.stage]||0)+1,a), {}),
          bySubject: accepted.reduce((a,x) => (a[x.subject]=(a[x.subject]||0)+1,a), {}),
          bySkill: accepted.reduce((a,x) => (a[x.skill]=(a[x.skill]||0)+1,a), {}),
          metadataOnly: accepted.filter(x => x.source.evidenceType === 'platform_metadata').length },
        note: 'لا تصبح الملاحظة صالحة للتدريب إلا بعد مراجعة بشرية ودليل مباشر من مقطع أو تفريغ أو مشاهدة موثقة.' };
    }
    function observationCoverage(observations) {
      const rows = (Array.isArray(observations) ? observations : []).map(prepareObservation);
      const counts = { primary: 0, middle: 0, secondary: 0, all: 0 }, subjects = {}, skillsByStage = {};
      rows.forEach(o => { counts[o.stage] = (counts[o.stage] || 0) + 1; subjects[o.subject] = (subjects[o.subject] || 0) + 1; const k = o.stage + ':' + o.skill; skillsByStage[k] = (skillsByStage[k] || 0) + 1; });
      return { total: rows.length, byStage: counts, bySubject: subjects, byStageAndSkill: skillsByStage,
        gaps: ['primary','middle','secondary'].filter(stage => !rows.some(o => o.stage === stage)), note: 'التغطية تقيس عدد الملاحظات المسجلة فقط، ولا تثبت تمثيل جميع المواد أو جودة الممارسة.' };
    }
    // Convert approved, evidence-backed observations into reviewable training drafts.
    // Drafts remain pending and cannot be exported until a separate human approval.
    function draftExamplesFromObservations(observations) {
      const rows = Array.isArray(observations) ? observations : [], drafts = [], rejected = [], seen = new Set();
      rows.forEach((row, index) => {
        const o = prepareObservation(row), check = validateObservation(o);
        if (!check.valid || !check.eligibleForTraining) {
          rejected.push({ index, id: o.id || null, errors: check.errors.concat(!check.eligibleForTraining && check.valid ? ['observation-not-approved-or-no-direct-evidence'] : []) });
          return;
        }
        if (seen.has(o.id)) { rejected.push({ index, id: o.id, errors: ['duplicate-observation-id'] }); return; }
        seen.add(o.id);
        const evidenceNote = 'ملاحظة موثقة من مصدر مباشر: ' + o.evidence.note + ' فعل الأستاذ: ' + o.evidence.teacherAction + (o.evidence.learnerAction ? ' استجابة المتعلم: ' + o.evidence.learnerAction : '');
        drafts.push({
          id: 'draft-' + o.id, stage: o.stage, subject: o.subject, grade: o.grade, skill: o.skill, language: 'ar',
          instruction: 'درّب المعلّم الذكي على تطبيق المبدأ التالي في درس ' + o.subject + ': ' + o.principle,
          response: o.generalizableBehavior + ' ويُراعى أن يكون هذا السلوك مناسبًا لسياق الدرس ومستوى المتعلم، مع التحقق من فهمه قبل الانتقال.',
          source: { kind: 'teacher_observation', url: o.source.url, title: o.source.title, channel: o.source.channel, educator: o.source.educator, inspectedAt: o.review.reviewedAt, evidenceNote },
          rights: { basis: 'transformative_observation', note: 'صياغة تعليمية أصلية مستخلصة من ملاحظة موثقة؛ لا تتضمن نسخًا مطولًا من الفيديو أو التفريغ.' },
          review: { status: 'pending', reviewer: '', reviewedAt: '', note: 'مسودة مشتقة من ملاحظة معتمدة؛ تتطلب مراجعة مستقلة قبل إدخالها في بيانات التدريب.' }
        });
      });
      return { version: VERSION, drafts, rejected, stats: { input: rows.length, drafts: drafts.length, rejected: rejected.length, awaitingHumanApproval: drafts.length }, note: 'هذه مسودات تدريب وليست بيانات معتمدة. يجب مراجعة كل مسودة واعتمادها بشكل مستقل قبل buildDataset أو التصدير.' };
    }
    return Object.freeze({ skills: Object.freeze(skills.slice()), validateExample, prepareExample, buildDataset, splitDataset, toChatJSONL,
      prepareObservation, validateObservation, buildObservationRegister, observationCoverage, draftExamplesFromObservations,
      observationEvidenceTypes: Object.freeze(observationEvidenceTypes.slice()), stages: Object.freeze(stages.slice()), sourceKinds: Object.freeze(sourceKinds.slice()), rightsBases: Object.freeze(rightsBases.slice()) });
  }

  function health() {
    const m = modules();
    return { version: VERSION, target: 'SM éducation / Capacitor 7', ready: !!(m.core || m.kb), adapters: { smartTeacherCore: !!m.core, tutorKnowledgeBase: !!m.kb, textbookKnowledge: !!m.books, textbookLibrary: !!m.library }, nativeInference: 'optional-not-installed', serverOwnedByHost: true };
  }
  return Object.freeze({ version: VERSION, health, retrieve, answer, training: trainingDataEngine(), pedagogy: pedagogyEngine(), curriculum: mathCurriculum(), advanced: Object.freeze(Object.assign({}, advancedMath(), { complex: complexMath(), probability: probabilityMath() })), math: Object.freeze({ evaluate: arithmetic, fraction, compareFraction, derivative, evaluatePolynomial, derivativeAt, solveLinear, solveQuadratic, solvePolynomial, solveQuadraticInequality, createExercise, gradeExercise, solveInequality, solveLinearSystem, diagnoseLinearSteps, symbolic: symbolicAlgebra(), geometry: geometry(), analyticGeometry: analyticGeometry(), vectors: vectorMath(), solids: solidGeometry(), geometryProofs: geometryProofs(), compareNumeric, integratePolynomial, solveQuadraticComplex, functionAnalysis: functionAnalysis(), generalFunctionAnalysis: generalFunctionAnalysis() }), tokenize });
});
