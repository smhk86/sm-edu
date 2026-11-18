import json, os, sys, time, base64, hashlib, re, argparse, urllib.request, urllib.error
ap = argparse.ArgumentParser()
ap.add_argument("--keys-file", default=os.path.expanduser("~/.sm_gemini_keys"))
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
            txt = "".join(x.get("text", "") for x in c).strip()
            txt = re.sub(r"^```\w*\n|\n```$", "", txt).strip()
            if txt: return txt
            n[0] += 1
        except urllib.error.HTTPError as e:
            print("  HTTP", e.code, "key %d %s" % (k + 1, MODELS[j]), flush=True)
            n[0] += 1
            if t and t % (len(KEYS) * len(MODELS)) == 0: time.sleep(60)
            else: time.sleep(2)
        except Exception as e:
            print("  error:", str(e)[:70], flush=True); n[0] += 1; time.sleep(5)
    return ""
idx = {i["page"]: i for i in json.load(open("tafawoq_index.json", encoding="utf-8"))["items"]}
db = json.load(open("tafawoq_papers.json", encoding="utf-8"))
todo = [x for x in db["items"] if x.get("page") in idx and idx[x["page"]]["subject"] in ("math", "physics", "science") and not x.get("ai_read")]
if a.limit: todo = todo[:a.limit]
for m, x in enumerate(todo, 1):
    i = idx[x["page"]]
    print("[%d/%d] %s %s %d" % (m, len(todo), i["track"], i["subject"], i["n"]), flush=True)
    t = ask(i["paper"])
    s = ask(i["solution"]) if i.get("solution") else ""
    if not t or (i.get("solution") and not s):
        print("  skipped (will retry next run)", flush=True); continue
    x["text"], x["solution"] = t, s
    x["sha256"] = hashlib.sha256(t.encode("utf-8")).hexdigest()
    x["ai_read"] = True
    json.dump(db, open("tafawoq_papers.json.tmp", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace("tafawoq_papers.json.tmp", "tafawoq_papers.json")
print("done:", sum(1 for x in db["items"] if x.get("ai_read")))
