import urllib.parse, urllib.request, urllib.robotparser, http.cookiejar, json, os, re, sys, time
from html.parser import HTMLParser
H = "https://tafawoq.site"
UA = "SM-education-bot/1.0 (+https://github.com/smhk86/sm-edu)"
LV = ["0ap","1ap","2ap","3ap","4ap","5ap","1am","2am","3am","4am","1as","2as","3as"]
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def get(u, binary=False):
    for t in range(6):
        try:
            time.sleep(3)
            d = OP.open(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60).read()
            return d if binary else d.decode("utf-8", "ignore")
        except Exception as e:
            print("  retry", t + 1, u[-60:], str(e)[:50], flush=True); time.sleep(15)
    return None
rp = urllib.robotparser.RobotFileParser()
while True:
    r = get(H + "/robots.txt")
    if r is not None: rp.parse(r.splitlines()); break
ok = lambda u: rp.can_fetch(UA, u)
class T(HTMLParser):
    def __init__(s): super().__init__(); s.o = []; s.ls = []; s.skip = 0; s.first = True
    def nl(s): s.o.append("\n")
    def handle_starttag(s, tag, a):
        if tag in ("summary", "script", "style"): s.skip += 1
        elif tag in ("h2", "h3", "p", "div", "table", "br"): s.nl()
        elif tag in ("ol", "ul"): s.ls.append([tag, 0]); s.nl()
        elif tag == "li":
            s.nl()
            if s.ls:
                s.ls[-1][1] += 1
                s.o.append("%d) " % s.ls[-1][1] if s.ls[-1][0] == "ol" else "- ")
        elif tag == "tr": s.nl(); s.first = True
        elif tag in ("td", "th"):
            if not s.first: s.o.append(" | ")
            s.first = False
    def handle_endtag(s, tag):
        if tag in ("summary", "script", "style"): s.skip -= 1
        elif tag in ("ol", "ul") and s.ls: s.ls.pop(); s.nl()
        elif tag in ("h2", "h3", "p", "div", "table", "li"): s.nl()
    def handle_data(s, d):
        if not s.skip: s.o.append(d)
def totext(h):
    t = T(); t.feed(h)
    ls = [re.sub(r"[ \t\u00a0\u200b]+", " ", l).strip() for l in "".join(t.o).split("\n")]
    return "\n".join(l for l in ls if l)
OUT = "tafawoq_levels_index.json"
db = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {"schema": "sm-tafawoq-levels-v1", "items": []}
have = {(i["level"], i["subject"], i["slug"]) for i in db["items"]}
def save(u, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0: return True
    if not ok(u): print("robots blocks:", u); return False
    d = get(u, True)
    if not d or not d.startswith(b"%PDF"): print("  not a pdf / failed:", u[-70:]); return False
    os.makedirs(os.path.dirname(dest), exist_ok=True); open(dest, "wb").write(d); return True
def one(lv, s, sl):
    u = "%s/ar/%s/%s/%s" % (H, lv, s, sl)
    if not ok(u): print("robots blocks:", u); return
    os.makedirs("exams_in/tafawoq_levels_html", exist_ok=True)
    c = "exams_in/tafawoq_levels_html/%s-%s-%s.html" % (lv, s, sl)
    if os.path.exists(c): hp = open(c, encoding="utf-8").read()
    else:
        hp = get(u)
        if hp is None: print("FAILED page", u, flush=True); return
        open(c, "w", encoding="utf-8").write(hp)
    pdfs = list(dict.fromkeys(urllib.parse.urljoin(H + "/", x) for x in re.findall(r'href="((?:https://tafawoq\.site)?/files/[^"]+\.pdf)"', hp)))
    nm = lambda x: x.rsplit("/", 1)[-1].lower()
    sol = next((x for x in pdfs if "sol" in nm(x) or "corr" in nm(x)), None)
    pap = next((x for x in pdfs if x != sol), None)
    base = "exams_in/tafawoq_levels/%s/%s/%s" % (lv, s, sl)
    okp = save(pap, base + ".pdf") if pap else False
    oks = save(sol, base + ".sol.pdf") if (sol and okp) else False
    a = hp.find('<article class="exam-paper"'); text = solution = ""
    if a >= 0:
        art = hp[a:hp.find("</article>", a)]
        k = art.find('<details class="text-sol">')
        text = totext(art[:k] if k >= 0 else art)
        solution = totext(art[k:]) if k >= 0 else ""
    tt = re.search(r"<h1[^>]*>([^<]*)", hp)
    m = re.search(r"-t(\d)-", sl)
    db["items"].append({"level": lv, "subject": s, "slug": sl, "kind": sl.split("-")[0],
        "term": m.group(1) if m else "", "title": tt.group(1).strip() if tt else sl,
        "text": text, "solution": solution, "paper": base + ".pdf" if okp else None,
        "solution_file": base + ".sol.pdf" if oks else None, "page": u,
        "source": "tafawoq.site (بإذن)"})
    json.dump(db, open(OUT + ".tmp", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(OUT + ".tmp", OUT)
    print("  ok", sl, "| text", len(text), "| sol", len(solution), "| pdf", bool(okp), bool(oks), flush=True)
only = sys.argv[1:]
for lv in LV:
    if only and lv != only[0]: continue
    if not ok("%s/ar/%s" % (H, lv)): print("robots blocks level", lv); continue
    h = get("%s/ar/%s" % (H, lv))
    if h is None: print("FAILED level", lv); continue
    subs = sorted(set(re.findall(r'/ar/%s/([a-z0-9-]+)"' % lv, h)))
    for s in subs:
        if len(only) > 1 and s != only[1]: continue
        hs = get("%s/ar/%s/%s" % (H, lv, s))
        if hs is None: print("FAILED subject", lv, s); continue
        slugs = sorted(set(re.findall(r'/ar/%s/%s/([a-z0-9-]+)"' % (lv, s), hs)))
        print(lv, s, len(slugs), flush=True)
        for sl in slugs:
            if (lv, s, sl) not in have: one(lv, s, sl)
import collections
print("total:", len(db["items"]), dict(collections.Counter(i["level"] for i in db["items"])))
