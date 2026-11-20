import json, os, time, base64, re, argparse, urllib.request, urllib.error
ap = argparse.ArgumentParser()
ap.add_argument("--keys-file", default=os.path.expanduser("~/.sm_gemini_keys_taf"))
ap.add_argument("--limit", type=int, default=0)
a = ap.parse_args()
KEYS = [l.strip() for l in open(a.keys_file) if l.strip() and not l.startswith("#")]
MODELS = [m.strip() for m in open(os.path.expanduser("~/models_ok.txt")).read().strip().split(",") if m.strip()]
URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"
PROMPT = ("انسخ هذا الموضوع (امتحان جزائري) كما هو بلغته الأصلية وبترتيب القراءة. اكتب كل معادلة أو رمز رياضي أو فيزيائي "
          "بصيغة LaTeX بين $...$، والجداول أسطرًا تفصل خلاياها بـ ' | '. أعد النص فقط بلا تعليق ولا علامات كود.")
n = [0]
def ask(path):
    body = json.dumps({"contents": [{"parts": [{"text": PROMPT}, {"inline_data": {"mime_type": "application/pdf",
            "data": base64.b64encode(open(path, "rb").read()).decode()}}]}], "generationConfig": {"temperature": 0}}).encode()
    for t in range(len(KEYS) * len(MODELS) * 3):
        k, j = n[0] % len(KEYS), (n[0] // len(KEYS)) % len(MODELS)
        req = urllib.request.Request(URL % MODELS[j], body, {"Content-Type": "application/json", "x-goog-api-key": KEYS[k]})
        try:
            r = json.load(urllib.request.urlopen(req, timeout=180))
            c = (r.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            txt = re.sub(r"^```\w*\n|\n```$", "", "".join(x.get("text", "") for x in c).strip()).strip()
            if txt: return txt
            n[0] += 1
        except urllib.error.HTTPError as e:
            print("  HTTP", e.code, "key %d %s" % (k + 1, MODELS[j]), flush=True)
            n[0] += 1; time.sleep(60 if t and t % (len(KEYS) * len(MODELS)) == 0 else 2)
        except Exception as e:
            print("  error:", str(e)[:70], flush=True); n[0] += 1; time.sleep(5)
    return ""
SCI = {"math", "physics", "science", "scientific", "informatics"}
OUT = "tafawoq_levels_ai.json"
res = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
idx = json.load(open("tafawoq_levels_index.json", encoding="utf-8"))["items"]
key = lambda i: "%s|%s|%s" % (i["level"], i["subject"], i["slug"])
todo = [i for i in idx if i["subject"] in SCI and i.get("paper") and key(i) not in res]
if a.limit: todo = todo[:a.limit]
for m, i in enumerate(todo, 1):
    print("[%d/%d] %s" % (m, len(todo), key(i)), flush=True)
    t = ask(i["paper"])
    s = ask(i["solution_file"]) if i.get("solution_file") else ""
    if not t or (i.get("solution_file") and not s):
        print("  skipped (will retry next run)", flush=True); continue
    res[key(i)] = {"text": t, "solution": s}
    json.dump(res, open(OUT + ".tmp", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(OUT + ".tmp", OUT)
print("done:", len(res))
