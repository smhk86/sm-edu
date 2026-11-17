"""Read BEM / BAC exam papers (PDF or images) with Gemini vision and add them to web/data/certificate-papers.json.

Folder layout (you download the files yourself):
  exams_in/BEM/<subject>/<file>.pdf      exams_in/BAC/<subject>/<file>.jpg
Run:   GEMINI_API_KEYS="k1 k2 k3" python tools/vision_exams.py --rights-cleared
--rights-cleared  = you confirm you have the site owners' permission; without it the papers are written
                    with rights_cleared=false and the app does NOT show them.
"""
import os, re, sys, json, time, base64, argparse, hashlib, mimetypes, urllib.request, urllib.error

PROMPT = ("Transcribe this Algerian school exam paper exactly, in reading order (Arabic is right-to-left). "
          "Write every math/physics/chemistry formula in LaTeX between $...$. For each figure write one short line "
          "[شكل: description]. Keep table rows as lines separated by ' | '. If the file also contains the "
          "solution/marking scheme, put it after a line that contains exactly ===SOLUTION=== . Output only the "
          "transcription, no comments.")
URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"
MIME = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def parse_path(rel):
    """exams_in-relative path -> (track, subject, year|None, title)"""
    parts = rel.replace("\\", "/").split("/")
    if len(parts) < 3 or parts[0].upper() not in ("BEM", "BAC"):
        return None
    stem = os.path.splitext(parts[-1])[0]
    m = re.search(r"(20[0-3]\d)", stem)
    return parts[0].upper(), parts[1], int(m.group(1)) if m else None, stem.replace("_", " ").replace("-", " ").strip()


def split_solution(text):
    a, sep, b = text.partition("===SOLUTION===")
    return a.strip(), b.strip()


def keys():
    """Keys come from GEMINI_API_KEYS (space/comma/newline separated), GEMINI_API_KEY, or the file ~/.sm_gemini_keys."""
    raw = os.environ.get("GEMINI_API_KEYS", "") + " " + os.environ.get("GEMINI_API_KEY", "")
    p = os.path.expanduser("~/.sm_gemini_keys")
    if os.path.exists(p):
        raw += " " + open(p, encoding="utf-8").read()
    out = []
    for k in re.split(r"[\s,;]+", raw):
        if k and k not in out:
            out.append(k)
    return out


class AllKeysExhausted(Exception):
    pass


class KeyPool:
    """Sticks to one key; when it runs out of quota it moves to the next one for good. Keys are never printed."""

    def __init__(self, ks):
        self.keys = list(ks)
        self.dead = set()
        self.i = 0

    def current(self):
        live = [k for k in range(len(self.keys)) if k not in self.dead]
        if not live:
            raise AllKeysExhausted()
        if self.i in self.dead:
            self.i = live[0]
        return self.keys[self.i]

    def burn(self, why):
        self.dead.add(self.i)
        left = len(self.keys) - len(self.dead)
        print("  key %d/%d out (%s); %d left" % (self.i + 1, len(self.keys), why, left))
        if left:
            self.i = [k for k in range(len(self.keys)) if k not in self.dead][0]
            print("  -> switched to key %d/%d" % (self.i + 1, len(self.keys)))


def ask(path, pool, model):
    data = base64.b64encode(open(path, "rb").read()).decode()
    body = json.dumps({"contents": [{"parts": [{"text": PROMPT}, {"inline_data": {
        "mime_type": MIME[os.path.splitext(path)[1].lower()], "data": data}}]}],
        "generationConfig": {"temperature": 0}}).encode()
    waits = 0
    while True:
        k = pool.current()
        req = urllib.request.Request(URL % model, body, {"Content-Type": "application/json", "x-goog-api-key": k})
        try:
            r = json.load(urllib.request.urlopen(req, timeout=180))
            c = (r.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in c).strip()
        except urllib.error.HTTPError as e:
            full = e.read().decode("utf-8", "ignore")
            if e.code == 429 and ("PerDay" in full or "per day" in full.lower()):
                pool.burn("daily quota")
                continue
            if e.code in (401, 403) or (e.code == 400 and ("API key" in full or "API_KEY" in full)):
                pool.burn("key rejected, HTTP %d" % e.code)
                continue
            if e.code in (429, 500, 503) and waits < 5:
                waits += 1
                time.sleep(10 * waits)
                continue
            print("  HTTP", e.code, full[:160])
            return ""
        except Exception as e:
            if waits < 3:
                waits += 1
                time.sleep(5)
                continue
            print("  error:", e)
            return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="exams_in")
    ap.add_argument("--out", default="web/data/certificate-papers.json")
    ap.add_argument("--model", default="gemini-3.5-flash")
    ap.add_argument("--source-name", default="", help="e.g. eddirasa.com")
    ap.add_argument("--rights-cleared", action="store_true")
    a = ap.parse_args()
    ks = keys()
    if not ks:
        sys.exit("no Gemini API key (set GEMINI_API_KEYS=\"k1 k2 k3\" or put them in ~/.sm_gemini_keys)")
    pool = KeyPool(ks)
    print("keys:", len(ks))
    db = {"schema": "sm-certificate-papers-v1", "items": []}
    if os.path.exists(a.out):
        db = json.load(open(a.out, encoding="utf-8"))
    have = {i["sha256"] for i in db["items"]}
    for root, _, files in os.walk(a.src):
        for f in sorted(files):
            p = os.path.join(root, f)
            if os.path.splitext(f)[1].lower() not in MIME:
                continue
            meta = parse_path(os.path.relpath(p, a.src))
            if not meta:
                print("skip (put it in BEM/ or BAC/ + subject folder):", p)
                continue
            sha = hashlib.sha256(open(p, "rb").read()).hexdigest()
            if sha in have:
                continue
            print("reading", p)
            try:
                text = ask(p, pool, a.model)
            except AllKeysExhausted:
                print("All keys are out of quota. Run again tomorrow: finished papers are kept and skipped.")
                break
            if not text:
                print("  no text, skipped")
                continue
            q, sol = split_solution(text)
            track, subject, year, title = meta
            db["items"].append({"track": track, "subject": subject, "year": year, "title": title, "kind": "مقترح",
                                "text": q, "solution": sol, "source": a.source_name, "sha256": sha,
                                "rights_cleared": bool(a.rights_cleared)})
            have.add(sha)
            json.dump(db, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("papers:", len(db["items"]))


if __name__ == "__main__":
    main()
