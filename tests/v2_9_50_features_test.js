// v2.9.50: Claude-like teacher chat, status panel removed, 10-minute stay, source note removed, BEM/BAC space, robust voice.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'),rd=f=>fs.readFileSync(path.join(root,f),'utf8');
assert(rd('web/index.html').includes('src="v2-9-50.js"')&&rd('web/sw.js').includes('./v2-9-50.js'));
assert(rd('web/index.html').includes('interactive-widget=resizes-content'),'keyboard resizes the layout');
// source note removed from the exercise bank libraries
for(const f of ['web/raji3dz-library.js','web/dzexams-library.js']){const s=rd(f);assert(!s.includes('تُحمَّل على جهازك فقط بناءً على إقرارك'),f+' still shows the source note');assert(s.includes("const credit=()=>'';"))}
// status panel removed, source/new-conversation controls kept
const core=rd('web/smart-teacher-core.js');assert(!core.includes('حالة المعلم الذكي')&&!core.includes('id="smCoreStatus"')&&core.includes('SM_TEACHER_CORE.setMode'));
// 10 minutes
assert(rd('web/state-keep.js').includes('TTL=10*60*1000'));
// voice: native engine first, WebView fallback with voice selection
const v=rd('web/voice.js');assert(v.includes('natTts')&&v.includes('getVoices')&&v.includes('onvoiceschanged'));
assert(rd('.github/workflows/build-apk.yml').includes('@capacitor-community/text-to-speech')&&/text-to-speech[^\n]*\|\|/.test(rd('.github/workflows/build-apk.yml')),'optional TTS plugin never blocks the build');
// module behaviour
const els={},timers=[];const mk=()=>({style:{setProperty(){}},appendChild(){},classList:{toggle(){}},addEventListener(){}});
const doc={head:mk(),documentElement:mk(),body:Object.assign(mk(),{}),createElement:()=>({}),getElementById:id=>els[id]||null,querySelector:()=>null,addEventListener(){},activeElement:null,visibilityState:'visible'};
const idx=JSON.parse(rd('web/data/raji3dz-repository-index.json')),cur=JSON.parse(rd('web/data/curriculum-2026-2027.json'));
const win={addEventListener(){},visualViewport:null,innerHeight:800,examSimulatorPage:()=>'<section>SIM</section>',go(){}};
const sb={window:win,document:doc,lang:'ar',page:'certificates',setTimeout:f=>{timers.push(f);return 0},clearInterval(){},setInterval:()=>0,console,Event:class{},
 MutationObserver:class{observe(){}},fetch:async u=>u.includes('certificate-papers')?{ok:true,json:async()=>({items:[{track:'BAC',subject:'x',title:'t',text:'Q',solution:'A',rights_cleared:true},{track:'BAC',subject:'x',title:'hidden',text:'Q',rights_cleared:false}]})}:({json:async()=>u.includes('raji3dz')?idx:u.includes('certificate-papers')?{ok:true,json:async()=>({items:[{track:'BAC',subject:'x',title:'t',text:'Q',solution:'A',rights_cleared:true},{track:'BAC',subject:'x',title:'hidden',text:'Q',rights_cleared:false}]})}:cur})};
win.window=win;win.document=doc;vm.createContext(sb);vm.runInContext(rd('web/v2-9-50.js'),sb);
(async()=>{
 const html=win.examSimulatorPage();assert(html.includes('sm50Cert')&&html.includes('SIM'),'page keeps the simulator and adds the BEM/BAC panel');
 timers[1]();for(let n=0;n<50&&!win.SM_V2950._s.items;n++)await new Promise(r=>setImmediate(r));// loadData
 const S=win.SM_V2950._s;assert(S.items&&S.items.length>200,'index loaded for 4AM and 3AS');
 let f=win.SM_V2950._filtered();assert(f.length>0&&f.every(x=>x.grade==='الرابعة متوسط'&&x.solution),'BEM list = 4AM papers with solutions');
 for(let i=1;i<f.length;i++)assert((f[i-1].year||0)>=(f[i].year||0),'newest first');
 win.SM_V2950.track('BAC');f=win.SM_V2950._filtered();assert(f.length>0&&f.every(x=>x.grade==='الثالثة ثانوي'),'BAC list = 3AS papers');
 const h=win.SM_V2950._panel();assert(h.includes('BAC')&&h.includes('SM_V2950.open(')&&h.includes('مواضيع مقترحة'),'panel has papers and suggested topics');
 assert(h.includes('وليست مواضيع رسمية'),'suggestions are labelled as non-official');
 assert(h.includes('sm50-paper')&&!h.includes('hidden'),'only rights-cleared papers shown');
 win.SM_V2950.set('sol',false);assert(win.SM_V2950._filtered().length>=f.length);
 console.log('v2.9.50 features tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
// certificate pipeline tools exist and parse
const cp=require('child_process');
const py=cp.spawnSync('python3',['-c',"import sys;sys.path.insert(0,'tools');import fetch_certificate_papers as f,vision_exams as v;assert f.parse_line('BAC|x|https://a.b/c')[0]=='BAC';assert f.file_links('<a href=\"/a.pdf\">',  'https://h/')==['https://h/a.pdf'];assert v.split_solution('Q\\n===SOLUTION===\\nA')==('Q','A')"],{cwd:root});
assert.strictEqual(py.status,0,String(py.stderr));
const kp=cp.spawnSync('python3',['-c',"import sys;sys.path.insert(0,'tools');import vision_exams as v;p=v.KeyPool(['a','b','c']);assert p.current()=='a';p.burn('q');assert p.current()=='b';p.burn('q');assert p.current()=='c';p.burn('q');\ntry:\n  p.current();raise SystemExit(1)\nexcept v.AllKeysExhausted:\n  pass"],{cwd:root});
assert.strictEqual(kp.status,0,String(kp.stderr));
