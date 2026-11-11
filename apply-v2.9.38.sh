#!/usr/bin/env bash
# SM EDUCATION — passage 2.9.37 -> 2.9.38 (versions, tests, nettoyage)
# Usage (Termux) :  cd ~/sm-edu && bash apply-v2.9.38.sh
set -e
NEW=2.9.38
OLD=2.9.35
OLD_RE=2\\.9\\.35

[ -f package.json ] && [ -d web ] && [ -d backend ] || { echo "ERREUR: lance ce script depuis ~/sm-edu"; exit 1; }
CUR=$(node -p "require('./package.json').version")
echo "Version actuelle: $CUR"
if [ "$CUR" = "$NEW" ]; then echo "Déjà en $NEW, rien à faire."; exit 0; fi
if [ "$CUR" != "$OLD" ]; then echo "ERREUR: version inattendue ($CUR), attendu $OLD"; exit 1; fi

echo "1/4 — unification de la version $OLD -> $NEW"
sed -i "s/$OLD_RE/$NEW/g" package.json web/index.html web/sw.js web/smart-teacher-books.js backend/app/main.py
for f in tests/*.js tests/*.py; do
  case "$f" in tests/v2_9_35_smart_teacher_books_test.js) continue;; esac
  grep -q "$OLD_RE" "$f" && sed -i "s/$OLD_RE/$NEW/g" "$f"
done
sed -i "1s/v$OLD_RE/v$NEW/" README.md

echo "2/4 — correction des tests obsolètes (2.9.36 lit toutes les pages, IndexedDB v2)"
T=tests/v2_9_35_smart_teacher_books_test.js
node - <<'EOF'
const fs=require("fs");const f="tests/v2_9_35_smart_teacher_books_test.js";let s=fs.readFileSync(f,"utf8");
s=s.replace("SM_PDF.readText(file,18,MAX_TEXT)","SM_PDF.readAllPages(file,MAX_TEXT)");
s=s.split("indexedDB.open(DB,1)").join("indexedDB.open(DB,2)");
s=s.split("\n").map(l=>l.includes("رابط PDF مباشر")?"assert(!/https?:\\/\\/[^'\"` ]+\\.pdf/i.test(books),'catalogue does not hard-code direct PDF links');":l).join("\n");
fs.writeFileSync(f,s);
EOF

cat > tests/v2_9_36_37_on_demand_library_test.js <<'EOF'
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const books=fs.readFileSync(path.join(root,'web/smart-teacher-books.js'),'utf8');
assert(books.includes('MAX_TEXT=1200000'),'extraction cap is 1.2M characters');
assert(books.includes('SM_PDF.readAllPages(file,MAX_TEXT)'),'all pages are read');
assert(books.includes('pdfBlob'),'original PDF blob is stored locally');
assert(books.includes('SM_PDF.render('),'internal reader is used');
assert(books.includes('https://www.onps.dz/'),'ONPS official portal is linked');
assert(books.includes('indexedDB.open(DB,2)'),'IndexedDB schema v2');
function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(e.name!=='vendor')walk(p,o)}else if(/\.pdf$/i.test(e.name))o.push(p)}return o}
assert.deepStrictEqual(walk(path.join(root,'web')),[],'no textbook PDF is bundled in web/');
console.log('v2.9.36/37 on-demand library tests: PASS');
EOF

node - <<'EOF'
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
const add='node tests/v2_9_36_37_on_demand_library_test.js';
if(!p.scripts.test.includes(add))p.scripts.test+=' && '+add;
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
EOF

echo "3/4 — nettoyage des fichiers inutiles"
for f in SM_EDUCATION_modifie.zip web/v2-8-2.js web/v2-8-3.js; do
  [ -e "$f" ] && { git rm -q -f "$f" 2>/dev/null || rm -f "$f"; echo "supprimé: $f"; }
done

cat > V2.9.38_RELEASE_REPORT.md <<'EOF'
# SM EDUCATION v2.9.38 — Alignement et nettoyage

- Version unifiée (package.json, sw.js, index.html, backend, README, tests).
- Test v2.9.35 mis à jour (lecture de toutes les pages, IndexedDB v2).
- Nouveau test pour les versions 2.9.36/2.9.37 (bibliothèque à la demande, aucun PDF embarqué).
- Suppression de SM_EDUCATION_modifie.zip, v2-8-2.js et v2-8-3.js (non utilisés).
EOF
printf '## v2.9.38 — Alignement et nettoyage\n\n- Version unifiée, tests 2.9.35 corrigés, test 2.9.36/37 ajouté, fichiers inutiles supprimés.\n\n' | cat - CHANGELOG.md > /tmp/cl.$$ && mv /tmp/cl.$$ CHANGELOG.md

echo "4/4 — vérification"
node tests/v2_9_35_smart_teacher_books_test.js
node tests/v2_9_36_37_on_demand_library_test.js
node tests/smoke_test.js >/dev/null && echo "smoke: PASS"
python tests/release_integrity_test.py 2>/dev/null || python3 tests/release_integrity_test.py
echo
echo "OK. Ensuite :"
echo "  git add -A && git commit -m 'v2.9.38: versions, tests, nettoyage' && git push"
