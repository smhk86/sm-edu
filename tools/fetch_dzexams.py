#!/usr/bin/env python3
"""Fetch exam/homework files (PDF/Word) from dzexams pages into this repository.

Files go to web/exams/dzexams/ and an index goes to web/data/dzexams-index.json.
GitHub Pages then serves them and the app lists/downloads them from there.

Use ONLY with the written agreement of the site owners (covering copying + republishing).
Polite by design: robots.txt is read first (fail closed), sequential requests with a pause,
only allowed hosts over HTTPS, stop after repeated 403/429, no login bypass, size cap.

Usage:
  python tools/fetch_dzexams.py --page "الأولى متوسط=https://www.dzexams.pro/..." [--deep]
  python tools/fetch_dzexams.py --pages-file pages.txt      # one "GRADE=URL" per line
"""
import argparse, hashlib, json, re, sys, time, urllib.robotparser
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web/exams/dzexams"
INDEX = ROOT / "web/data/dzexams-index.json"
ALLOWED = ["dzexams.com", "dzexams.pro"]
UA = "SM-EDUCATION-content-sync/1.0 (owner-authorized)"
FILE_RX = re.compile(r"\.(pdf|docx?)$", re.I)
SKIP_PAGE = re.compile(r"(login|logout|register|signup|contact|privacy|terms|about|cdn-cgi|wp-admin|account|password)", re.I)
GENERIC = re.compile(r"^(?:|تحميل.*|تنزيل.*|download.*|télécharger.*|pdf|word|docx?|اضغط.*|هنا|click.*)$", re.I)
SOLUTION = re.compile(r"(حل|الحل|تصحيح|corrig|solution)", re.I)
SUBJECTS = [
    (r"(رياضيات|mathématiques|mathematiques|maths?\b)", "الرياضيات"),
    (r"(فيزياء|فيزيائية|physique|physics)", "العلوم الفيزيائية"),
    (r"(علوم\s*(الطبيعة|طبيعية)|طبيعة\s*والحياة|svt|sciences\s*naturelles)", "علوم الطبيعة والحياة"),
    (r"(لغة\s*عربية|اللغة\s*العربية|العربية|arabe|arabic)", "اللغة العربية"),
    (r"(فرنسية|français|francais|french)", "اللغة الفرنسية"),
    (r"(إنجليزية|انجليزية|anglais|english)", "اللغة الإنجليزية"),
    (r"(تاريخ|جغرافيا|histoire|géographie|geographie)", "التاريخ والجغرافيا"),
    (r"(إسلامية|اسلامية|islamique|islamic)", "التربية الإسلامية"),
    (r"(مدنية|civique)", "التربية المدنية"),
    (r"(فلسفة|philosophie)", "الفلسفة"),
    (r"(إعلام\s*آلي|اعلام\s*الي|informatique)", "الإعلام الآلي"),
    (r"(أمازيغية|امازيغية|tamazight)", "اللغة الأمازيغية"),
]


def subject_of(text):
    for rx, label in SUBJECTS:
        if re.search(rx, text or "", re.I):
            return label
    return ""


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.href, self.buf, self.items, self.title, self._in_title, self.h1, self._in_h1 = None, [], [], "", False, "", False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a":
            self.href, self.buf = a.get("href"), []
            self._t = a.get("title") or ""
        elif tag == "title":
            self._in_title = True
        elif tag == "h1" and not self.h1:
            self._in_h1 = True

    def handle_data(self, d):
        if self.href is not None:
            self.buf.append(d)
        if self._in_title:
            self.title += d
        if self._in_h1:
            self.h1 += d

    def handle_endtag(self, tag):
        if tag == "a" and self.href is not None:
            text = " ".join("".join(self.buf).split()) or " ".join(getattr(self, "_t", "").split())
            self.items.append((self.href, text))
            self.href = None
        elif tag == "title":
            self._in_title = False
        elif tag == "h1":
            self._in_h1 = False


class Fetcher:
    def __init__(self, delay, allow_local):
        self.delay, self.allow_local = delay, allow_local
        self.robots, self.last, self.refused = {}, 0.0, 0

    def host_ok(self, host):
        host = (host or "").lower()
        if self.allow_local and host in ("127.0.0.1", "localhost"):
            return True
        return any(host == h or host.endswith("." + h) for h in ALLOWED)

    def url_ok(self, url):
        p = urlparse(url)
        if p.scheme == "https" or (self.allow_local and p.scheme == "http" and p.hostname in ("127.0.0.1", "localhost")):
            return self.host_ok(p.hostname)
        return False

    def _wait(self):
        gap = time.time() - self.last
        if gap < self.delay:
            time.sleep(self.delay - gap)
        self.last = time.time()

    def _open(self, url, accept="*/*", limit=None):
        self._wait()
        req = Request(url, headers={"User-Agent": UA, "Accept": accept})
        try:
            r = urlopen(req, timeout=30)
        except HTTPError as e:
            if e.code in (403, 429):
                self.refused += 1
            raise
        return r

    def allowed(self, url):
        p = urlparse(url)
        origin = f"{p.scheme}://{p.netloc}"
        rp = self.robots.get(origin)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self._open(origin + "/robots.txt")
                rp.parse(r.read().decode("utf8", "replace").splitlines())
            except HTTPError as e:
                if e.code in (404, 410):
                    rp.parse([])
                else:
                    raise RuntimeError(f"robots.txt unreachable for {origin} (HTTP {e.code}); stopping (fail closed)")
            except URLError as e:
                raise RuntimeError(f"robots.txt unreachable for {origin}: {e.reason}")
            self.robots[origin] = rp
        return rp.can_fetch(UA, url)

    def html(self, url):
        if not self.allowed(url):
            raise PermissionError("robots.txt disallows " + url)
        r = self._open(url, "text/html,application/xhtml+xml")
        raw = r.read(5_000_000)
        return raw.decode(r.headers.get_content_charset() or "utf8", "replace")

    def file(self, url, max_bytes):
        if not self.allowed(url):
            raise PermissionError("robots.txt disallows " + url)
        r = self._open(url)
        total = int(r.headers.get("Content-Length") or 0)
        if total > max_bytes:
            raise ValueError("too big")
        data = r.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("too big")
        return data


def magic_ok(ext, data):
    if ext == "pdf":
        return data[:4] == b"%PDF"
    if ext == "docx":
        return data[:2] == b"PK"
    return data[:4] == b"\xd0\xcf\x11\xe0" or data[:2] == b"PK"


def safe_name(url, ext):
    base = unquote(urlparse(url).path.rsplit("/", 1)[-1])
    base = re.sub(r"\.(pdf|docx?)$", "", base, flags=re.I)
    base = re.sub(r"[^A-Za-z0-9_-]+", "-", base).strip("-")[:40] or "file"
    return f"{hashlib.sha1(url.encode()).hexdigest()[:8]}_{base}.{ext}"


def title_for(text, page_title, url):
    name = re.sub(r"[_-]+", " ", re.sub(r"\.(pdf|docx?)$", "", unquote(urlparse(url).path.rsplit("/", 1)[-1]), flags=re.I)).strip()
    t = text if text and not GENERIC.match(text) else (f"{page_title} — {name}" if page_title and name else page_title or name)
    return (t or "dzexams")[:160]


def load_index(path):
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except Exception:
        return {"version": 1, "documents": []}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", action="append", default=[], help='"GRADE=URL" (repeatable)')
    ap.add_argument("--pages-file", type=Path)
    ap.add_argument("--deep", action="store_true", help="also follow linked pages (max --max-pages)")
    ap.add_argument("--max-pages", type=int, default=12)
    ap.add_argument("--max-files", type=int, default=150, help="new files per run (keeps each run small)")
    ap.add_argument("--max-mb", type=int, default=40)
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--allow-local", action="store_true", help="tests only: allow http://127.0.0.1")
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--index", type=Path, default=INDEX)
    a = ap.parse_args()

    pages = list(a.page)
    if a.pages_file and a.pages_file.exists():
        pages += [l.strip() for l in a.pages_file.read_text(encoding="utf8").splitlines() if l.strip() and not l.startswith("#")]
    jobs = []
    for line in pages:
        if "=" not in line:
            print("skip (need GRADE=URL):", line)
            continue
        g, u = line.split("=", 1)
        jobs.append((g.strip(), u.strip()))
    if not jobs:
        sys.exit("No pages given. Use --page 'GRADE=URL' or --pages-file.")

    f = Fetcher(a.delay, a.allow_local)
    idx = load_index(a.index)
    docs = idx.get("documents", [])
    known = {(d.get("source_url"), d.get("grade")) for d in docs}
    a.out_dir.mkdir(parents=True, exist_ok=True)
    new = fail = 0
    max_bytes = a.max_mb * 1024 * 1024

    for grade, start in jobs:
        if not f.url_ok(start):
            print("skip (host/https not allowed):", start)
            continue
        queue, seen, n = [start.split("#")[0]], {start.split("#")[0]}, 0
        while queue and n < (a.max_pages if a.deep else 1) and f.refused < 3 and new < a.max_files:
            page = queue.pop(0)
            n += 1
            try:
                html = f.html(page)
            except PermissionError as e:
                print("robots:", e)
                continue
            except RuntimeError as e:
                sys.exit(str(e))
            except Exception as e:
                print("page failed:", page, e)
                if f.refused >= 3:
                    break
                continue
            p = Links()
            p.feed(html)
            ptitle = " ".join((p.h1 or p.title).split())
            print(f"[{grade}] {page}: {len(p.items)} links")
            for href, text in p.items:
                try:
                    u = urljoin(page, href)
                    pu = urlparse(u)
                except Exception:
                    continue
                if pu.scheme == "http" and pu.hostname not in ("127.0.0.1", "localhost"):
                    u = u.replace("http://", "https://", 1)
                u = u.split("#")[0]
                if FILE_RX.search(urlparse(u).path):
                    if not f.url_ok(u) or (u, grade) in known:
                        continue
                    if new >= a.max_files:
                        break
                    ext = FILE_RX.search(urlparse(u).path).group(1).lower()
                    name = safe_name(u, ext)
                    dest = a.out_dir / name
                    try:
                        data = f.file(u, max_bytes)
                        if not data or not magic_ok(ext, data):
                            raise ValueError("not a valid document")
                    except PermissionError as e:
                        print("robots:", e)
                        continue
                    except Exception as e:
                        fail += 1
                        print("  skip", u, "->", e)
                        if f.refused >= 3:
                            break
                        continue
                    dest.write_bytes(data)
                    rel = "exams/dzexams/" + name
                    docs.append({"file": rel, "title": title_for(text, ptitle, u), "subject": subject_of(f"{text} {ptitle} {u}"),
                                 "grade": grade, "ext": ext, "solution": bool(SOLUTION.search(f"{text} {u}")), "bytes": len(data),
                                 "source_url": u, "source_page": page, "fetched_at": datetime.now(timezone.utc).isoformat()})
                    known.add((u, grade))
                    new += 1
                    print("  +", rel, len(data), "bytes")
                elif a.deep:
                    c = u
                    if c not in seen and f.url_ok(c) and not SKIP_PAGE.search(urlparse(c).path):
                        seen.add(c)
                        queue.append(c)

    idx = {"version": 1, "generated_at": datetime.now(timezone.utc).isoformat(), "count": len(docs), "documents": docs}
    a.index.parent.mkdir(parents=True, exist_ok=True)
    a.index.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf8")
    print(json.dumps({"new_files": new, "failed": fail, "total_in_index": len(docs), "refused": f.refused}, ensure_ascii=False))
    if f.refused >= 3:
        print("Stopped early: the site refused several requests (403/429). Try later.")


if __name__ == "__main__":
    main()
