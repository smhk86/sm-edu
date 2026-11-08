#!/usr/bin/env python3
"""Clean templates/raji3dz-approved-files.csv: put the real SUBJECT in the subject column, move branch/kind to their own columns.
Rows already imported (their URL is in the repository index) are left untouched so existing groups stay consistent.
Rows whose subject cannot be determined go to templates/raji3dz-unclassified.csv and are NOT downloaded.
Usage (repo root):  python3 tools/clean_raji3dz_csv.py --dry-run      (report only)
                    python3 tools/clean_raji3dz_csv.py                (writes; keeps a .bak copy)"""
import argparse, collections, csv, json, re, shutil
from pathlib import Path

SLUG = {  # folder name used by the site -> canonical subject name (by stage)
    "arabe": "اللغة العربية", "mathematiques": "الرياضيات", "francais": "اللغة الفرنسية", "anglais": "اللغة الإنجليزية",
    "allemand": "اللغة الألمانية", "philosophie": "الفلسفة", "informatique": "الإعلام الآلي", "tarbia-madania": "التربية المدنية",
    "histoire-geographie": "التاريخ والجغرافيا", "sciences-naturelles": "العلوم الطبيعية",
    "islamia": {"p": "التربية الإسلامية", "m": "التربية الإسلامية", "s": "العلوم الإسلامية"},
    "physique": {"p": "التربية العلمية والتكنولوجية", "m": "العلوم الفيزيائية والتكنولوجيا", "s": "العلوم الفيزيائية"},
    "technologie": {"p": "التربية العلمية والتكنولوجية", "m": "العلوم الفيزيائية والتكنولوجيا", "s": "التكنولوجيا"},
}
KEYWORDS = [  # (regex, canonical) searched inside title segments
    (r"عربية", "اللغة العربية"), (r"رياضيات", "الرياضيات"), (r"فرنسية", "اللغة الفرنسية"), (r"[إا]نجليزية", "اللغة الإنجليزية"),
    (r"[أا]لمانية", "اللغة الألمانية"), (r"فلسفة", "الفلسفة"), (r"إعلام|معلوماتية", "الإعلام الآلي"), (r"مدنية", "التربية المدنية"),
    (r"تاريخ|جغرافيا", "التاريخ والجغرافيا"), (r"طبيعة|طبيعية|الحياة", "العلوم الطبيعية"),
    (r"[إا]سلامية", {"p": "التربية الإسلامية", "m": "التربية الإسلامية", "s": "العلوم الإسلامية"}),
    (r"فيزياء|فيزيائية", {"p": "التربية العلمية والتكنولوجية", "m": "العلوم الفيزيائية والتكنولوجيا", "s": "العلوم الفيزيائية"}),
    (r"تكنولوجيا", {"p": "التربية العلمية والتكنولوجية", "m": "العلوم الفيزيائية والتكنولوجيا", "s": "التكنولوجيا"}),
]
KIND = re.compile(r"فرض|اختبار|إختبار|امتحان|واجب|موضوع|ورقة|سلسلة|تمارين|ملخص|درس")

def stage(grade):
    return "p" if "ابتدائي" in grade else "m" if "متوسط" in grade else "s"

def pick(v, st):
    return v[st] if isinstance(v, dict) else v

def canon_names():
    out = set()
    for v in list(SLUG.values()) + [n for _, n in KEYWORDS]:
        out |= set(v.values()) if isinstance(v, dict) else {v}
    return out
CANON = canon_names()
BRANCH = re.compile(r"ج\.م\.[^\s]+")

def classify(row):
    st = stage(row["grade"]); subj = row["subject"].strip(); title = row["title"]
    segs = [s.strip() for s in title.split(" - ")]
    segs = segs[:-1] if len(segs) > 1 else segs          # last segment is the grade ("1 ثانوي")
    if subj in SLUG:                                      # latin folder name: trust it
        return pick(SLUG[subj], st), "", ""
    if subj in CANON:                                     # already a real subject name: keep it
        kind = next((p for p in segs if KIND.search(p) and not re.fullmatch(r"(الموضوع|موضوع)\s*رقم\s*\d+", p)), "")
        return subj, "", kind
    found = None; rest = []
    for s in reversed(segs):                              # subject is usually the last meaningful segment
        if found is None:
            for rx, name in KEYWORDS:
                if re.search(rx, s):
                    found = pick(name, st); break
            else:
                rest.append(s)
            continue
        rest.append(s)
    if found is None:
        for rx, name in KEYWORDS:                         # last resort: the heading itself
            if re.search(rx, subj): found = pick(name, st); break
    parts = [subj] + [r for r in rest if not re.fullmatch(r"(الموضوع|موضوع)\s*رقم\s*\d+", r)]
    kind = next((p for p in parts if KIND.search(p)), "")
    m = BRANCH.search(" ".join(parts))                    # common-core branches: ج.م.ع.ت / ج.م.آ
    if m:
        branch = m.group(0); kind = re.sub(r"\s*" + re.escape(branch), "", kind).strip()
    else:
        branch = next((p for p in parts if p != kind and not KIND.search(p)), "")
    return found, branch, kind

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", default="templates/raji3dz-approved-files.csv")
    ap.add_argument("--index", default="web/data/raji3dz-repository-index.json")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    src = Path(a.csv)
    imported = set()
    if Path(a.index).exists():
        imported = {x.get("source_url") for x in json.load(open(a.index, encoding="utf-8")).get("items", [])}
    rows = list(csv.DictReader(open(src, encoding="utf-8-sig", newline="")))
    cols = list(rows[0].keys()) if rows else []
    for extra in ("branch", "kind"):
        if extra not in cols: cols.append(extra)
    keep, unc, changed, stats = [], [], 0, collections.Counter()
    for r in rows:
        r.setdefault("branch", ""); r.setdefault("kind", "")
        if r["url"] in imported:
            keep.append(r); stats["already imported (untouched)"] += 1; continue
        subj, branch, kind = classify(r)
        if not subj:
            r["branch"], r["kind"] = branch, kind; unc.append(r); stats["unclassified"] += 1; continue
        if subj != r["subject"]: changed += 1
        r["subject"], r["branch"], r["kind"] = subj, branch, kind
        keep.append(r); stats["classified"] += 1
    print(dict(stats), "| subject changed on", changed, "rows")
    grp = collections.defaultdict(set)
    for r in keep: grp[r["grade"]].add(r["subject"])
    print("distinct subjects per grade (should be ~8-13):")
    for g in sorted(grp): print(f"  {g}: {len(grp[g])}")
    sample = collections.Counter((r["grade"], r["title"].split(" - ")[1] if " - " in r["title"] else "?") for r in unc)
    print("unclassified examples:")
    for (g, t), n in sample.most_common(12): print(f"  {n:4d}  {g} | {t[:60]}")
    if a.dry_run:
        print("(dry run: nothing written)"); return
    shutil.copy(src, str(src) + ".bak")
    with open(src, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(keep)
    if unc:
        with open(src.with_name("raji3dz-unclassified.csv"), "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(unc)
    print(f"wrote {src} ({len(keep)} rows, backup .bak) and unclassified file ({len(unc)} rows)")
if __name__ == "__main__":
    main()
