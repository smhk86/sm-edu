#!/usr/bin/env python3
"""sweep_missing.py - print books of the catalogue that are absent from the release file.
Output, one per line:  LEVEL<TAB>ID<TAB>TITLE
  python3 tools/sweep_missing.py 5AP 4AP        (downloads the files, read-only)
  python3 tools/sweep_missing.py --offline ...  (uses ./audit_work only)"""
import gzip, json, os, shutil, subprocess, sys, tempfile
REPO, TAG = "smhk86/sm-textbooks", "data"
ALL = ["1AP","2AP","3AP","4AP","5AP","1AM","2AM","3AM","4AM","1AS","2AS","3AS"]
off = "--offline" in sys.argv
lv = [x.upper() for x in sys.argv[1:] if not x.startswith("--")] or ALL
WORK = "audit_work" if off else tempfile.mkdtemp(prefix="sweep_")
os.makedirs(WORK, exist_ok=True)
bad = 0
cp = os.path.join("textbooks_work", "catalogue.json")
def cat():
    return json.load(open(cp, encoding="utf-8")) if os.path.exists(cp) else {}
for L in lv:
    if L not in cat() and not off:
        subprocess.run([sys.executable, "tools/fetch_textbooks.py", "catalogue", "--grade", L],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    f = os.path.join(WORK, L + "-sci.json.gz")
    if not off:
        if os.path.exists(f): os.remove(f)
        for _ in range(3):
            subprocess.run(["gh","release","download",TAG,"--repo",REPO,"-p",L+"-sci.json.gz","-D",WORK,"--clobber"],
                           capture_output=True)
            if os.path.exists(f): break
        if not os.path.exists(f):
            r = subprocess.run(["gh","release","view",TAG,"-R",REPO,"--json","assets","-q",".assets[].name"],
                               capture_output=True, text=True)
            if r.returncode != 0 or (L + "-sci.json.gz") in r.stdout.split():
                print("download failed for %s, skipped" % L, file=sys.stderr); bad = 1; continue
    have = set()
    if os.path.exists(f):
        try: have = {b["id"] for b in json.load(gzip.open(f,"rt",encoding="utf-8")).get("books",[])}
        except Exception as e: print("unreadable %s: %s" % (f, e), file=sys.stderr); bad = 1; continue
    for b in cat().get(L, []):
        if b["id"] not in have:
            print("%s\t%s\t%s" % (L, b["id"], b["title"].replace("\t"," ")))
if not off: shutil.rmtree(WORK, ignore_errors=True)
sys.exit(1 if bad else 0)
