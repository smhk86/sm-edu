const fs=require('fs'),assert=require('assert');
const app=fs.readFileSync(__dirname+'/../web/app.js','utf8');
assert(app.includes("if(p==='tutor')p='teacher';"), 'legacy tutor navigation must redirect to Smart Teacher');
assert(app.includes("const allowedPages=new Set(['home','generator','teacher',...Object.keys(pageInfo)]);if(!p||!allowedPages.has(p))return;"),
  'go() must allow all active special pages as well as pageInfo-backed pages');
for(const page of ['home','generator','tutor','teacher','studycenter','library','exercises','tests','videos','certificates','computing','translate','parents','homeschool']){
  assert(app.includes("'"+page+"'"), 'navigation page is declared or legacy-mapped: '+page);
}
console.log('navigation route guard and legacy tutor redirect tests passed');
