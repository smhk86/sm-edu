import urllib.request, urllib.robotparser, http.cookiejar, json, os, re, time, hashlib
from html.parser import HTMLParser
H = "https://tafawoq.site"
UA = "SM-education-bot/1.0 (+https://github.com/smhk86/sm-edu)"
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
AR = {"math":"الرياضيات","arabic":"اللغة العربية","french":"اللغة الفرنسية","english":"اللغة الإنجليزية",
      "islamic":"التربية الإسلامية","civic":"التربية المدنية","history-geo":"التاريخ والجغرافيا",
      "science":"علوم الطبيعة والحياة","physics":"العلوم الفيزيائية","philosophy":"الفلسفة"}
def get(u):
    for t in range(6):
        try:
            time.sleep(3)
            return OP.open(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60).read().decode("utf-8", "ignore")
        except Exception as e:
            print("  retry", t + 1, u, str(e)[:60], flush=True); time.sleep(15)
    return None
rp = urllib.robotparser.RobotFileParser()
while True:
    r = get(H + "/robots.txt")
    if r is not None: rp.parse(r.splitlines()); break
class T(HTMLParser):
    def __init__(s): super().__init__(); s.o = []; s.ls = []; s.skip = 0; s.first = True
    def nl(s): s.o.append("\n")
    def handle_starttag(s, tag, a):
        if tag == "summary": s.skip += 1
        elif tag in ("script", "style"): s.skip += 1
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
    ls = [re.sub(r"[ \t\u00a0]+", " ", l).strip() for l in "".join(t.o).split("\n")]
    return "\n".join(l for l in ls if l)
db = json.load(open("tafawoq_index.json", encoding="utf-8"))
os.makedirs("exams_in/tafawoq_html", exist_ok=True)
out = {"schema": "sm-certificate-papers-v1", "items": []}
for i in sorted(db["items"], key=lambda x: (x["track"], x["subject"], x["n"])):
    u = i["page"]; tr = i["track"].upper()
    c = "exams_in/tafawoq_html/%s-%s-%d.html" % (tr, i["subject"], i["n"])
    if os.path.exists(c): h = open(c, encoding="utf-8").read()
    else:
        if not rp.can_fetch(UA, u): print("robots blocks:", u); continue
        h = get(u)
        if h is None: print("FAILED:", u, flush=True); continue
        open(c, "w", encoding="utf-8").write(h)
    a = h.find('<article class="exam-paper"')
    if a < 0: print("no article:", u); continue
    b = h.find("</article>", a)
    art = h[a:b]
    k = art.find('<details class="text-sol">')
    paper, sol = (art[:k], art[k:]) if k >= 0 else (art, "")
    text, solution = totext(paper), totext(sol)
    title = re.search(r'class="exam-title">([^<]*)', art)
    out["items"].append({"track": tr, "subject": AR[i["subject"]], "year": 2026,
        "title": title.group(1).strip() if title else "%s %s %d" % (tr, i["subject"], i["n"]),
        "kind": "مقترح", "text": text, "solution": solution, "source": "tafawoq.site (بإذن)",
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(), "rights_cleared": False,
        "page": u})
    json.dump(out, open("tafawoq_papers.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("items:", len(out["items"]), "| with solution:", sum(1 for x in out["items"] if len(x["solution"]) > 40))
