// Native Android path: the exam library must use CapacitorHttp, not WebView fetch/CORS.
const fs=require('fs'),path=require('path'),assert=require('assert');
const els={},calls=[],memory=new Map();global.window=global;global.lang='ar';global.page='tests';global.toast=()=>{};global.confirm=()=>true;
global.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
global.document={getElementById:id=>els[id]||null,createElement:()=>({style:{},click(){},remove(){},set href(v){this._href=v},get href(){return this._href}}),body:{style:{},appendChild(){}}};
global.DOMParser=class{parseFromString(html){const a=[...html.matchAll(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map(m=>({getAttribute:k=>k==='href'?m[1]:null,textContent:m[2]}));return{querySelectorAll:()=>a,querySelector:()=>({textContent:'اختبار الرياضيات'})}}};
global.Capacitor={isNativePlatform:()=>true};
const pdf=Buffer.from('%PDF-1.4\nNative test PDF');
const site={
 'https://www.dzexams.com/robots.txt':{status:200,data:'User-agent: *\nAllow: /'},
 'https://www.dzexams.com/ar/math':{status:200,data:'<h1>اختبار الرياضيات</h1><a href="/files/math.pdf">اختبار الفصل الأول</a>'},
 'https://www.dzexams.com/files/math.pdf':{status:200,data:pdf.toString('base64')}
};
global.CapacitorHttp={request:async o=>{calls.push(o);const r=site[o.url]||{status:404,data:'not found'};return{status:r.status,headers:{'content-length':String(typeof r.data==='string'?r.data.length:0)},data:r.data}}};
// Any use of browser fetch is a failure in this native-path test.
global.fetch=async()=>{throw new Error('WebView fetch should not be used on native Android')};
eval(fs.readFileSync(path.join(__dirname,'../web/dzexams-library.js'),'utf8'));
(async()=>{
 const Z=SM_DZLIB,T=Z._t;dzexamsPanel('الثانية متوسط');await T.load();assert(Z.grant(true,'authorized'));
 assert(await Z.scan('https://www.dzexams.com/ar/math'));
 assert.equal(T.docs().length,1);
 const blob=await T.fetchDoc(0);assert.equal(blob.type,'application/pdf');assert(blob.size>10);assert(T.have().has(T.docs()[0].file));
 assert(calls.some(x=>x.url.endsWith('/robots.txt')));assert(calls.some(x=>x.url.endsWith('/math.pdf')&&x.responseType==='arraybuffer'));
 assert(calls.every(x=>x.connectTimeout>0&&x.readTimeout>0));
 console.log('PASS: native CapacitorHttp used for robots, page scan and binary PDF download; no WebView fetch/CORS dependency');
})().catch(e=>{console.error(e);process.exitCode=1});
