#!/usr/bin/env python3
"""audit_vision.py - what the release 'data' holds per level, and what is still missing.

  python3 tools/audit_vision.py                 # all levels, uses the local catalogue if present
  python3 tools/audit_vision.py 2AS 5AP         # some levels
  python3 tools/audit_vision.py --catalogue     # (re)build the catalogue for those levels first (slow, eddirasa.com)
  python3 tools/audit_vision.py --offline       # use files already in ./audit_work, no download

For each book of the catalogue: pages stored, highest page, pages missing INSIDE that range.
A book absent from the release file is NOT STARTED. The total page count of a book is not
known here, so the tail after the highest page is reported as 'tail unknown' (see step 2).
Nothing secret is read or printed.
"""
import gzip, json, os, subprocess, sys

REPO, TAG = "smhk86/sm-textbooks", "data"
ALL = ["1AP", "2AP", "3AP", "4AP", "5AP", "1AM", "2AM", "3AM", "4AM", "1AS", "2AS", "3AS"]
WORK = "audit_work"
args = [x for x in sys.argv[1:] if not x.startswith("--")]
flags = {x for x in sys.argv[1:] if x.startswith("--")}
levels = [x.upper() for x in args] or ALL
os.makedirs(WORK, exist_ok=True)


def load_catalogue():
    p = os.path.join("textbooks_work", "catalogue.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def ranges(nums):
    out, s, prev = [], None, None
    for n in nums:
        if s is None:
            s = prev = n
        elif n == prev + 1:
            prev = n
        else:
            out.append((s, prev)); s = prev = n
    if s is not None:
        out.append((s, prev))
    return ",".join(str(a) if a == b else "%d-%d" % (a, b) for a, b in out)


total_missing_books = 0
rows = []
for L in levels:
    if "--catalogue" in flags:
        subprocess.run([sys.executable, "tools/fetch_textbooks.py", "catalogue", "--grade", L])
    cat = load_catalogue().get(L)
    f = os.path.join(WORK, L + "-sci.json.gz")
    if "--offline" not in flags:
        if os.path.exists(f):
            os.remove(f)
        subprocess.run(["gh", "release", "download", TAG, "--repo", REPO, "-p", L + "-sci.json.gz",
                        "-D", WORK, "--clobber"], capture_output=True)
    have = {}
    if os.path.exists(f):
        try:
            for b in json.load(gzip.open(f, "rt", encoding="utf-8")).get("books", []):
                have[b["id"]] = b
        except Exception as e:
            print("%s: unreadable file (%s)" % (L, e))
    else:
        print("%s: no file in the release yet" % L)
    if cat is None:
        print("%s: no catalogue here (run with --catalogue); books in file: %d" % (L, len(have)))
        cat = [{"id": i, "title": b.get("title", ""), "subject": b.get("subject", "?")} for i, b in have.items()]
    print("== %s: %d books in catalogue, %d in file" % (L, len(cat), len(have)))
    for b in cat:
        h = have.get(b["id"])
        if not h:
            total_missing_books += 1
            print("  %s  %-10s NOT STARTED" % (b["id"], b.get("subject", "?")))
            rows.append((L, b["id"], b.get("subject", "?"), 0, 0, ""))
            continue
        pages = sorted({p["page"] for p in h.get("pageTexts", [])})
        mx = pages[-1] if pages else 0
        miss = [n for n in range(1, mx + 1) if n not in set(pages)]
        print("  %s  %-10s pages=%-4d max=%-4d missing_inside=%-3d %s tail unknown"
              % (b["id"], b.get("subject", "?"), len(pages), mx, len(miss),
                 ("[" + ranges(miss)[:60] + "]") if miss else ""))
        rows.append((L, b["id"], b.get("subject", "?"), len(pages), mx, ranges(miss)))
print("\nbooks NOT STARTED: %d" % total_missing_books)
with open("audit_vision.csv", "w", encoding="utf-8") as o:
    o.write("level,id,subject,pages,max_page,missing_inside\n")
    for r in rows:
        o.write("%s,%s,%s,%d,%d,\"%s\"\n" % r)
print("saved: audit_vision.csv")
