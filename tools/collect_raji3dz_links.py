#!/usr/bin/env python3
"""Collect Raji3DZ file ids from public listing pages -> templates/raji3dz-approved-files.csv.
Obeys robots.txt, >=2s between requests, no '?' URLs. Never downloads the files."""
import argparse, csv, re, sys, time, html
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

BASE = "https://raji3dz.com"
UA = "Mozilla/5.0 (SM-EDU link collector)"
STAGE = {"ap": "ابتدائي", "am": "متوسط", "as": "ثانوي"}
ORD = {"1": "الأولى", "2": "الثانية", "3": "الثالثة", "4": "الرابعة", "5": "الخامسة"}
SUBJECTS = ["arabe", "mathematiques", "islamia", "francais", "anglais", "physique",
            "sciences-naturelles", "histoire-geographie", "tarbia-madania",
            "technologie", "philosophie", "informatique", "allemand"]
ITEM = re.compile(r'<div class="exam-item"([^>]*)>')
ATTR = re.compile(r'([\w-]+)="([^"]*)"')

def grade_name(level):
    m = re.fullmatch(r"([1-5])(ap|am|as)", level)
    if not m or (m[2] == "am" and m[1] == "5") or (m[2] == "as" and m[1] in "45"):
        return None
    return f"{ORD[m[1]]} {STAGE[m[2]]}"

def parse(page, level, subj_dir):
    grade = grade_name(level)
    rows = []
    for m in ITEM.finditer(page):
        a = {k: html.unescape(v) for k, v in ATTR.findall(m[1])}
        fid, href, title = a.get("data-file-id", ""), a.get("data-href", ""), a.get("data-title", "")
        if not (fid and re.fullmatch(r"[\w-]{10,80}", fid) and title):
            continue
        parts = [p.strip() for p in title.split(" - ")]
        subject = parts[1] if len(parts) >= 3 else subj_dir
        t = re.search(r"-t([123])-", href)
        label = a.get("aria-label", "")
        sol = "حل" in label and "بدون حل" not in label
        rows.append({"url": f"{BASE}/api/pdf/{fid}", "grade": grade, "subject": subject,
                     "title": title, "year": a.get("data-year", ""), "term": t[1] if t else "",
                     "solution": "true" if sol else "false"})
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", required=True, help="e.g. 1ap 2ap 1am 1as")
    ap.add_argument("--subjects", nargs="*", default=SUBJECTS)
    ap.add_argument("--csv", type=Path, default=Path("templates/raji3dz-approved-files.csv"))
    a = ap.parse_args()
    if not grade_name(a.level):
        sys.exit(f"Unsupported level '{a.level}' (supported: 1-5ap, 1-4am, 1-3as)")
    rp = RobotFileParser(); rp.set_url(BASE + "/robots.txt")
    try:
        rp.parse(urlopen(Request(rp.url, headers={"User-Agent": UA}), timeout=20).read().decode("utf-8", "replace").splitlines())
    except Exception as e:
        sys.exit(f"Cannot verify robots.txt, refusing: {e}")
    fields = ["url", "grade", "subject", "title", "year", "term", "solution"]
    have = set()
    if a.csv.exists():
        with a.csv.open(encoding="utf-8-sig", newline="") as f:
            have = {r["url"] for r in csv.DictReader(f)}
    new = not a.csv.exists() or a.csv.stat().st_size == 0
    total = 0
    with a.csv.open("a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        if new: w.writeheader()
        for s in a.subjects:
            url = f"{BASE}/{a.level}/{s}/index.html"
            if "?" in url or not rp.can_fetch(UA, url):
                print("skip (robots):", url); continue
            time.sleep(2)
            try:
                page = urlopen(Request(url, headers={"User-Agent": UA}), timeout=30).read().decode("utf-8", "replace")
            except Exception as e:
                print("no page:", s, e); continue
            if "404" in (re.search(r"<title>([^<]*)", page) or [0, ""])[1]:
                print("404:", s); continue
            rows = [r for r in parse(page, a.level, s) if r["url"] not in have]
            for r in rows: w.writerow(r); have.add(r["url"])
            total += len(rows)
            print(f"{a.level}/{s}: {len(rows)} new")
    print("Total new rows:", total)

if __name__ == "__main__":
    main()
