const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const books=fs.readFileSync(path.join(root,'web/smart-teacher-books.js'),'utf8');
assert(books.includes('MAX_TEXT=1200000'),'extraction cap is 1.2M characters');
assert(books.includes('SM_PDF.readAllPages(file,MAX_TEXT)'),'all pages are read');
assert(books.includes('pdfBlob'),'original PDF blob is stored locally');
assert(books.includes('SM_PDF.render('),'internal reader is used');
assert(books.includes('https://www.onps.dz/'),'ONPS official portal is linked');
assert(books.includes('indexedDB.open(DB,2)'),'IndexedDB schema v2');
function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(e.name!=='vendor'&&e.name!=='repository'&&e.name!=='exams')walk(p,o)}else if(/\.pdf$/i.test(e.name))o.push(p)}return o}
assert.deepStrictEqual(walk(path.join(root,'web')),[],'no textbook PDF is bundled in web/');
console.log('v2.9.36/37 on-demand library tests: PASS');
