// v2.9.48: bundled textbooks ship as books/<LEVEL>-sci.json.gz and must actually load (they were requested as .json before).
const fs=require('fs'),path=require('path'),assert=require('assert'),zlib=require('zlib');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'web/smart-teacher-books.js'),'utf8');
assert.strictEqual((src.match(/fetch\('books\/'\+code\+'-sci\.json'\)/g)||[]).length,1,'the plain .json request exists only as the fallback inside _bookJson');
assert.strictEqual((src.match(/await _bookJson\(code\)/g)||[]).length,2,'both loaders (level + current grade) use _bookJson');
assert(src.includes("'-sci.json.gz'")&&src.includes('_bookJson'),'books are loaded from the .json.gz files');
const files=fs.readdirSync(path.join(root,'web/books')).filter(f=>/-sci\.json\.gz$/.test(f));
assert(files.length>=12,'all 12 level bundles are present');
for(const f of files){
  const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'web/books',f))).toString('utf8'));
  assert(Array.isArray(d.books)&&d.books.length>0,f+' has books');
  assert(f.startsWith(d.grade+'-'),f+' grade matches file name');
}
console.log('v2.9.48 bundled books (.gz) tests: PASS ('+files.length+' bundles)');
