import urllib.request, urllib.robotparser, urllib.parse, http.cookiejar, re, os, sys, json, time
H = "https://tafawoq.site"
UA = "SM-education-bot/1.0 (+https://github.com/smhk86/sm-edu)"
DELAY, MAXN = 3.0, 7
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def get(u):
    time.sleep(DELAY)
    return OP.open(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60).read()
rp = urllib.robotparser.RobotFileParser()
while True:
    try:
        rp.parse(get(H + "/robots.txt").decode("utf-8", "ignore").splitlines()); break
    except Exception as e:
        print("no network / robots failed:", e, "- retry 30 s", flush=True); time.sleep(30)
ok = lambda u: rp.can_fetch(UA, u)
SUBJ = {"bem": ["math","arabic","french","english","islamic","civic","history-geo","science","physics"],
        "bac": ["arabic","math","physics","science","french","english","islamic","history-geo","philosophy"]}
only = sys.argv[1:]  # e.g. bem civic  (test on one subject)
out_p = "tafawoq_index.json"
db = json.load(open(out_p, encoding="utf-8")) if os.path.exists(out_p) else {"schema": "sm-tafawoq-v1", "items": []}
u = {}
for i in db["items"]:
    k = (i["track"].lower(), i["subject"], i["n"])
    if k not in u or (i.get("solution") and not u[k].get("solution")): u[k] = i
db["items"] = list(u.values())
have = {k for k, i in u.items() if i.get("solution")}
def save(u, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0: return True
    if not ok(u): print("robots blocks:", u); return False
    try: data = get(u)
    except Exception as e: print("  fail:", u, e); return False
    if not data.startswith(b"%PDF"): print("  not a pdf:", u); return False
    os.makedirs(os.path.dirname(dest), exist_ok=True); open(dest, "wb").write(data); print("saved", dest, flush=True); return True
for track, subs in SUBJ.items():
    for s in subs:
        if only and (track, s) != tuple(only): continue
        pu = "%s/ar/%s/%s" % (H, track, s)
        if not ok(pu): print("robots blocks:", pu); continue
        try: html = get(pu).decode("utf-8", "ignore")
        except Exception as e: print("fail:", pu, e); continue
        ns = sorted({int(x) for x in re.findall(r"/mock-sujet-(\d+)", html)})[:MAXN]
        print(track, s, "->", ns, flush=True)
        for n in ns:
            if (track, s, n) in have: continue
            b = "%s/files/%s/%s/mock/sujet-%d" % (H, track, s, n)
            d = "exams_in/tafawoq/%s/%s/sujet-%d" % (track, s, n)
            p = save(b + ".pdf", d + ".pdf")
            q = save(b + "-sol.pdf", d + ".sol.pdf") if p else False
            if p:
                db["items"] = [x for x in db["items"] if (x["track"].lower(), x["subject"], x["n"]) != (track, s, n)]
                db["items"].append({"track": track.upper(), "subject": s, "n": n, "kind": "mock",
                    "paper": d + ".pdf", "solution": d + ".sol.pdf" if q else None,
                    "page": "%s/ar/%s/%s/mock-sujet-%d" % (H, track, s, n),
                    "source": "tafawoq.site (بإذن)", "rights_cleared": False})
                json.dump(db, open(out_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("total:", len(db["items"]))
