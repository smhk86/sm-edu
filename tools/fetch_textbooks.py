#!/usr/bin/env python3
"""fetch_textbooks_v5.py (faster ocr + relaxed filter) - textbooks from eddirasa.com -> per-level JSON.gz

Real structure (checked): /ens-cm/1am/textbooks/ lists book pages;
each book page has one or more direct .pdf links.

  python3 tools/fetch_textbooks.py catalogue --grade 1AM
  python3 tools/fetch_textbooks.py extract   --grade 1AM --limit 3
  python3 tools/fetch_textbooks.py pack      --grade 1AM
"""
import argparse, gzip, json, os, re, socket, subprocess, sys, time
import urllib.error, urllib.parse, urllib.request, urllib.robotparser
from html.parser import HTMLParser

BASE = "https://eddirasa.com"
UA = "SM-Education-textbook-indexer/1.0 (personal educational use; one request at a time)"
DELAY = 2.0
WORK = "textbooks_work"
OUT = "textbooks_out"

# level code -> candidate textbook-list paths (first that answers is used)
LEVELS = {}
for n in "1234":
    LEVELS[n + "AM"] = ["/ens-cm/%sam/textbooks/" % n]
for n, w in zip("12345", ["first", "second", "third", "fourth", "fifth"]):
    LEVELS[n + "AP"] = ["/ens-pri/%s-primary/textbooks/" % w,
                        "/ens-pri/%s-primary/books/" % w]
for n in "123":
    LEVELS[n + "AS"] = ["/ens-sec/%sas/textbooks/" % n]

SUBJECTS = [("رياضيات", "maths"), ("الرياضيات", "maths"), ("فيزياء", "physics"),
            ("الفيزياء", "physics"), ("فيزيائية", "physics"),
            ("إسلامية", "islamic"), ("اسلامية", "islamic"),  # before "علوم": «العلوم الإسلامية»
            ("علوم", "sciences"), ("عربية", "arabic"),
            ("فرنسية", "french"), ("انجليزية", "english"), ("إنجليزية", "english"),
            ("إسلامية", "islamic"), ("اسلامية", "islamic"), ("تاريخ", "history"),
            ("جغرافيا", "geography"), ("مدنية", "civic"), ("أمازيغية", "tamazight"),
            ("فنية", "art"), ("موسيقية", "music"), ("فلسفة", "philosophy"),
            ("إعلام", "informatique"), ("اقتصاد", "economics")]

_last = [0.0]
_robots = None


def log(*a):
    print(*a, flush=True)


def setup_ipv4(allow_v6):
    if allow_v6:
        return
    orig = socket.getaddrinfo
    socket.getaddrinfo = lambda h, p, f=0, t=0, pr=0, fl=0: orig(h, p, socket.AF_INET, t, pr, fl)


def allowed(url):
    global _robots
    if _robots is None:
        _robots = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(BASE + "/robots.txt", headers={"User-Agent": UA})
            txt = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")
            _robots.parse(txt.splitlines())
        except Exception:
            _robots.parse([])
    return _robots.can_fetch(UA, url)


def get(url, binary=False, timeout=40):
    if not allowed(url):
        log("  blocked by robots.txt:", url)
        return None
    for attempt in range(3):
        wait = DELAY - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            data = urllib.request.urlopen(req, timeout=timeout).read()
            return data if binary else data.decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                log("  STOP: server answered %d for %s" % (e.code, url))
                sys.exit(2)
            if e.code == 404:
                return None
            log("  HTTP %d for %s" % (e.code, url))
        except Exception as e:
            log("  no answer from %s (%s) - retry %d/3" % (url, e, attempt + 1))
            time.sleep(5 * (attempt + 1))
    return None


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self._href, self._txt = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._txt = []

    def handle_data(self, d):
        if self._href is not None:
            self._txt.append(d)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._txt).split())))
            self._href = None


def parse_links(html, page_url):
    p = Links()
    p.feed(html)
    return [(urllib.parse.urljoin(page_url, h), t) for h, t in p.links if h]


def book_pages(html, page_url):
    """Book pages = links whose text starts with 'كتاب' or contains 'حلول' is skipped."""
    seen, out = set(), []
    for url, text in parse_links(html, page_url):
        if "eddirasa.com" not in url or url in seen:
            continue
        if not re.match(r"^\s*كتاب", text):
            continue
        seen.add(url)
        title = re.sub(r"\s*\d+\s*$", "", text).strip()  # drop trailing file counter
        out.append((url, title))
    return out


def pdf_links(html, page_url):
    res = []
    for url, text in parse_links(html, page_url):
        if urllib.parse.unquote(url).lower().split("?")[0].endswith(".pdf"):
            res.append((url, text))
    return res


def guess_subject(title):
    for key, val in SUBJECTS:
        if key in title:
            return val
    return "other"


def cmd_catalogue(a):
    os.makedirs(WORK, exist_ok=True)
    grades = [a.grade.upper()] if a.grade else list(LEVELS)
    cat = {}
    for g in grades:
        html = url = None
        for path in LEVELS.get(g, []):
            url = BASE + path
            log("Level %s: %s" % (g, url))
            html = get(url)
            if html:
                break
        if not html:
            log("  no list page found for", g)
            continue
        for purl, title in book_pages(html, url):
            page = get(purl)
            if not page:
                continue
            pdfs = pdf_links(page, purl)
            if not pdfs:
                log("  no PDF link:", title)
                continue
            # first link = the current-generation full book
            cat.setdefault(g, []).append({
                "id": "%s-%02d" % (g, len(cat.get(g, [])) + 1),
                "grade": g, "title": title, "subject": guess_subject(title),
                "page": purl, "pdf": pdfs[0][0]})
            log("  + %s -> %s" % (title, urllib.parse.unquote(pdfs[0][0]).split("/")[-1]))
    old = {}
    p = os.path.join(WORK, "catalogue.json")
    if os.path.exists(p):
        old = json.load(open(p, encoding="utf-8"))
    old.update(cat)
    json.dump(old, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("Catalogue saved: %s" % {g: len(v) for g, v in cat.items()})


def fix_arabic(t):
    # reversed Arabic heuristic: lots of final forms at word starts is not reliable,
    # so only flag; real fixing is left to the quality check
    return t


def quality(pages):
    txt = "".join(pages)
    if len(txt) < 200 * max(1, len(pages)) * 0.2:
        return "scanned"
    ar = len(re.findall(r"[\u0600-\u06FF]", txt))
    la = len(re.findall(r"[A-Za-z]", txt))
    if ar + la < 0.5 * len(re.sub(r"\s", "", txt)):
        return "garbled"
    return "ok"


def cmd_extract(a):
    cat = json.load(open(os.path.join(WORK, "catalogue.json"), encoding="utf-8"))
    books = cat.get(a.grade.upper(), [])
    if a.limit:
        books = books[:a.limit]
    os.makedirs(os.path.join(WORK, "text"), exist_ok=True)
    for b in books:
        jp = os.path.join(WORK, "text", b["id"] + ".json")
        if os.path.exists(jp):
            log("skip (done):", b["title"])
            continue
        log("Downloading:", b["title"])
        data = get(b["pdf"], binary=True, timeout=120)
        if not data:
            continue
        pdf = os.path.join(WORK, b["id"] + ".pdf")
        open(pdf, "wb").write(data)
        try:
            raw = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True,
                                 timeout=300).stdout.decode("utf-8", "ignore")
        finally:
            os.remove(pdf)
        pages = raw.split("\f")
        if pages and not pages[-1].strip():
            pages.pop()
        q = quality(pages)
        b2 = dict(b, quality=q, pageTexts=[{"page": i + 1, "text": fix_arabic(t.strip())}
                                           for i, t in enumerate(pages) if len(t.strip()) >= 20])
        json.dump(b2, open(jp, "w", encoding="utf-8"), ensure_ascii=False)
        log("  %d pages, quality=%s" % (len(pages), q))


def cmd_pack(a):
    g = a.grade.upper()
    td = os.path.join(WORK, "text")
    books, report = [], []
    for f in sorted(os.listdir(td)):
        if not f.startswith(g + "-") or f.endswith("-test.json"):
            continue
        b = json.load(open(os.path.join(td, f), encoding="utf-8"))
        if b["quality"] not in ("ok", "ocr") or not b.get("pageTexts"):
            report.append({"id": b["id"], "title": b["title"], "quality": b["quality"]})
            continue
        books.append({k: b[k] for k in ("id", "title", "grade", "subject", "pageTexts")})
    os.makedirs(OUT, exist_ok=True)
    with gzip.open(os.path.join(OUT, g + ".json.gz"), "wt", encoding="utf-8") as z:
        json.dump({"grade": g, "books": books}, z, ensure_ascii=False)
    json.dump(report, open(os.path.join(OUT, "report-%s.json" % g), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    log("Packed %d books -> %s/%s.json.gz ; needs review: %d" % (len(books), OUT, g, len(report)))


TEXT_SUBJECTS = {"physics", "sciences", "maths", "arabic", "islamic", "history", "geography", "civic"}


def page_ok(text):
    """Filter for OCR output: keep pages that are mostly clean Arabic running text.
    Ornaments (verse brackets, quotes, digits, dashes) are stripped before measuring,
    so Quran/Hadith pages are no longer rejected for their decoration."""
    clean = re.sub(r"[\uFD3E\uFD3F\u00AB\u00BB\u2026\u0640\[\]{}()\"'*|_=~<>/\\\-\u2013\u2014.:,;!?"
                   r"\u060C\u061B\u061F0-9\u0660-\u0669]", " ", text)
    toks = re.findall(r"\S+", clean)
    if len(toks) < 15:
        return False, "short"
    ar_tok = [t for t in toks if re.fullmatch(r"[\u0600-\u06FF]{2,}", t)]
    if len(ar_tok) / len(toks) < 0.6:
        return False, "noisy"
    one = sum(1 for t in toks if len(re.sub(r"[^\u0600-\u06FF]", "", t)) <= 1)
    if one / len(toks) > 0.2:
        return False, "fragments"
    avg = sum(len(t) for t in ar_tok) / max(1, len(ar_tok))
    if not 2.5 <= avg <= 8:
        return False, "wordlen"
    return True, "ok"


def n_pages(pdf):
    out = subprocess.run(["pdfinfo", pdf], capture_output=True).stdout.decode("utf-8", "ignore")
    m = re.search(r"Pages:\s+(\d+)", out)
    return int(m.group(1)) if m else 0


def ocr_page(pdf, pg, a, tess):
    pre = os.path.join(WORK, "img", "p%d" % pg)
    subprocess.run(["pdftoppm", "-r", str(a.dpi), "-f", str(pg), "-l", str(pg),
                    "-png", "-singlefile", pdf, pre], check=True)
    env = dict(os.environ, OMP_THREAD_LIMIT="1")  # big speed-up on phones
    r = subprocess.run(["tesseract", pre + ".png", "-", "--tessdata-dir", tess,
                        "-l", "ara", "--oem", "1", "--psm", str(a.psm)],
                       capture_output=True, env=env)
    try:
        os.remove(pre + ".png")
    except OSError:
        pass
    return pg, r.stdout.decode("utf-8", "ignore").strip()


def cmd_ocr(a):
    from concurrent.futures import ThreadPoolExecutor
    cat = json.load(open(os.path.join(WORK, "catalogue.json"), encoding="utf-8"))
    books = cat.get(a.grade.upper(), [])
    if a.book:
        books = [b for b in books if a.book in b["title"] or a.book == b["id"]]
    else:
        books = [b for b in books if b["subject"] in TEXT_SUBJECTS]
    tess = os.path.expanduser(a.tessdata)
    os.makedirs(os.path.join(WORK, "text"), exist_ok=True)
    os.makedirs(os.path.join(WORK, "img"), exist_ok=True)
    for b in books:
        suffix = ".ocr-test.json" if a.pages else ".ocr.json"
        jp = os.path.join(WORK, "text", b["id"] + suffix)
        if os.path.exists(jp) and not a.force:
            log("skip (done):", b["title"])
            continue
        log("Book:", b["title"])
        pdf = os.path.join(WORK, b["id"] + ".pdf")
        if not os.path.exists(pdf):  # reuse the cached download
            data = get(b["pdf"], binary=True, timeout=180)
            if not data:
                continue
            open(pdf, "wb").write(data)
        total = n_pages(pdf)
        last = min(total, a.first + a.pages - 1) if a.pages else total
        kept, dropped, raw = [], {}, []
        t0 = time.time()
        try:
            with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
                for pg, text in ex.map(lambda p: ocr_page(pdf, p, a, tess), range(a.first, last + 1)):
                    ok, why = page_ok(text)
                    ntok = len(text.split())
                    if a.pages:
                        raw.append({"page": pg, "text": text})
                    if ok:
                        kept.append({"page": pg, "text": text})
                    else:
                        dropped[why] = dropped.get(why, 0) + 1
                    log("  page %d/%d: %s, %d words" % (pg, total, "kept" if ok else "dropped (%s)" % why, ntok))
        finally:
            if os.path.exists(pdf) and not a.pages:  # keep the PDF cached during test runs
                os.remove(pdf)
        rec = dict(b, quality="ocr", pageTexts=kept, dropped=dropped, total=total)
        if raw:
            rec["raw"] = raw
        json.dump(rec, open(jp, "w", encoding="utf-8"), ensure_ascii=False)
        log("  kept %d of %d pages checked, dropped %s, %.0fs" %
            (len(kept), last - a.first + 1, dropped, time.time() - t0))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["catalogue", "extract", "ocr", "pack"])
    ap.add_argument("--grade")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--allow-ipv6", action="store_true")
    ap.add_argument("--book", help="book id or part of its title (ocr)")
    ap.add_argument("--first", type=int, default=1, help="first page (ocr)")
    ap.add_argument("--pages", type=int, help="how many pages to OCR (test run)")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--psm", type=int, default=3)
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--tessdata", default="~/tessdata")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    setup_ipv4(a.allow_ipv6)
    {"catalogue": cmd_catalogue, "extract": cmd_extract, "ocr": cmd_ocr, "pack": cmd_pack}[a.cmd](a)
