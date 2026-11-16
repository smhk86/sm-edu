const assert=require('assert'),M=require(process.cwd()+'/web/math-middle-gen.js');
const near=(a,b)=>Math.abs(a-b)<1e-6*Math.max(1,Math.abs(b));
for(const g of ['1AM','2AM','3AM','4AM','1AS','2AS','3AS']){
  assert(M.has(g,'physics'),'physics missing '+g);
  for(let s=1;s<=300;s++){
    const out=M.generate(g,3,(()=>{let x=s*7919;return()=>(x=(x*1664525+1013904223)>>>0)/4294967296})(),'physics');
    assert(out.length>=1,g+' empty');
    for(const e of out){assert(e.q&&e.a&&e.steps&&e.steps.length,g+' incomplete '+e.type);assert(!/NaN|undefined|Infinity/.test(e.q+e.a+e.steps.join()),g+' bad value '+e.type)}
  }
}
const G=M._G,mk=M._mk;
for(let s=1;s<=300;s++){
  const r=mk(s);let x;
  x=G.ohm(r);const[R,I,U,w]=x._chk;assert(near(R*I,U));
  x=G.power(r);const[P,t,Wh,kWh]=x._chk;assert(near(P*t,Wh)&&near(Wh/1000,kWh));
  x=G.density(r);const[d,V,m]=x._chk;assert(near(m/V,d));
  x=G.weight(r);const[mm,g,PP]=x._chk;assert(near(mm*g,PP));
  x=G.speed(r);const[dd,tt,v,ms]=x._chk;assert(near(dd/tt,v)&&near(v/3.6,ms));
  x=G.mole(r);const[M1,n1,m1]=x._chk;assert(near(m1/M1,n1));
  x=G.molconc(r);const[M2,n2,V2,m2,C2]=x._chk;assert(near(m2/M2,n2)&&near(n2/(V2/1000),C2));
}
console.log('v2.9.2 physics generators ok');
