'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const sw=fs.readFileSync(path.join(root,'web/sw.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
assert.strictEqual(pkg.version,'2.9.38');
assert(sw.includes("sm-school-ai-v2.9.38-shell-r1"),'cache must be versioned');
assert(sw.includes("request.mode==='navigate'"),'navigation must be network-first');
assert(sw.includes("fetch(request,{cache:'no-store'})"),'shell must request fresh resources');
assert(sw.includes("caches.match('./index.html')"),'offline navigation must fall back to cached shell');
assert(sw.includes('Promise.allSettled'),'optional assets must not abort shell installation');
assert(sw.includes('await self.skipWaiting()')&&sw.includes('await self.clients.claim()'),'worker lifecycle must activate and claim clients');
assert(html.includes('v2.9.38'),'visible version label must match package');
const declarations=sw.match(/const ASSETS=\[(.*?)\];const HEAVY/s);
assert(declarations,'precache asset list must exist');
const assets=[...declarations[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
for(const asset of assets){const local=path.join(root,'web',asset.replace(/^\.\//,''));assert(fs.existsSync(local),'missing precache asset: '+asset)}
console.log(`PASS: v2.8.4 service-worker lifecycle, network-first shell, offline fallback and ${assets.length} precache paths`);
