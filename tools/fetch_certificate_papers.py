"""One command: fetch BEM/BAC papers from page URLs -> read them with Gemini vision -> add them to the app's certificates space.

urls.txt  (one per line, '#' = comment):   TRACK|subject|page URL
   BEM|اللغة العربية|https://eddirasa.com/6-...
   BAC|الفلسفة|https://eddirasa.com/forums/threads/2554/

Run (Termux):  GEMINI_API_KEYS="k1 k2 k3" python tools/fetch_certificate_papers.py urls.txt --rights-cleared --push
--rights-cleared  you confirm the site owners allowed this; otherwise the papers are not shown in the app.
The script obeys robots.txt, stays on the page's own host, waits between requests and only saves PDF / image files.
"""
import os, re, sys, time, argparse, subprocess, urllib.request, urllib.parse, urllib.robotparser
from html.parser import HTMLParser

UA = "SM-education-bot/1.0 (+https://github.com/smhk86/sm-edu)"
EXT = (".pdf", ".jpg", ".jpeg", ".png", ".webp")


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.found = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        u = d.get("href") if tag == "a" else d.get("src") if tag in ("img", "iframe", "embed") else None
        if u:
            self.found.append(u)


def file_links(html, base):
    p = Links()
    p.feed(html)
    out = []
    for u in p.found:
        full = urllib.parse.urljoin(base, u.split("#")[0])
        path = urllib.parse.urlparse(full).path.lower()
        if path.endswith(EXT) and full not in out:
            out.append(full)
    return out


def parse_line(line):
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    parts = [x.strip() for x in line.split("|", 2)]
    if len(parts) != 3 or parts[0].upper() not in ("BEM", "BAC") or not parts[2].startswith("http"):
        return None
    return parts[0].upper(), parts[1], parts[2]


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=60).read()
    return data if binary else data.decode("utf-8", "ignore")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls")
    ap.add_argument("--src", default="exams_in")
    ap.add_argument("--delay", type=float, default=3.0)
    ap.add_argument("--rights-cleared", action="store_true")
    ap.add_argument("--push", action="store_true", help="git add/commit/push the result")
    ap.add_argument("--model", default="gemini-3.5-flash")
    a = ap.parse_args()
    robots = {}
    n = 0
    for line in open(a.urls, encoding="utf-8"):
        row = parse_line(line)
        if not row:
            continue
        track, subject, page = row
        host = urllib.parse.urlparse(page).netloc
        if host not in robots:
            rp = urllib.robotparser.RobotFileParser("https://%s/robots.txt" % host)
            try:
                rp.read()
            except Exception:
                rp = None
            robots[host] = rp
        rp = robots[host]
        if rp is not None and not rp.can_fetch(UA, page):
            print("robots.txt forbids:", page)
            continue
        try:
            html = get(page)
        except Exception as e:
            print("page failed:", page, e)
            continue
        links = [u for u in file_links(html, page) if urllib.parse.urlparse(u).netloc == host and (rp is None or rp.can_fetch(UA, u))]
        if not links:
            print("no PDF/image link found in:", page, "(the file may be DOC or behind a button; download it by hand into exams_in/)")
        folder = os.path.join(a.src, track, subject)
        os.makedirs(folder, exist_ok=True)
        for u in links:
            name = urllib.parse.unquote(os.path.basename(urllib.parse.urlparse(u).path)) or "paper.pdf"
            dest = os.path.join(folder, name)
            if os.path.exists(dest):
                continue
            time.sleep(a.delay)
            try:
                open(dest, "wb").write(get(u, True))
                n += 1
                print("saved", dest)
            except Exception as e:
                print("download failed:", u, e)
        time.sleep(a.delay)
    print("downloaded files:", n)
    cmd = [sys.executable, os.path.join(os.path.dirname(__file__), "vision_exams.py"), "--src", a.src, "--model", a.model,
           "--source-name", "eddirasa.com"]
    if a.rights_cleared:
        cmd.append("--rights-cleared")
    if subprocess.call(cmd) != 0:
        sys.exit("vision step failed")
    if a.push:
        subprocess.call(["git", "add", "web/data/certificate-papers.json"])
        subprocess.call(["git", "commit", "-m", "Certificates: BEM/BAC papers (vision text)"])
        subprocess.call(["git", "push"])


if __name__ == "__main__":
    main()
