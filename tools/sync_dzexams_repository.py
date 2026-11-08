#!/usr/bin/env python3
"""Import explicitly approved direct document URLs (DZExams or Raji3DZ) into the GitHub Pages repository.

Run only after obtaining written permission from the relevant rights holders:
  python tools/sync_dzexams_repository.py --csv templates/dzexams-approved-files.csv --permission-confirmed
  python tools/sync_dzexams_repository.py --source raji3dz --csv templates/raji3dz-approved-files.csv --permission-confirmed
The script does not crawl pages, bypass access controls, or publish anything itself.
Commit and push the resulting repository files/index through your normal GitHub review process.
"""
from __future__ import annotations
import argparse, csv, hashlib, json, re, sys, time
import urllib.error
from pathlib import Path
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
# One entry per approved source. Each source has its own host allow-list, index and folder,
# so files from different sites never mix and each can be removed independently.
SOURCES = {
    "dzexams": {"label": "DZExams", "allowed": ("dzexams.com", "dzexams.pro"), "schema": "sm-dzexams-index-v1",
                "index": WEB / "data" / "dzexams-repository-index.json", "dest": WEB / "repository" / "exams", "url_path": "repository/exams"},
    "raji3dz": {"label": "Raji3DZ", "allowed": ("raji3dz.com",), "schema": "sm-raji3dz-index-v1",
                "index": WEB / "data" / "raji3dz-repository-index.json", "dest": WEB / "repository" / "raji3dz", "url_path": "repository/raji3dz"},
}
# Backward-compatible module defaults (DZExams) used by existing tests and callers.
INDEX = SOURCES["dzexams"]["index"]
DEST = SOURCES["dzexams"]["dest"]
ALLOWED = SOURCES["dzexams"]["allowed"]
MAX_BYTES = 40 * 1024 * 1024
UA = "SM-Education-Approved-Exam-Importer/1.0"


def safe_name(value: str) -> str:
    value = unquote(value or "document")
    value = re.sub(r"[^\w.\-\u0600-\u06ff]+", "-", value, flags=re.UNICODE).strip("-.")
    return (value or "document")[:120]


def allowed_url(url: str, allowed: tuple | None = None) -> bool:
    p = urlparse(url)
    host = (p.hostname or "").lower()
    return p.scheme == "https" and any(host == h or host.endswith("." + h) for h in (allowed or ALLOWED))


def read_robots(url: str) -> RobotFileParser:
    p = urlparse(url)
    robots_url = f"{p.scheme}://{p.netloc}/robots.txt"
    req = Request(robots_url, headers={"User-Agent": UA})
    try:
        with urlopen(req, timeout=20) as r:
            raw = r.read(512_000).decode("utf-8", "replace")
        parser = RobotFileParser(); parser.set_url(robots_url); parser.parse(raw.splitlines())
        return parser
    except Exception as exc:
        # Fail closed: inability to verify robots.txt means no download.
        raise RuntimeError(f"Cannot verify robots.txt for {p.netloc}; refusing: {exc}") from exc


def download(url: str, robots: RobotFileParser, allowed: tuple | None = None) -> tuple[bytes, str]:
    allowed = allowed or ALLOWED
    if not allowed_url(url, allowed):
        raise ValueError("Only HTTPS URLs on " + ", ".join(allowed) + " and their subdomains are allowed")
    if not robots.can_fetch(UA, url):
        raise ValueError("robots.txt disallows this URL")
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*"})
    with urlopen(req, timeout=45) as r:
        final = r.geturl()
        if not allowed_url(final, allowed):
            raise ValueError("Redirect left the approved source hosts")
        data = r.read(MAX_BYTES + 1)
        content_type = r.headers.get("Content-Type", "").split(";", 1)[0].lower()
    if len(data) > MAX_BYTES:
        raise ValueError("File exceeds 40 MiB")
    if data.startswith(b"%PDF-"):
        ext = "pdf"
    elif data.startswith(b"PK\x03\x04") and (url.lower().split("?", 1)[0].endswith(".docx")):
        ext = "docx"
    elif data.startswith(bytes.fromhex("D0CF11E0A1B11AE1")):
        ext = "doc"
    else:
        raise ValueError(f"Response is not a supported PDF/Word document (Content-Type: {content_type})")
    return data, ext


def term_of(title):
    """1/2/3 from an Arabic exam title such as 'موضوع الفصل الأول رقم 1', else 0 (unknown)."""
    t = title or ""
    for n, pats in ((1, ("الفصل الأول", "الفصل الاول", "الفصل 1", "الثلاثي الأول", "الثلاثي الاول")),
                    (2, ("الفصل الثاني", "الفصل 2", "الثلاثي الثاني")),
                    (3, ("الفصل الثالث", "الفصل 3", "الثلاثي الثالث"))):
        if any(x in t for x in pats):
            return n
    return 0


def download_with_retry(url, robots, allowed, tries=3):
    """Retry only transient network errors; policy errors (robots, host, not-a-document) fail at once."""
    last = None
    for attempt in range(1, tries + 1):
        try:
            return download(url, robots, allowed)
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt < tries:
                last = exc; time.sleep(5 * attempt); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            if attempt < tries:
                time.sleep(5 * attempt); continue
            raise
    raise last


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", choices=sorted(SOURCES), default="dzexams", help="Which approved source the CSV belongs to (default: dzexams)")
    ap.add_argument("--csv", type=Path, required=True, help="CSV of direct URLs and grade/subject metadata")
    ap.add_argument("--permission-confirmed", action="store_true", help="Confirm written permission to store/re-publish these files in this repository")
    ap.add_argument("--public-base", default="https://smhk86.github.io/sm-education", help="GitHub Pages base URL")
    ap.add_argument("--delay", type=float, default=2.0, help="Pause between downloads (minimum 2 seconds)")
    ap.add_argument("--limit", type=int, default=0, help="Process at most N not-yet-imported rows in this run (0 = no limit); rerun to continue")
    ap.add_argument("--sample-per-group", type=int, default=0, help="Import at most N files per (grade, subject, term) group, counting files already imported (0 = off)")
    args = ap.parse_args()
    if not args.permission_confirmed:
        ap.error("Refusing to import without --permission-confirmed and documented rights-holder permission")
    if not args.csv.is_file():
        ap.error(f"CSV not found: {args.csv}")
    src = SOURCES[args.source]
    base = args.public_base.rstrip("/")
    if not base.startswith("https://"):
        ap.error("--public-base must use HTTPS")
    try:
        index_path, dest_root = src["index"], src["dest"]
        index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"schema": src["schema"], "items": []}
        if index.get("schema") != src["schema"] or not isinstance(index.get("items"), list):
            raise ValueError("Existing repository index has an unsupported schema")
        seen = {x.get("source_url") for x in index["items"]}
        added = 0
        with args.csv.open(encoding="utf-8-sig", newline="") as fh:
            rows = csv.DictReader(fh)
            required = {"url", "grade", "subject", "title"}
            if not rows.fieldnames or not required.issubset(set(rows.fieldnames)):
                raise ValueError("CSV headers must include url, grade, subject, title; optional: year, term, solution")
            if args.sample_per_group:
                counts = {}
                for x in index["items"]:
                    k = (x.get("grade"), x.get("subject"), term_of(x.get("title", "")))
                    counts[k] = counts.get(k, 0) + 1
                picked = []
                for row in rows:
                    u = (row.get("url") or "").strip()
                    k = ((row.get("grade") or "").strip(), (row.get("subject") or "").strip(), term_of(row.get("title") or ""))
                    if not u or u in seen or counts.get(k, 0) >= args.sample_per_group:
                        continue
                    counts[k] = counts.get(k, 0) + 1
                    picked.append(row)
                rows = picked
                print(f"Sample mode: {len(picked)} file(s) selected, at most {args.sample_per_group} per grade/subject/term.")
            robots_cache = {}
            failed = []
            attempted = 0
            def save_index():
                index["updated_at"] = time.strftime("%Y-%m-%d")
                index_path.parent.mkdir(parents=True, exist_ok=True)
                index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            for row in rows:
                url = (row.get("url") or "").strip()
                if not url or url in seen:
                    continue
                if args.limit and attempted >= args.limit:
                    print(f"Batch limit {args.limit} reached; run again to continue with the remaining rows.")
                    break
                attempted += 1
                title_for_log = (row.get("title") or url)[:80]
                try:
                    if not all((row.get(k) or "").strip() for k in ("grade", "subject", "title")):
                        raise ValueError("Row needs grade, subject and title")
                    origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
                    if origin not in robots_cache:
                        robots_cache[origin] = read_robots(url)
                    data, ext = download_with_retry(url, robots_cache[origin], src["allowed"])
                    digest = hashlib.sha256(data).hexdigest()[:12]
                    folder = safe_name(row["grade"])
                    filename = safe_name(row["title"]) + "-" + digest + "." + ext
                    rel = f"{folder}/{filename}"
                    target = dest_root / folder / filename
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    item = {"grade":row["grade"].strip(),"subject":row["subject"].strip(),"title":row["title"].strip(),"ext":ext,"file":f"{base}/{src['url_path']}/{rel}","source":args.source,"source_url":url,"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data),"rights_cleared":True}
                    for k in ("year", "term"):
                        if (row.get(k) or "").strip():
                            try: item[k] = int(row[k])
                            except ValueError: pass
                    item["solution"] = (row.get("solution") or "").strip().lower() in ("1","true","yes","نعم")
                    index["items"].append(item); seen.add(url); added += 1
                    save_index()  # progress survives a later failure or a cancelled run
                    print(f"Imported: {row['title']} ({len(data)} bytes)", flush=True)
                except Exception as exc:  # one bad row must never discard the rest of the batch
                    failed.append((title_for_log, url, str(exc)[:160]))
                    print(f"SKIPPED: {title_for_log} | {url} | {str(exc)[:160]}", file=sys.stderr, flush=True)
                time.sleep(max(2.0, args.delay))
        save_index()
        print(f"Done ({src['label']}): {added} new file(s), {len(failed)} skipped. Review files and index, then commit and push to GitHub.")
        for t, u, why in failed:
            print(f"  FAILED: {t} | {u} | {why}")
        if failed and not added:
            return 2
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
