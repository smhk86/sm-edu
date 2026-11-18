import os, re, sys, json, time, hashlib, argparse, glob, urllib.request, urllib.parse, urllib.robotparser
from html.parser import HTMLParser
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vision_exams as V

RETRY = 300
_ask = V.ask

def ask_forever(path, pool, model):
    while True:
        try:
            return _ask(path, pool, model)
        except V.AllKeysExhausted:
            print("all keys are out of quota; retrying in %d s" % RETRY, flush=True)
            time.sleep(RETRY)
            pool.dead.clear()
            pool.i = 0

V.ask = ask_forever

H = "https://eddirasa.com"
UA = "SM-education-bot/1.0 (+https://github.com/smhk86/sm-edu)"
EXT = (".pdf", ".jpg", ".jpeg", ".png", ".webp")
DELAY = 3.0
import http.cookiejar
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
rp = urllib.robotparser.RobotFileParser(H + "/robots.txt")
while True:
    try:
        rp.parse(OP.open(urllib.request.Request(H + "/robots.txt", headers={"User-Agent": UA}), timeout=60).read().decode("utf-8", "ignore").splitlines())
        break
    except Exception:
        print("no network yet; waiting 30 s", flush=True)
        time.sleep(30)

def ok(u):
    return rp is None or rp.can_fetch(UA, u)

def get(u, binary=False):
    data = OP.open(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60).read()
    return data if binary else data.decode("utf-8", "ignore")

def page(u):
    if not ok(u):
        print("robots:", u)
        return ""
    time.sleep(DELAY)
    try:
        return get(u)
    except Exception as e:
        print("page failed:", u, e)
        return ""

class P(HTMLParser):
    def __init__(s):
        super().__init__()
        s.subj, s.href, s.txt, s.pairs, s.links, s.found = "", None, "", [], [], []
    def handle_starttag(s, t, a):
        a = dict(a)
        if t == "img" and (a.get("alt") or "").startswith("أيقونة "):
            s.subj = a["alt"][len("أيقونة "):].strip()
        u = a.get("href") if t == "a" else a.get("src") if t in ("img", "iframe", "embed") else None
        if u:
            s.found.append(u)
        if t == "a":
            s.href, s.txt = a.get("href"), ""
    def handle_data(s, d):
        if s.href:
            s.txt += d
    def handle_endtag(s, t):
        if t == "a" and s.href:
            full = urllib.parse.urljoin(H, s.href)
            s.links.append(full)
            w = s.txt.strip()
            if w == "الموضوع":
                s.pairs.append([s.subj, full, None])
            elif w == "التصحيح" and s.pairs and s.pairs[-1][2] is None:
                s.pairs[-1][2] = full
            s.href = None

def parsed(u):
    p = P()
    p.feed(page(u))
    return p

def files(u):
    p, base, out, pdfs = parsed(u), u, [], []
    for x in p.found:
        full = urllib.parse.urljoin(base, x.split("#")[0])
        for f in urllib.parse.parse_qs(urllib.parse.urlparse(full).query).get("file", []):
            f = urllib.parse.urljoin(base, f)
            if f.lower().split("?")[0].endswith(".pdf") and f not in pdfs:
                pdfs.append(f)
        path = urllib.parse.urlparse(full).path.lower()
        if path.endswith(EXT) and full not in out and "app-install" not in path and not path.endswith("/eddirasa.png"):
            out.append(full)
    host = urllib.parse.urlparse(base).netloc
    return [x for x in (pdfs or out) if urllib.parse.urlparse(x).netloc == host and ok(x)]

def save(u, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return True
    time.sleep(DELAY)
    try:
        data = get(u, True)
    except Exception as e:
        print("download failed:", u, e)
        return False
    open(dest, "wb").write(data)
    print("saved", dest)
    return True

def crawl():
    prs, seen = [], set()
    def add(track, group):
        for s, u, c in group:
            if u not in seen:
                seen.add(u)
                prs.append({"track": track, "subject": s or "مادة", "paper": u, "cor": c})
    for y in range(2026, 2006, -1):
        p = parsed("%s/ens-cm/4am/bem-solutions/bem-%d/" % (H, y))
        add("BEM", p.pairs)
        print("BEM", y, len(p.pairs), flush=True)
    for y in range(2026, 2007, -1):
        yu = "%s/ens-sec/3as/bac-solutions/bac-%d/" % (H, y)
        p, n = parsed(yu), 0
        for b in dict.fromkeys(l for l in p.links if l.startswith(yu) and l.rstrip("/") != yu.rstrip("/")):
            q = parsed(b)
            add("BAC", q.pairs)
            n += len(q.pairs)
        print("BAC", y, n, flush=True)
    return prs

def keys_from(path):
    out = []
    for k in re.split(r"[\s,;]+", open(os.path.expanduser(path), encoding="utf-8").read()):
        if k and k not in out:
            out.append(k)
    return out

def merge(files):
    final, items, by = "web/data/certificate-papers.json", [], {}
    for f in [final] + files:
        if not os.path.exists(f):
            continue
        try:
            part = json.load(open(f, encoding="utf-8")).get("items", [])
        except Exception as e:
            print("skip", f, e)
            continue
        for i in part:
            o = by.get(i["sha256"])
            if o is None:
                by[i["sha256"]] = i
                items.append(i)
            else:
                if not o.get("solution") and i.get("solution"):
                    o["solution"] = i["solution"]
                o["rights_cleared"] = bool(o.get("rights_cleared") or i.get("rights_cleared"))
    json.dump({"schema": "sm-certificate-papers-v1", "items": items}, open(final + ".tmp", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(final + ".tmp", final)
    print("merged:", len(items), "| with solution:", sum(1 for i in items if i.get("solution")))

MS = {"models": [], "dead": set(), "cool": {}, "bad": set(), "last": None}

def ask_multi(path, pool, model):
    import base64, urllib.error
    ms, n = MS["models"], len(pool.keys)
    body = json.dumps({"contents": [{"parts": [{"text": V.PROMPT}, {"inline_data": {
        "mime_type": V.MIME[os.path.splitext(path)[1].lower()],
        "data": base64.b64encode(open(path, "rb").read()).decode()}}]}],
        "generationConfig": {"temperature": 0}}).encode()
    errs = soft = 0
    while True:
        now, pick, wait = time.time(), None, None
        for k in range(n):
            if k in MS["bad"]:
                continue
            for j in range(len(ms)):
                if (k, j) in MS["dead"]:
                    continue
                t = max(MS["cool"].get((k, j), 0), MS["cool"].get(("m", j), 0))
                if t <= now:
                    pick = (k, j)
                    break
                wait = t - now if wait is None else min(wait, t - now)
            if pick:
                break
        if pick is None:
            if wait is None:
                print("all keys x models are out of quota; retrying in %d s" % RETRY, flush=True)
                time.sleep(RETRY)
                MS["dead"].clear()
            else:
                time.sleep(min(wait, 30) + 1)
            continue
        k, j = pick
        if MS["last"] != pick:
            print("  -> key %d/%d, model %s" % (k + 1, n, ms[j]), flush=True)
            MS["last"] = pick
        req = urllib.request.Request(V.URL % ms[j], body, {"Content-Type": "application/json", "x-goog-api-key": pool.keys[k]})
        try:
            r = json.load(urllib.request.urlopen(req, timeout=180))
            c = (r.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            return "".join(x.get("text", "") for x in c).strip()
        except urllib.error.HTTPError as e:
            full = e.read().decode("utf-8", "ignore")
            if e.code == 429 and ("PerDay" in full or "per day" in full.lower()):
                MS["dead"].add(pick)
                print("  key %d, model %s: daily quota out" % (k + 1, ms[j]), flush=True)
            elif e.code in (401, 403) or (e.code == 400 and ("API key" in full or "API_KEY" in full)):
                MS["bad"].add(k)
                print("  key %d rejected (HTTP %d)" % (k + 1, e.code), flush=True)
            elif e.code == 404:
                MS["dead"].add(pick)
                print("  model %s unavailable for key %d" % (ms[j], k + 1), flush=True)
            elif e.code in (429, 500, 503):
                soft += 1
                if soft > 12:
                    print("  HTTP", e.code, "persistent; skipping this file for now", flush=True)
                    return ""
                MS["cool"][pick if e.code == 429 else ("m", j)] = time.time() + (60 if e.code == 429 else 90)
            else:
                print("  HTTP", e.code, full[:160], flush=True)
                return ""
        except Exception as e:
            errs += 1
            if errs > 3:
                print("  error:", e, flush=True)
                return ""
            time.sleep(5)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="exams_in")
    ap.add_argument("--out", default="web/data/certificate-papers.json")
    ap.add_argument("--model", default="gemini-3.5-flash")
    ap.add_argument("--rights-cleared", action="store_true")
    ap.add_argument("--track", choices=["BEM", "BAC"])
    ap.add_argument("--keys-file")
    ap.add_argument("--done", default="certs_done.json")
    ap.add_argument("--merge", nargs="+")
    ap.add_argument("--part")
    ap.add_argument("--models")
    a = ap.parse_args()
    if a.merge:
        return merge(a.merge)
    if a.keys_file:
        V.keys = lambda: keys_from(a.keys_file)
    ks = V.keys()
    if not ks:
        sys.exit("no Gemini key (put them in ~/.sm_gemini_keys)")
    pool = V.KeyPool(ks)
    if a.models:
        MS["models"] = [m.strip() for m in a.models.split(",") if m.strip()]
        V.ask = ask_multi
    if os.path.exists("certs_pairs.json"):
        prs = json.load(open("certs_pairs.json", encoding="utf-8"))
    else:
        prs = crawl()
        json.dump(prs, open("certs_pairs.json", "w", encoding="utf-8"), ensure_ascii=False)
    if a.track:
        prs = [x for x in prs if x["track"] == a.track]
    if a.part:
        k, n = map(int, a.part.split("/"))
        z = -(-len(prs) // n)
        prs = prs[(k - 1) * z:k * z]
    print("pairs:", len(prs), "| with correction:", sum(1 for x in prs if x["cor"]), flush=True)
    done = set(json.load(open(a.done))) if os.path.exists(a.done) else set()
    db = {"schema": "sm-certificate-papers-v1", "items": []}
    if os.path.exists(a.out):
        db = json.load(open(a.out, encoding="utf-8"))
    bysha = {i["sha256"]: i for i in db["items"]}
    def dump():
        os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
        json.dump(db, open(a.out + ".tmp", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        os.replace(a.out + ".tmp", a.out)
        json.dump(sorted(done), open(a.done, "w"))
    try:
        for n, pr in enumerate(prs, 1):
            if pr["paper"] in done:
                continue
            print("[%d/%d] %s | %s" % (n, len(prs), pr["track"], pr["subject"]), flush=True)
            folder = os.path.join(a.src, pr["track"], pr["subject"])
            os.makedirs(folder, exist_ok=True)
            pfiles = []
            for u in files(pr["paper"]):
                dest = os.path.join(folder, urllib.parse.unquote(os.path.basename(urllib.parse.urlparse(u).path)) or "paper.pdf")
                if save(u, dest):
                    pfiles.append(dest)
            if not pfiles:
                print("  no file found:", pr["paper"])
                continue
            stem = os.path.splitext(os.path.basename(pfiles[0]))[0]
            if pr["cor"]:
                for j, u in enumerate(files(pr["cor"])):
                    ext = os.path.splitext(urllib.parse.urlparse(u).path)[1].lower()
                    save(u, os.path.join(folder, "%s.sol%s%s" % (stem, "" if j == 0 else j + 1, ext)))
            complete = True
            for k, p in enumerate(pfiles):
                meta = V.parse_path(os.path.relpath(p, a.src))
                if not meta:
                    continue
                sha = hashlib.sha256(open(p, "rb").read()).hexdigest()
                item = bysha.get(sha)
                if item is None:
                    text = V.ask(p, pool, a.model)
                    if not text:
                        complete = False
                        continue
                    q, sol = V.split_solution(text)
                    track, subject, year, title = meta
                    item = {"track": track, "subject": subject, "year": year, "title": title, "kind": "مقترح",
                            "text": q, "solution": sol, "source": "eddirasa.com", "sha256": sha, "rights_cleared": False}
                    db["items"].append(item)
                    bysha[sha] = item
                if a.rights_cleared:
                    item["rights_cleared"] = True
                if k == 0 and pr["cor"] and not item.get("solution"):
                    parts = []
                    sp = os.path.splitext(p)[0]
                    for s in sorted(glob.glob(glob.escape(sp) + ".sol*")):
                        t = V.ask(s, pool, a.model)
                        if t:
                            qq, ss = V.split_solution(t)
                            parts.append(ss or qq)
                    if parts:
                        item["solution"] = "\n\n".join(parts)
                    else:
                        complete = False
                dump()
            if complete:
                done.add(pr["paper"])
                dump()
    except V.AllKeysExhausted:
        print("Tous les cles Gemini ont atteint le quota du jour. Relancez la meme commande demain.")
    dump()
    print("papers:", len(db["items"]), "| with solution:", sum(1 for i in db["items"] if i.get("solution")))

if __name__ == "__main__":
    main()
