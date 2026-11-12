import os, json, time, base64, gzip, argparse, subprocess
import urllib.request, urllib.error, urllib.parse

ap = argparse.ArgumentParser()
ap.add_argument("--grade", required=True)
ap.add_argument("--subjects", default="maths,physics,sciences")
ap.add_argument("--model", default="gemini-3.5-flash")
ap.add_argument("--fallback", default="gemini-2.5-flash")
ap.add_argument("--dpi", type=int, default=150)
ap.add_argument("--book", default="")
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--seed", default="")
a = ap.parse_args()
G = a.grade.upper()
KEY = os.environ["GEMINI_API_KEY"]
WORK, OUT = "textbooks_work", "textbooks_out"
VW = os.path.join(WORK, "vision")
os.makedirs(VW, exist_ok=True); os.makedirs(OUT, exist_ok=True)

PROMPT = ("Transcribe this page of an Algerian school textbook exactly, in reading order "
          "(Arabic is right-to-left). Write every math/physics/chemistry formula in LaTeX "
          "between $...$. For each figure or photo write one short line: [شكل: description]. "
          "Keep table rows as lines separated by ' | '. Output only the transcription, "
          "no comments. If the page has no meaningful text output EMPTY.")
URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"
model = [a.model]

class Quota(Exception):
    pass

def ask(b64):
    body = {"contents": [{"parts": [{"text": PROMPT},
            {"inline_data": {"mime_type": "image/jpeg", "data": b64}}]}],
            "generationConfig": {"temperature": 0}}
    hdr = {"Content-Type": "application/json", "x-goog-api-key": KEY}
    for t in range(6):
        req = urllib.request.Request(URL % model[0], json.dumps(body).encode(), hdr)
        try:
            r = json.load(urllib.request.urlopen(req, timeout=120))
            c = r.get("candidates") or []
            if not c:
                return ""
            parts = c[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts).strip()
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "ignore")[:200]
            if e.code == 404 and model[0] != a.fallback:
                print("  model 404 -> fallback", a.fallback); model[0] = a.fallback; continue
            if e.code in (429, 500, 503):
                if t == 5:
                    raise Quota(msg)
                print("  HTTP %d, wait %ds" % (e.code, 30 * (t + 1))); time.sleep(30 * (t + 1)); continue
            print("  HTTP", e.code, msg); return None
        except Exception as e:
            print("  error:", e); time.sleep(5)
    return None

def get_pdf(b):
    pdf = os.path.join(VW, b["id"] + ".pdf")
    url = urllib.parse.quote(b["pdf"], safe=":/%?=&")
    for _ in range(10):
        if os.path.exists(pdf) and subprocess.run(["pdfinfo", pdf], capture_output=True).returncode == 0:
            break
        subprocess.run(["curl", "-4", "-L", "-sS", "-C", "-", "--connect-timeout", "30", "-o", pdf, url])
        time.sleep(3)
    r = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True)
    if r.returncode != 0:
        return None, 0
    n = int([l.split()[1] for l in r.stdout.splitlines() if l.startswith("Pages:")][0])
    return pdf, n

cat = json.load(open(os.path.join(WORK, "catalogue.json"), encoding="utf-8"))
subs = set(a.subjects.split(","))
books = [b for b in cat.get(G, []) if b["subject"] in subs and (not a.book or a.book in b["title"])]
seedbooks = {}
if a.seed and os.path.exists(a.seed):
    for sb in json.load(gzip.open(a.seed, "rt", encoding="utf-8")).get("books", []):
        seedbooks[sb["id"]] = sb
allp = {}
for b in books:
    pf = os.path.join(VW, b["id"] + ".json")
    d = json.load(open(pf, encoding="utf-8")) if os.path.exists(pf) else {}
    for p in seedbooks.get(b["id"], {}).get("pageTexts", []):
        d.setdefault(str(p["page"]), p["text"])
    allp[b["id"]] = d
print("Books:", [b["title"][:25] for b in books])

def save(b):
    json.dump(allp[b["id"]], open(os.path.join(VW, b["id"] + ".json"), "w", encoding="utf-8"), ensure_ascii=False)

def pack():
    out, ids = [], set()
    for b in books:
        ids.add(b["id"])
        pp = allp[b["id"]]
        pages = [{"page": int(k), "text": v} for k, v in sorted(pp.items(), key=lambda x: int(x[0])) if len(v.strip()) >= 20]
        if pages:
            out.append({"id": b["id"], "title": b["title"], "grade": G, "subject": b["subject"], "pageTexts": pages})
    out += [sb for i, sb in seedbooks.items() if i not in ids]
    path = os.path.join(OUT, "%s-sci.json.gz" % G)
    with gzip.open(path, "wt", encoding="utf-8") as z:
        json.dump({"grade": G, "books": out}, z, ensure_ascii=False)
    print("Packed %d books -> %s" % (len(out), path))

try:
    for b in books:
        print("Book:", b["title"])
        pdf, n = get_pdf(b)
        if not pdf:
            print("  download failed"); continue
        last = min(n, a.limit) if a.limit else n
        done = allp[b["id"]]
        for p in range(1, last + 1):
            if str(p) in done:
                continue
            base = os.path.join(VW, "cur")
            r = subprocess.run(["pdftoppm", "-f", str(p), "-l", str(p), "-r", str(a.dpi),
                                "-jpeg", "-singlefile", pdf, base])
            if r.returncode != 0:
                continue
            txt = ask(base64.b64encode(open(base + ".jpg", "rb").read()).decode())
            if txt is None:
                continue
            done[str(p)] = txt
            print("  page %d/%d: %d chars" % (p, last, len(txt)))
            if p % 5 == 0:
                save(b)
            time.sleep(3)
        save(b)
except Quota as e:
    print("QUOTA reached, stopping:", e)
finally:
    for b in books:
        save(b)
    pack()
