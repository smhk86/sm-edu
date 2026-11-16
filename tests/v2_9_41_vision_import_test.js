const assert=require('assert'),zlib=require('zlib'),fs=require('fs'),path=require('path');
const msgs=[],store=new Map();
global.window=global;global.toast=m=>msgs.push(m);global.document={getElementById:()=>null,addEventListener(){},head:null,readyState:'loading'};
global.addEventListener=()=>{};
global.SM_TEACHER_BOOKS={listSaved:async()=>[...store.values()],putRow:async r=>{store.set(r.id,r)}};
require(path.resolve(__dirname,'../web/textbook-vision-import.js'));
const V=window.SM_VISION_IMPORT,long=n=>'نص تجريبي للصفحة رقم '+n+' من الكتاب المدرسي';
const mk=(grade,books)=>zlib.gzipSync(Buffer.from(JSON.stringify({grade,books})));
const data=mk('3AM',[
 {id:'3AM-01',title:'كتاب الرياضيات سنة ثالثة متوسط',grade:'3AM',subject:'maths',pageTexts:[{page:1,text:long(1)},{page:2,text:long(2)},{page:3,text:'x'}]},
 {id:'3AM-03',title:'كتاب العلوم الفيزيائية و التكنولوجيا',grade:'3AM',subject:'sciences',pageTexts:[{page:5,text:long(5)}]},
 {id:'3AM-09',title:'فارغ',grade:'3AM',subject:'other',pageTexts:[]}]);
(async()=>{
 const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
 let r=await V.importBuffer(ab(data),'3AM-sci.json.gz');
 assert.deepStrictEqual([r.added,r.updated,r.kept,r.pages],[2,0,0,3]);
 const m=store.get('vis-3AM-3AM-01'),p=store.get('vis-3AM-3AM-03');
 assert.strictEqual(m.grade,'الثالثة متوسط');assert.strictEqual(m.subject,'الرياضيات');assert.strictEqual(m.pages,2);
 assert.strictEqual(p.subject,'العلوم الفيزيائية والتكنولوجيا');            /* mis-tagged sciences corrected from the title */
 assert.ok(m.text.startsWith('صفحة 1: '));
 r=await V.importBuffer(ab(data),'x.gz');                                 /* level read from the file itself; re-import = update, no duplicate */
 assert.deepStrictEqual([r.added,r.updated],[0,2]);assert.strictEqual(store.size,2);
 const fewer=mk('3AM',[{id:'3AM-01',title:'كتاب الرياضيات',subject:'maths',pageTexts:[{page:1,text:long(1)}]}]);
 r=await V.importBuffer(ab(fewer),'3AM-sci.json.gz');assert.strictEqual(r.kept,1);assert.strictEqual(store.get('vis-3AM-3AM-01').pages,2);
 const plain=Buffer.from(JSON.stringify({grade:'1AS',books:[{id:'a',title:'علوم الإسلامية',subject:'sciences',pageTexts:[{page:1,text:long(1)}]}]}));
 r=await V.importBuffer(ab(plain),'1AS.json');assert.strictEqual(store.get('vis-1AS-a').subject,'العلوم الإسلامية');
 await assert.rejects(()=>V.importBuffer(ab(Buffer.from('{"books":[]}')),'zzz.json'),/unknown-level/);
 await assert.rejects(()=>V.importBuffer(ab(Buffer.from('{"grade":"3AM","books":"bad"}')),'3AM.json'),/invalid-file/);
 const nativeDecompression=global.DecompressionStream;global.DecompressionStream=undefined;
 await assert.rejects(()=>V.importBuffer(ab(mk('3AM',[])),'3AM.json.gz'),/no-gzip/);
 global.DecompressionStream=nativeDecompression;
 const duplicate=mk('3AM',[
  {id:'same',title:'كتاب الرياضيات',subject:'maths',pageTexts:[{page:1,text:long(1)}]},
  {id:'same',title:'كتاب الرياضيات',subject:'maths',pageTexts:[{page:1,text:long(1)+' نسخة أطول'},{page:2,text:long(2)},{page:2,text:long(2)+' نسخة أطول'}]}
 ]);
 r=await V.importBuffer(ab(duplicate),'3AM.json.gz');
 assert.deepStrictEqual([r.added,r.updated,r.kept,r.pages],[1,0,0,2]);
 assert.strictEqual(store.get('vis-3AM-same').pages,2); // duplicate book IDs and page numbers are collapsed
 console.log('v2.9.48 vision import: OK');
})().catch(e=>{console.error(e);process.exit(1)});
