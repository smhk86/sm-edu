// v2.9.50: home backup card, in-app update notice, footer credit, build-time bundler, strict CI, monotonic versionCode.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm'),os=require('os'),cp=require('child_process');
const root=path.join(__dirname,'..'),rd=f=>fs.readFileSync(path.join(root,f),'utf8');
assert(rd('web/index.html').includes('src="v2-9-49.js"')&&rd('web/sw.js').includes('./v2-9-49.js'));
assert(/credit:\s*'/.test(rd('web/config.js')));assert(!/api\.github\.com/.test(rd('web/v2-9-49.js')),'the app must not call the GitHub API');

// ---- module behaviour with stubs ----
const store={};const listeners={};let timers=[];
const els={};const footer={_c:[],querySelector:()=>null,insertBefore(n){this._c.push(n)},lastElementChild:{}};
const win={SM_SCHOOL_CONFIG:{publicContentBase:'https://o.github.io/r',credit:'Tester'},home:()=>'<main>HOME</main>',collectLocalBackup:()=>({app:'x',data:{}}),
  addEventListener:(e,f)=>{listeners[e]=f},render:()=>{}};
const sandbox={window:win,document:{querySelector:s=>s==='footer'?footer:null,getElementById:id=>els[id]||null,createElement:()=>({}),body:{}},
  localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)}},navigator:{onLine:true},lang:'fr',page:'other',
  setTimeout:(f)=>{timers.push(f);return 0},console,Date,JSON,Promise,File:class{},Blob:class{},URL:{},backupFeedback:()=>{},
  fetch:async u=>{assert.strictEqual(u,'https://o.github.io/r/data/app-version.json');return{ok:true,json:async()=>({version:'2.9.99',url:'https://github.com/o/r/releases/latest'})}}};
sandbox.window.window=win;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;sandbox.window.navigator=sandbox.navigator;
vm.createContext(sandbox);vm.runInContext(rd('web/v2-9-49.js'),sandbox);
assert(footer._c.length===1&&footer._c[0].textContent==='Réalisé par : Tester','footer credit added');
let h=win.home();assert(h.includes('HOME')&&h.includes('smUpdateBanner')&&h.includes('sm-home-backup')&&h.includes('exportLocalBackup()'),'home = banner slot + original + backup card');
assert.strictEqual(typeof win.exportLocalBackup,'function');
(async()=>{
  const banner={innerHTML:''};els.smUpdateBanner=banner;
  await timers[0]();
  assert(banner.innerHTML.includes('v2.9.99')&&banner.innerHTML.includes('github.com/o/r/releases/latest'),'newer version shows the notice with the download link');
  win.smSkipUpdate();assert.strictEqual(banner.innerHTML,'','dismissed');
  // same or older version => no notice
  store.smUpdateCheckInfo=JSON.stringify({version:'2.9.50',url:'https://github.com/o/r/x'});store.smUpdateCheckTime=String(Date.now());delete store.smUpdateSkipVersion;
  await listeners.online();assert.strictEqual(banner.innerHTML,'','same version: no notice');

  // ---- bundler on a temp copy ----
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'smweb-'));fs.cpSync(path.join(root,'web'),tmp,{recursive:true});
  const out=cp.execFileSync('node',[path.join(root,'tools/bundle_web.js'),tmp]).toString();assert(/bundled \d+ scripts/.test(out),out);
  const html=fs.readFileSync(path.join(tmp,'index.html'),'utf8');
  const tags=html.match(/<script\b[^>]*>/g);assert(tags.length<=4,'few script tags remain: '+tags.length);
  assert(html.indexOf('app.bundle-1.js')<html.indexOf('(function(){const sync=')&&html.indexOf('(function(){const sync=')<html.indexOf('app.bundle-2.js'),'inline script keeps its position');
  const sw=fs.readFileSync(path.join(tmp,'sw.js'),'utf8');assert(sw.includes('./app.bundle-1.js')&&!sw.includes("'./v2-9-49.js'"));
  new vm.Script(sw);fs.readdirSync(tmp).filter(f=>/^app\.bundle/.test(f)).forEach(f=>new vm.Script(fs.readFileSync(path.join(tmp,f),'utf8')));
  fs.rmSync(tmp,{recursive:true,force:true});

  // ---- CI workflow ----
  const wf=rd('.github/workflows/build-apk.yml');
  assert(!/^  test:\n    continue-on-error/m.test(wf),'tests are required for the build');
  assert(wf.includes('skip_tests')&&wf.includes('gh release create')&&rd('.github/workflows/publish-learning-content.yml').includes('app-version.json')&&wf.includes('tools/bundle_web.js')&&wf.includes('build_tutor_kb.py'));
  assert(!wf.includes('% 1000')&&wf.includes('* 10000 + RUN'),'versionCode no longer wraps');
  const kb=JSON.parse(rd('web/data/tutor-kb.json'));assert(kb.schema==='sm-tutor-kb-v1'&&Array.isArray(kb.chunks));
  console.log('v2.9.50 features tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
