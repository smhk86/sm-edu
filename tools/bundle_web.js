#!/usr/bin/env node
/* Build-time only (GitHub Actions, after the tests): merges runs of plain local <script src> tags of web/index.html
   into a few bundle files so the app opens with fewer requests. Order and inline scripts are preserved, sources stay untouched in git.
   If anything looks unsafe, nothing is changed and the app keeps loading its scripts one by one. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..', 'web'));
const idxPath = path.join(root, 'index.html'), swPath = path.join(root, 'sw.js');
function bail(msg) { console.log('bundle skipped: ' + msg); process.exit(0); }

let html = fs.readFileSync(idxPath, 'utf8');
const tagRe = /<script\b[^>]*>[\s\S]*?<\/script>/g;
const plain = /^<script src="([^"#?]+\.js)"><\/script>$/;
const parts = []; let last = 0, m;
while ((m = tagRe.exec(html))) {
  parts.push({ text: html.slice(last, m.index), tag: false });
  const pm = plain.exec(m[0]);
  parts.push({ text: m[0], tag: true, src: pm && !/^(https?:)?\/\//.test(pm[1]) ? pm[1] : null });
  last = m.index + m[0].length;
}
parts.push({ text: html.slice(last), tag: false });

// group consecutive local script tags (only whitespace between them) into runs
const runs = []; let cur = null;
for (let i = 0; i < parts.length; i++) {
  const p = parts[i];
  if (p.tag && p.src) { if (!cur) { cur = { from: i, to: i, files: [] }; runs.push(cur); } cur.to = i; cur.files.push(p.src); }
  else if (!p.tag && /^\s*$/.test(p.text) && cur) { /* keep the run open across whitespace */ }
  else cur = null;
}
if (!runs.length) bail('no local scripts found');

const bundles = [], consumed = new Set();
runs.forEach((run, n) => {
  const name = 'app.bundle-' + (n + 1) + '.js';
  let code = '';
  for (const f of run.files) {
    const fp = path.join(root, f);
    if (!fs.existsSync(fp)) bail('missing ' + f);
    let src = fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, '');
    try { new vm.Script(src, { filename: f }); } catch (e) { bail('syntax problem in ' + f + ': ' + e.message); }
    code += '/* ==== ' + f + ' ==== */\n' + src + '\n;\n';
  }
  try { new vm.Script(code, { filename: name }); } catch (e) { bail('bundle ' + name + ' does not parse: ' + e.message); }
  bundles.push({ name, code, run });
});

let out = '';
for (let i = 0; i < parts.length; i++) {
  const b = bundles.find(x => i >= x.run.from && i <= x.run.to);
  if (!b) { out += parts[i].text; continue; }
  if (i === b.run.from) out += '<script src="' + b.name + '"></script>';
}
for (const b of bundles) { fs.writeFileSync(path.join(root, b.name), b.code); b.run.files.forEach(f => consumed.add(f)); }
fs.writeFileSync(idxPath, out);

if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  for (const f of consumed) sw = sw.split("'./" + f + "',").join('').split(",'./" + f + "'").join('');
  sw = sw.replace("const ASSETS=['./',", "const ASSETS=['./'," + bundles.map(b => "'./" + b.name + "'").join(',') + ',');
  fs.writeFileSync(swPath, sw);
}
console.log('bundled ' + consumed.size + ' scripts into ' + bundles.map(b => b.name + ' (' + Math.round(b.code.length / 1024) + ' KB)').join(', '));
