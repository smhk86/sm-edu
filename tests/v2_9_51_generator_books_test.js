'use strict';
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(process.cwd()+'/web/smart-generator.js','utf8');
const i=src.indexOf('async function bookMessage(');
const j=src.indexOf('async function aiCall(',i);
assert(i>0&&j>i,'bookMessage is defined before aiCall');
const body=src.slice(i,j);
assert(src.includes('message:await bookMessage(message,s),__kb:1'),'aiCall sends the book-grounded message with __kb');
function make(o){
 const g={SM_VISION_IMPORT:{GRADES:{'4AM':'الرابعة متوسط'}},SM_BOOKS_LOADER:{loaded:[],load(c){this.loaded.push(c);return Promise.resolve(5)},flush(){}},
  SM_TEXTBOOK_KB:{enabled:()=>o.enabled!==false,ensure:async()=>1,stats:async()=>({pages:9}),_t:{norm:x=>String(x||'')},
   search:async()=>o.hits===undefined?[{bookId:'b1',book:'كتاب الرياضيات',subject:'الرياضيات',page:12,snippet:'نص الكتاب عن الأعداد النسبية. '.repeat(30)}]:o.hits}};
 const curTopics=[{name:'الأعداد النسبية'}];
 return {g,fn:new Function('g','curTopics',body+';return bookMessage')(g,curTopics)};
}
const s={grade:'الرابعة متوسط',subject:'الرياضيات',topics:['الأعداد النسبية']};
(async()=>{
 let m=make({enabled:false});
 await assert.rejects(()=>m.fn('x'.repeat(500),s),/فعّل/);
 m=make({hits:[]});
 await assert.rejects(()=>m.fn('x'.repeat(500),s),/لم أجد/);
 m=make({});
 const out=await m.fn('تعليمة '.repeat(300),s);
 assert(out.includes('نص الكتاب عن الأعداد النسبية'),'message carries the book text');
 assert(out.length<3000,'message stays under the 3000-char server limit: '+out.length);
 assert.deepStrictEqual(m.g.SM_BOOKS_LOADER.loaded,['4AM'],'loads the book of the selected grade');
 const long=await make({}).fn('ي'.repeat(2600),s).catch(e=>e);
 assert(typeof long==='string'?long.length<3000:/طويلة/.test(long.message),'very long instruction is shortened or rejected, never oversized');
 console.log('PASS: generator is grounded in the textbook snippets');
})().catch(e=>{console.error(e);process.exit(1)});
