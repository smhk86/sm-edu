#!/usr/bin/env python3
"""merge_release.py LEVEL - merge textbooks_out/LEVEL-sci.json.gz with the file currently in the release,
so that two runs of the same level never erase each other's pages. Never lowers the book/page count.
Env: TEXTBOOKS_REPO, RELEASE_TAG (as in the workflow); MERGE_CURRENT=path to test without gh."""
import gzip, json, os, subprocess, sys, tempfile
REPO = os.environ.get("TEXTBOOKS_REPO", "smhk86/sm-textbooks"); TAG = os.environ.get("RELEASE_TAG", "data")
L = sys.argv[1]; name = L + "-sci.json.gz"; mine = os.path.join("textbooks_out", name)
if not os.path.exists(mine):
    print("merge: nothing to publish"); sys.exit(0)
cur = os.environ.get("MERGE_CURRENT", "")
if not cur:
    d = tempfile.mkdtemp(); cur = os.path.join(d, name)
    subprocess.run(["gh", "release", "download", TAG, "--repo", REPO, "-p", name, "-D", d], capture_output=True)
if not os.path.exists(cur):
    print("merge: no current file in the release, publishing as is"); sys.exit(0)
load = lambda p: json.load(gzip.open(p, "rt", encoding="utf-8"))
a, b = load(cur), load(mine)
books = {x["id"]: x for x in a.get("books", [])}
for x in b.get("books", []):
    y = books.get(x["id"])
    if not y:
        books[x["id"]] = x; continue
    pages = {p["page"]: p["text"] for p in y.get("pageTexts", [])}
    for p in x.get("pageTexts", []):
        if len(p["text"]) > len(pages.get(p["page"], "")): pages[p["page"]] = p["text"]
    z = dict(x); z["pageTexts"] = [{"page": k, "text": v} for k, v in sorted(pages.items())]
    books[x["id"]] = z
out = {"grade": b.get("grade", a.get("grade")), "books": [books[k] for k in sorted(books)]}
n = lambda o: sum(len(x.get("pageTexts", [])) for x in o["books"])
assert len(out["books"]) >= max(len(a.get("books", [])), len(b.get("books", []))), "book count dropped"
assert n(out) >= max(n(a), n(b)), "page count dropped"
tmp = mine + ".tmp"
with gzip.open(tmp, "wt", encoding="utf-8") as z: json.dump(out, z, ensure_ascii=False)
os.replace(tmp, mine)
print("merge: %d books, %d pages (release had %d/%d, run had %d/%d)" % (len(out["books"]), n(out), len(a["books"]), n(a), len(b["books"]), n(b)))
