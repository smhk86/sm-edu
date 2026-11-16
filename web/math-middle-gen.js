/* مولّد رياضيات المتوسط (1AM, 3AM, 4AM) — أنماط مأخوذة من عيّنات فروض الفصل الثاني.
   الواجهة: SMMathMiddle.generate(grade, count, rng?) -> [{q, a, steps, type}] */
(function (root) {
  function mk(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const sup = n => String(n).replace(/-/g, '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  const sg = (n, first) => (n < 0 ? '- ' : first ? '' : '+ ') + (Math.abs(n));
  function lin(a, b) { // ax + b
    const ax = a === 1 ? 'x' : a === -1 ? '-x' : a + 'x';
    return b === 0 ? ax : ax + (b < 0 ? ' - ' : ' + ') + Math.abs(b);
  }
  function quad(a, b, c) {
    let s = (a === 1 ? '' : a === -1 ? '-' : a) + 'x²';
    if (b) s += (b < 0 ? ' - ' : ' + ') + (Math.abs(b) === 1 ? '' : Math.abs(b)) + 'x';
    if (c) s += (c < 0 ? ' - ' : ' + ') + Math.abs(c);
    return s;
  }
  const G = {};

  // ---- 1AM ----
  G.div = r => { // قابلية القسمة
    const n = ri(r, 1000, 99999), ds = [2, 3, 4, 5, 9];
    const ok = ds.filter(d => n % d === 0);
    return { type: 'divisibility', q: `من بين الأعداد 2 و3 و4 و5 و9، عيّن الأعداد التي يقبل ${n} القسمة عليها.`,
      a: ok.length ? ok.join('، ') : 'لا شيء', steps: ds.map(d => `${n} ÷ ${d}: ${n % d === 0 ? 'يقبل القسمة' : 'باقي ' + (n % d)}`) };
  };
  G.euclid = r => {
    const b = ri(r, 3, 9), q = ri(r, 20, 400), rem = ri(r, 0, b - 1), a = b * q + rem;
    return { type: 'euclid', q: `أنجز القسمة الإقليدية للعدد ${a} على ${b}.`, a: `${a} = ${b} × ${q} + ${rem}`,
      steps: [`الحاصل ${q} والباقي ${rem} (والباقي أصغر من ${b})`] };
  };
  G.decdiv = r => {
    const b = pick(r, [3, 7, 9]); let a = ri(r, 100, 999); if (a % b === 0) a += 1; const v = a / b;
    return { type: 'decimal-div', q: `أوجد القيمة المقرّبة إلى 0.1 بالنقصان والزيادة لحاصل قسمة ${a} على ${b}.`,
      a: `${(Math.floor(v * 10) / 10).toFixed(1)} بالنقصان و ${(Math.ceil(v * 10) / 10).toFixed(1)} بالزيادة`, steps: [`${a} ÷ ${b} ≈ ${v.toFixed(4)}`] };
  };
  G.angle = r => {
    const a = ri(r, 2, 8) * 10, b = ri(r, 2, 8) * 10;
    return { type: 'angle-sum', q: `النقاط A وO وC على استقامة واحدة، والنقطة B خارجها، حيث قيس ROA = ${a}° وقيس KOC = ${b}° و[OR) و[OK) على جهة واحدة من (AC). أحسب قيس الزاوية ROK.`,
      a: `${180 - a - b}°`, steps: [`180° - ${a}° - ${b}° = ${180 - a - b}°`] };
  };

  // ---- 3AM ----
  G.sci = r => {
    const m = ri(r, 101, 999) / 10, e = ri(r, 2, 6), neg = r() < .5, ex = neg ? -e : e;
    const num = `${m}×10${sup(ex)}`, mm = Math.round(m * 10) / 100;
    return { type: 'scientific', q: `اكتب العدد ${num} كتابة علمية.`, a: `${mm}×10${sup(ex + 1)}`,
      steps: [`الكتابة العلمية: a×10ⁿ حيث 1 ≤ a < 10`, `${m} = ${mm} × 10`, `إذن ${num} = ${mm} × 10${sup(ex + 1)}`], _chk: [mm, ex + 1, m, ex] };
  };
  G.power = r => {
    const b = ri(r, 2, 5), m = ri(r, 2, 6), n = ri(r, 2, 6), k = ri(r, 1, m + n - 1);
    return { type: 'power-simplify', q: `اكتب على شكل قوة واحدة: (${b}${sup(m)} × ${b}${sup(n)}) ÷ ${b}${sup(k)}`, a: `${b}${sup(m + n - k)}`,
      steps: [`${b}${sup(m)} × ${b}${sup(n)} = ${b}${sup(m + n)}`, `${b}${sup(m + n)} ÷ ${b}${sup(k)} = ${b}${sup(m + n - k)}`], _chk: [b, m + n - k] };
  };
  G.exprInt = r => {
    const a = ri(r, 2, 5), b = ri(r, 2, 4), c = ri(r, 2, 4), d = ri(r, 2, 4);
    const v = Math.pow(-a, 2) + Math.pow(b * c, 1) * 0 + Math.pow(c, 2) * d - Math.pow(b, 2);
    return { type: 'numeric-expr', q: `أحسب: M = (-${a})² + ${c}² × ${d} - ${b}²`, a: String(v),
      steps: [`(-${a})² = ${a * a}`, `${c}² × ${d} = ${c * c * d}`, `${b}² = ${b * b}`, `${a * a} + ${c * c * d} - ${b * b} = ${v}`] };
  };
  G.frame = r => {
    const x = ri(r, 1000, 99999) / 100, lo = Math.floor(x * 10) / 10;
    return { type: 'frame', q: `أعطِ حصراً للعدد ${x} بين عددين عشريين متتاليين طول كل منهما 0.1.`,
      a: `${lo.toFixed(1)} < ${x} < ${(lo + .1).toFixed(1)}`, steps: [`${lo.toFixed(1)} ≤ ${x} < ${(lo + .1).toFixed(1)}`] };
  };

  // ---- 4AM ----
  G.expandSq = r => {
    const a = ri(r, 1, 4), b = ri(r, 1, 6), s = r() < .5 ? 1 : -1;
    const e = quad(a * a, 2 * a * b * s, b * b);
    return { type: 'identity', q: `انشر ثم بسّط: (${lin(a, s * b)})²`, a: e,
      steps: [`(A ${s > 0 ? '+' : '-'} B)² = A² ${s > 0 ? '+' : '-'} 2AB + B²`, `A = ${a === 1 ? '' : a}x ، B = ${b}`], _chk: [a, s * b] };
  };
  G.factorSq = r => {
    const a = ri(r, 1, 4), b = ri(r, 1, 6), c = ri(r, 1, 5);
    const e = quad(a * a, 2 * a * b, b * b - c * c);
    return { type: 'factor', q: `حلّل إلى جداء عاملين: E = ${e}`,
      a: `(${lin(a, b + c)})(${lin(a, b - c)})`.replace(/\+ -/g, '- '),
      steps: [`E = (${lin(a, b)})² - ${c}² (فرق مربعين)`, `= (${lin(a, b)} - ${c})(${lin(a, b)} + ${c})`], _chk: [a, b, c] };
  };
  G.solveProd = r => {
    const p = ri(r, 1, 7) * (r() < .5 ? 1 : -1), q = ri(r, 1, 7) * (r() < .5 ? 1 : -1);
    return { type: 'quadratic-roots', q: `حلّ المعادلة: ${quad(1, p + q, p * q)} = 0 (حلّلها أولاً).`, a: p === q ? `x = ${-p}` : `x = ${-p} أو x = ${-q}`,
      steps: [`${quad(1, p + q, p * q)} = ${'(x ' + (p < 0 ? '- ' : '+ ') + Math.abs(p) + ')(x ' + (q < 0 ? '- ' : '+ ') + Math.abs(q) + ')'}`] };
  };
  G.rect = r => {
    const w = ri(r, 10, 40), k = ri(r, 2, 9), l = 2 * w - k, per = 2 * (l + w);
    return { type: 'rect-system', q: `قطعة أرض مستطيلة محيطها ${per} م، وطولها يساوي ضعف عرضها ناقصاً ${k} أمتار. أوجد بعديها ثم مساحتها.`,
      a: `الطول ${l} م، العرض ${w} م، المساحة ${l * w} م²`, steps: [`ليكن العرض x فالطول 2x - ${k}`, `2(3x - ${k}) = ${per} ⇒ x = ${w}`, `${l} × ${w} = ${l * w}`] };
  };
  G.vec = r => ({ type: 'vector-chasing', q: 'بسّط: AC→ - MC→ + BM→ (حيث A وB وC وM نقاط من المستوي)', a: 'AB→ + ... = AM→ + BM→ = BM→ + AM→', steps: ['AC→ - MC→ = AC→ + CM→ = AM→'] });

  // ---- 2AM ----
  G.order = r => { // [a + (b - c × d)] ÷ e
    const c = ri(r, 2, 6), d = ri(r, 2, 5), b = c * d + ri(r, 1, 15), e = ri(r, 2, 5), diff = b - c * d;
    const k = Math.ceil((diff + 1) / e) + ri(r, 0, 5), a = k * e - diff, inner = b - c * d, mid = a + inner;
    return { type: 'order-of-ops', q: `احسب بتمعن: B = [${a} + (${b} - ${c} × ${d})] ÷ ${e}`, a: String(mid / e),
      steps: [`${c} × ${d} = ${c * d}`, `${b} - ${c * d} = ${inner}`, `${a} + ${inner} = ${mid}`, `${mid} ÷ ${e} = ${mid / e}`] };
  };
  G.relative = r => {
    const n = ri(r, 4, 5), t = []; let v = 0, str = '';
    for (let i = 0; i < n; i++) {
      const x = ri(r, 2, 25), pos = r() < .5, op = i === 0 ? 1 : (r() < .5 ? 1 : -1);
      v += op * (pos ? x : -x);
      str += (i === 0 ? '' : op > 0 ? ' + ' : ' - ') + `(${pos ? '+' : '-'}${x})`;
    }
    return { type: 'relative-numbers', q: `احسب: C = ${str}`, a: String(v), steps: ['نحوّل الطرح إلى جمع بمعاكس العدد ثم نجمع الأعداد الموجبة والسالبة'] };
  };
  G.decdiv2 = r => {
    let A = ri(r, 101, 999), B = ri(r, 2, 9);
    if (A % B === 0) A += 1;
    const tf = Math.floor(A / B), uf = Math.floor(A / (10 * B));
    return { type: 'decimal-div-approx', q: `أنجز قسمة ${(A / 100).toFixed(2)} على ${(B / 10).toFixed(1)}. أعطِ قيمة مقرّبة إلى الوحدة بالنقصان وبالزيادة، وقيمة مقرّبة إلى 0.1 بالنقصان وبالزيادة.`,
      a: `إلى الوحدة: ${uf} و ${uf + 1} ؛ إلى 0.1: ${(tf / 10).toFixed(1)} و ${((tf + 1) / 10).toFixed(1)}`,
      steps: [`${(A / 100).toFixed(2)} ÷ ${(B / 10).toFixed(1)} = ${(A / (10 * B)).toFixed(4)}...`, 'الحاصل ليس عدداً عشرياً لأن القسمة لا تنتهي'], _chk: [A, B] };
  };
  G.shares = r => {
    const [p1, q1, p2, q2] = pick(r, [[2, 3, 1, 6], [1, 2, 1, 4], [3, 5, 1, 10], [1, 3, 1, 4], [2, 5, 1, 4], [1, 2, 1, 5]]);
    const L = q1 * q2 / gcd(q1, q2), den = L * 1, n1 = p1 * den / q1, n2 = p2 * den / q2, n3 = den - n1 - n2;
    const unit = ri(r, 10, 90) * 1000 / (r() < .5 ? 1 : 1), T = den * (unit / gcd(unit, 1000) || 1) * 100;
    const part = x => x * T / den;
    return { type: 'fraction-shares', q: `في شركة ثلاثة شركاء اقتسموا فوائدها: حصة الأول ${p1}/${q1}، وحصة الثاني ${p2}/${q2}، والباقي للثالث. قُدّرت أرباح الشركة بـ ${T} دج. احسب حصة كل شريك.`,
      a: `الأول ${part(n1)} دج، الثاني ${part(n2)} دج، الثالث ${part(n3)} دج`,
      steps: [`حصة الثالث كسر: 1 - ${p1}/${q1} - ${p2}/${q2} = ${n3}/${den}`], _chk: [T, p1, q1, p2, q2] };
  };
  G.abscissa = r => {
    const a = ri(r, -90, 90) / 10, b = ri(r, -90, 90) / 10;
    if (a === b) return G.abscissa(r);
    return { type: 'distance-abscissa', q: `على مستقيم مدرّج، فاصلة A هي ${a.toFixed(1)} وفاصلة B هي ${b.toFixed(1)}. أحسب المسافة AB.`, a: `${Math.abs(a - b).toFixed(1)}`,
      steps: [`AB = |${a.toFixed(1)} - (${b.toFixed(1)})| = ${Math.abs(a - b).toFixed(1)}`] };
  };

  // ---- الثانوي: 1AS / 2AS / 3AS ----
  const vec = (x, y) => `(${x} ; ${y})`;
  G.system = r => {
    let x0, y0, m, c, p, q, rr;
    do { x0 = ri(r, -5, 5); y0 = ri(r, -5, 5); m = pick(r, [-3, -2, -1, 1, 2, 3]); p = ri(r, 1, 5); q = pick(r, [-4, -3, -2, 2, 3, 4]); } while (p + q * m === 0);
    c = y0 - m * x0; rr = p * x0 + q * y0;
    return { type: 'linear-system', q: `حلّ الجملة: y = ${lin(m, c)} ، ${p === 1 ? '' : p}x ${q < 0 ? '-' : '+'} ${Math.abs(q)}y = ${rr}`,
      a: `(x ; y) = ${vec(x0, y0)}`, steps: [`نعوّض y في المعادلة الثانية فنجد (${p + q * m})x = ${rr - q * c}`, `x = ${x0} ثم y = ${y0}`], _chk: [m, c, p, q, rr, x0, y0] };
  };
  G.parallelogram = r => {
    const xa = ri(r, -5, 5), ya = ri(r, -5, 5), bx = ri(r, -5, 8), by = ri(r, -5, 8), cx = ri(r, -6, 8), cy = ri(r, -6, 8);
    const C = [xa + cx, ya + cy], D = [C[0] - bx + xa, C[1] - by + ya];
    return { type: 'parallelogram', q: `المستوي منسوب إلى معلم متعامد ومتجانس. A(${xa} ; ${ya})، و B حيث OB→ = ${vec(bx, by)}، و C حيث AC→ = ${vec(cx, cy)}. عيّن إحداثيي D ليكون ABCD متوازي أضلاع.`,
      a: `D${vec(D[0], D[1])}`, steps: [`C${vec(C[0], C[1])} و B${vec(bx, by)}`, 'ABCD متوازي أضلاع يكافئ AB→ = DC→ أي D = A + C - B'], _chk: [xa, ya, bx, by, C[0], C[1], D[0], D[1]] };
  };
  G.canon = r => {
    const a = ri(r, 2, 6), c = ri(r, 1, 4), b = ri(r, -6, 6), k = b + a * c;
    if (k === 0) return G.canon(r);
    return { type: 'canonical-form', q: `f(x) = (${lin(a, b)}) / (x - ${c}) من أجل x ≠ ${c}. تحقق أنه من أجل كل x ≠ ${c}: f(x) = α + β/(x - ${c}) وعيّن α و β.`,
      a: `α = ${a} و β = ${k}`, steps: [`${lin(a, b)} = ${a}(x - ${c}) + ${k}`, `إذن f(x) = ${a} + ${k}/(x - ${c})`], _chk: [a, b, c, k] };
  };
  G.compose = r => {
    const p = ri(r, 1, 9), a = pick(r, [-3, -2, -1, 1, 2, 3]), b = ri(r, -7, 7), k = ri(r, -4, 4);
    const fog = quad(a * a, 2 * a * b, b * b - p), gof = quad(a, 0, b - a * p);
    return { type: 'composition', q: `f(x) = x² - ${p} و g(x) = ${lin(a, b)}. أوجد عبارة (f∘g)(x) و (g∘f)(x) ثم احسب (f∘g)(${k}).`,
      a: `(f∘g)(x) = ${fog} ، (g∘f)(x) = ${gof} ، (f∘g)(${k}) = ${(a * k + b) ** 2 - p}`,
      steps: [`(f∘g)(x) = f(g(x)) = (${lin(a, b)})² - ${p}`, `(g∘f)(x) = g(f(x)) = ${a === 1 ? '' : a === -1 ? '-' : a}(x² - ${p}) ${b < 0 ? '-' : '+'} ${Math.abs(b)}`], _chk: [p, a, b, k] };
  };
  G.arithSum = r => { // u_n = a - b·n ، S_n = u_0 + ... + u_n
    const a = ri(r, 1, 6), b = ri(r, 1, 4), n0 = Math.floor((2 * a - b) / b) + ri(r, 1, 9); // الجذر الآخر سالب فالحل وحيد
    const S = ((n0 + 1) * (2 * a - b * n0)) / 2, sn = quad(-b, 2 * a - b, 2 * a).replace(/x/g, 'n');
    return { type: 'arith-seq', q: `المتتالية (uₙ) معرّفة على ℕ بـ uₙ = ${a} - ${b === 1 ? '' : b}n. بيّن أنها حسابية وعيّن أساسها r وحدّها الأول u₀، ثم أوجد قيمة العدد الطبيعي n التي من أجلها S = u₀ + u₁ + ... + uₙ = ${S}.`,
      a: `r = ${-b} ، u₀ = ${a} ، Sₙ = (${sn})/2 ، n = ${n0}`, steps: [`uₙ₊₁ - uₙ = ${-b}`, `Sₙ = (n+1)(u₀+uₙ)/2 = (${sn})/2`, `نحلّ المعادلة من الدرجة الثانية ونأخذ الحل الطبيعي`], _chk: [a, b, n0, S] };
  };
  G.geoSum = r => {
    const v0 = ri(r, 1, 5), q = pick(r, [2, 3, -2]), n = ri(r, 3, 7);
    const vn = v0 * q ** n, S = v0 * (q ** (n + 1) - 1) / (q - 1);
    return { type: 'geom-seq', q: `(vₙ) متتالية هندسية حدّها الأول v₀ = ${v0} وأساسها q = ${q}. احسب v${n} ثم المجموع v₀ + v₁ + ... + v${n}.`,
      a: `v${n} = ${vn} ، المجموع = ${S}`, steps: [`vₙ = v₀ × qⁿ = ${v0} × (${q})${sup(n)}`, `S = v₀ × (qⁿ⁺¹ - 1)/(q - 1)`], _chk: [v0, q, n, vn, S] };
  };

  // ---- فيزياء (2AS / 3AS) ----
  const rd = (x, k) => Number(x.toFixed(k));
  G.molarity = r => { // C = 10·p·d / M
    const [name, M, d, pc] = pick(r, [['HCl', 36.5, 1.19, 35], ['HCl', 36.5, 1.18, 37], ['HNO₃', 63, 1.33, 52], ['HNO₃', 63, 1.4, 65], ['H₂SO₄', 98, 1.84, 96]]);
    const C = rd(10 * pc * d / M, 2);
    return { type: 'phys-molarity', q: `قارورة من محلول تجاري لـ ${name}: الكثافة d = ${d}، درجة النقاوة ${pc}%، الكتلة المولية M = ${M} g/mol. احسب التركيز المولي للمحلول التجاري.`,
      a: `C = ${C} mol/L`, steps: ['C = 10 × p × d / M', `C = 10 × ${pc} × ${d} / ${M} = ${C} mol/L`], _chk: [pc, d, M, C] };
  };
  G.dilution = r => {
    const [name, M, d, pc] = pick(r, [['HCl', 36.5, 1.19, 35], ['HNO₃', 63, 1.4, 65]]);
    const C0 = rd(10 * pc * d / M, 2), C1 = pick(r, [0.1, 0.2, 0.5, 1]), V1 = pick(r, [100, 200, 250, 500]); // C0 المعروض هو المستعمل في الحل
    const V0 = rd(C1 * V1 / C0, 2);
    return { type: 'phys-dilution', q: `التركيز المولي للمحلول التجاري لـ ${name} هو C₀ = ${C0} mol/L. نريد تحضير محلول مائي (S₁) تركيزه C₁ = ${C1} mol/L وحجمه V₁ = ${V1} mL بالتمديد. احسب حجم V₀ اللازم أخذه من المحلول التجاري.`,
      a: `V₀ = ${V0} mL`, steps: ['عند التمديد تبقى كمية المادة ثابتة: C₀V₀ = C₁V₁', `V₀ = C₁V₁ / C₀ = ${C1} × ${V1} / ${C0} ≈ ${V0} mL`], _chk: [C0, C1, V1, V0] };
  };
  G.dissolve = r => {
    const M = 159.5, m = ri(r, 8, 40) / 10, V = pick(r, [100, 200, 250, 500]);
    const n = m / M, C = n / (V / 1000), Cm = m / (V / 1000);
    return { type: 'phys-dissolution', q: `نذيب كتلة m = ${m} g من كبريتات النحاس الصلبة (CuSO₄) في ${V} mL من الماء المقطّر (نهمل تغيّر الحجم). M = ${M} g/mol. احسب كمية المادة n والتركيز المولي C والتركيز الكتلي Cm.`,
      a: `n = ${rd(n, 4)} mol ، C = ${rd(C, 3)} mol/L ، Cm = ${rd(Cm, 2)} g/L`, steps: [`n = m / M = ${m} / ${M} = ${rd(n, 4)} mol`, `C = n / V = ${rd(n, 4)} / ${V / 1000} ≈ ${rd(C, 3)} mol/L`, `Cm = m / V = ${rd(Cm, 2)} g/L`], _chk: [m, M, V, n, C, Cm] };
  };
  G.incline = r => {
    const al = pick(r, [30, 45, 60]), h = ri(r, 5, 80) / 10, g = 9.8, sa = Math.sin(al * Math.PI / 180);
    const a = g * sa, L = h / sa, v = Math.sqrt(2 * g * h);
    return { type: 'phys-incline', q: `جسم (S) كتلته 200 g يبدأ حركته من السكون من أعلى مستوٍ مائل بزاوية α = ${al}° عن الأفقي، وارتفاع نقطة الانطلاق h = ${h} m. نهمل الاحتكاك (g = 9.8 m/s²). احسب تسارع الجسم ثم طول المستوي AB وسرعة الجسم عند B.`,
      a: `a = ${rd(a, 2)} m/s² ، AB = ${rd(L, 2)} m ، vB = ${rd(v, 2)} m/s`, steps: [`a = g·sin α = ${g} × sin ${al}° = ${rd(a, 2)} m/s²`, `AB = h / sin α = ${rd(L, 2)} m`, `vB² = 2·a·AB = 2·g·h ⇒ vB = ${rd(v, 2)} m/s`], _chk: [al, h, g, a, L, v] };
  };
  delete G.vec; // لا يُدرج: إجابة غير مضمونة

  const BY = { '1AS': ['system', 'parallelogram', 'canon'], '2AS': ['compose', 'system', 'canon'], '3AS': ['arithSum', 'geoSum', 'compose'], '2AM': ['order', 'relative', 'decdiv2', 'shares', 'abscissa'], '1AM': ['div', 'euclid', 'decdiv', 'angle'], '3AM': ['sci', 'power', 'exprInt', 'frame'], '4AM': ['expandSq', 'factorSq', 'solveProd', 'rect'] };
  // ---- فيزياء (1AM..1AS): قوانين أساسية؛ توزيعها على المستويات مبدئي يحتاج مراجعة بالبرنامج الرسمي ----
  G.ohm = r => {
    const R = pick(r, [10, 20, 22, 47, 100, 220]), I = pick(r, [0.1, 0.2, 0.25, 0.5, 1, 2]);
    const U = rd(R * I, 2), w = rd(U * I, 3);
    return { type: 'phys-ohm', q: `ناقل أومي مقاومته R = ${R} Ω يجتازه تيار كهربائي شدته I = ${I} A. احسب التوتر U بين طرفيه ثم الاستطاعة المستهلكة فيه.`,
      a: `U = ${U} V ، P = ${w} W`, steps: ['قانون أوم: U = R × I', `U = ${R} × ${I} = ${U} V`, `P = U × I = ${U} × ${I} = ${w} W`], _chk: [R, I, U, w] };
  };
  G.power = r => {
    const P = pick(r, [40, 60, 75, 100, 1500, 2000]), t = pick(r, [0.5, 1, 2, 3, 4, 5]);
    const Wh = P * t, kWh = Wh / 1000;
    return { type: 'phys-power', q: `جهاز كهربائي استطاعته P = ${P} W يشتغل مدة t = ${t} h. احسب الطاقة الكهربائية المستهلكة بـ Wh ثم بـ kWh.`,
      a: `E = ${rd(Wh, 2)} Wh = ${rd(kWh, 4)} kWh`, steps: ['E = P × t', `E = ${P} × ${t} = ${rd(Wh, 2)} Wh`, `E = ${rd(Wh, 2)} / 1000 = ${rd(kWh, 4)} kWh`], _chk: [P, t, Wh, kWh] };
  };
  G.density = r => {
    const d = pick(r, [0.8, 1, 2.7, 7.8, 11.3, 13.6]), V = pick(r, [10, 20, 25, 50, 100]);
    const m = rd(d * V, 2);
    return { type: 'phys-density', q: `قطعة من مادة حجمها V = ${V} cm³ وكتلتها m = ${m} g. احسب الكتلة الحجمية ρ لهذه المادة بـ g/cm³.`,
      a: `ρ = ${d} g/cm³`, steps: ['ρ = m / V', `ρ = ${m} / ${V} = ${d} g/cm³`], _chk: [d, V, m] };
  };
  G.weight = r => {
    const m = pick(r, [0.2, 0.5, 2, 5, 10, 50]), g = pick(r, [9.8, 10]);
    const P = rd(m * g, 2);
    return { type: 'phys-weight', q: `جسم كتلته m = ${m} kg. احسب وزنه P علماً أن شدة الجاذبية g = ${g} N/kg.`,
      a: `P = ${P} N`, steps: ['P = m × g', `P = ${m} × ${g} = ${P} N`], _chk: [m, g, P] };
  };
  G.speed = r => {
    const v = pick(r, [36, 54, 72, 90, 108, 120]), t = pick(r, [0.5, 1, 2, 3]);
    const d = v * t, ms = v / 3.6;
    return { type: 'phys-speed', q: `تقطع سيارة مسافة d = ${d} km خلال مدة t = ${t} h بسرعة ثابتة. احسب سرعتها v بـ km/h ثم بـ m/s.`,
      a: `v = ${v} km/h = ${rd(ms, 2)} m/s`, steps: ['v = d / t', `v = ${d} / ${t} = ${v} km/h`, `v = ${v} / 3.6 = ${rd(ms, 2)} m/s`], _chk: [d, t, v, ms] };
  };
  G.mole = r => {
    const [name, M] = pick(r, [['H₂O', 18], ['CO₂', 44], ['NaCl', 58.5], ['HCl', 36.5], ['NaOH', 40], ['H₂SO₄', 98]]), n = pick(r, [0.1, 0.2, 0.5, 1, 2, 3]);
    const m = rd(M * n, 2);
    return { type: 'phys-mole', q: `عيّنة من ${name} كتلتها m = ${m} g. الكتلة المولية M = ${M} g/mol. احسب كمية المادة n في هذه العيّنة.`,
      a: `n = ${n} mol`, steps: ['n = m / M', `n = ${m} / ${M} = ${n} mol`], _chk: [M, n, m] };
  };
  G.molconc = r => {
    const [name, M] = pick(r, [['NaCl', 58.5], ['NaOH', 40], ['H₂SO₄', 98], ['KMnO₄', 158]]), m = ri(r, 2, 20), V = pick(r, [100, 250, 500, 1000]);
    const n = m / M, C = n / (V / 1000);
    return { type: 'phys-molconc', q: `نذيب كتلة m = ${m} g من ${name} (M = ${M} g/mol) في الماء للحصول على محلول حجمه V = ${V} mL. احسب كمية المادة n ثم التركيز المولي C.`,
      a: `n = ${rd(n, 4)} mol ، C = ${rd(C, 3)} mol/L`, steps: ['n = m / M', `n = ${m} / ${M} = ${rd(n, 4)} mol`, `C = n / V = ${rd(n, 4)} / ${V / 1000} = ${rd(C, 3)} mol/L`], _chk: [M, n, V, m, C] };
  };
  const PHYS = { '1AM': ['density'], '2AM': ['density', 'weight'], '3AM': ['mole', 'ohm', 'power'], '4AM': ['speed', 'weight', 'ohm', 'power'], '1AS': ['mole', 'molconc', 'speed', 'weight', 'ohm'], '2AS': ['molarity', 'dilution', 'dissolve', 'power'], '3AS': ['incline'] };
  const SUBJ = { math: BY, physics: PHYS };
  function generate(grade, count, rng, subject) {
    const r = rng || mk(Date.now()), names = (SUBJ[subject || 'math'] || {})[grade]; if (!names) return [];
    const out = [], seen = new Set();
    for (let i = 0, t = 0; out.length < count && t < count * 20; i++, t++) {
      const x = G[names[i % names.length]](r); if (seen.has(x.q)) continue; seen.add(x.q); out.push(x);
    }
    return out;
  }
  const has = (grade, subject) => !!(SUBJ[subject || 'math'] || {})[grade];
  root.SMMathMiddle = { generate, has, grades: Object.keys(BY), physicsGrades: Object.keys(PHYS), _G: G, _mk: mk };
  if (typeof module !== 'undefined') module.exports = root.SMMathMiddle;
})(typeof window !== 'undefined' ? window : globalThis);
