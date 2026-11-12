import os, sys, json, time, base64, glob, argparse, subprocess
import urllib.request, urllib.error, urllib.parse

ap = argparse.ArgumentParser()
ap.add_argument("--grade", required=True)
ap.add_argument("--book", required=True)
ap.add_argument("--first", type=int, default=30)
ap.add_argument("--pages", type=int, default=5)
ap.add_argument("--model", default="gemini-3.5-flash")
ap.add_argument("--dpi", type=int, default=150)
a = ap.parse_args()
KEY = os.environ["GEMINI_API_KEY"]

PROMPT = ("Transcribe this page of an Algerian school textbook exactly, in reading order "
          "(Arabic is right-to-left). Write every math/physics/chemistry formula in LaTeX "
          "between $...$. For each figure or photo write one short line: [شكل: description]. "
          "Keep table rows as lines separated by ' | '. Output only the transcription, "
          "no comments. If the page has no meaningful text output EMPTY.")

def ask(b64):
    url = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % a.model
    body = {"contents": [{"parts": [{"text": PROMPT},
            {"inline_data": {"mime_type": "image/jpeg", "data": b64}}]}],
            "generationConfig": {"temperature": 0}}
    hdr = {"Content-Type": "application/json", "x-goog-api-key": KEY}
    for t in range(5):
        req = urllib.request.Request(url, json.dumps(body).encode(), hdr)
        try:
            r = json.load(urllib.request.urlopen(req, timeout=120))
            parts = r["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts)
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "ignore")[:300]
            if e.code == 429 and t < 4:
                print("  429 - waiting 40s"); time.sleep(40); continue
            print("  HTTP", e.code, msg); return None
        except Exception as e:
            print("  error:", e); time.sleep(5)
    return None

cats = glob.glob(os.path.expanduser("~/sm-edu/**/catalogue.json"), recursive=True)
cat = json.load(open(cats[0], encoding="utf-8"))
books = [b for b in cat.get(a.grade.upper(), []) if a.book in b["title"] or a.book == b["id"]]
b = books[0]
print("Book:", b["title"])

wd = os.path.expanduser("~/vision-work"); os.makedirs(wd, exist_ok=True)
pdf = os.path.join(wd, b["id"] + ".pdf")
if not os.path.exists(pdf) or os.path.getsize(pdf) < 1000:
    url = urllib.parse.quote(b["pdf"], safe=":/%?=&")
    for _ in range(8):
        subprocess.run(["curl", "-4", "-L", "-sS", "-C", "-", "--connect-timeout", "30", "-o", pdf, url])
        if subprocess.run(["pdfinfo", pdf], capture_output=True).returncode == 0:
            break
        time.sleep(5)
print("PDF size:", os.path.getsize(pdf))

out = []
for p in range(a.first, a.first + a.pages):
    base = os.path.join(wd, "p%d" % p)
    subprocess.run(["pdftoppm", "-f", str(p), "-l", str(p), "-r", str(a.dpi),
                    "-jpeg", "-singlefile", pdf, base], check=True)
    txt = ask(base64.b64encode(open(base + ".jpg", "rb").read()).decode())
    print("page %d: %s chars" % (p, len(txt) if txt else "FAILED"))
    out.append("--- page %d\n%s\n" % (p, txt or ""))
    time.sleep(5)
open(os.path.expanduser("~/vision_sample.txt"), "w", encoding="utf-8").write("\n".join(out))
print("saved ~/vision_sample.txt")
