import json, os, re, collections
GR = {"1ap":"الأولى ابتدائي","2ap":"الثانية ابتدائي","3ap":"الثالثة ابتدائي","4ap":"الرابعة ابتدائي","5ap":"الخامسة ابتدائي",
      "1am":"الأولى متوسط","2am":"الثانية متوسط","3am":"الثالثة متوسط","4am":"الرابعة متوسط",
      "1as":"الأولى ثانوي","2as":"الثانية ثانوي","3as":"الثالثة ثانوي"}
AR = {"arabic":"اللغة العربية","civic":"التربية المدنية","english":"اللغة الإنجليزية","french":"اللغة الفرنسية",
      "history-geo":"التاريخ والجغرافيا","informatics":"الإعلام الآلي","islamic":"التربية الإسلامية","math":"الرياضيات",
      "physics":"العلوم الفيزيائية","science":"علوم الطبيعة والحياة","geography":"الجغرافيا","history":"التاريخ",
      "scientific":"التربية العلمية والتكنولوجية","economics":"الاقتصاد","law":"القانون","philosophy":"الفلسفة"}
SCI = {"math","physics","science","scientific","informatics"}
def clean(s):
    out = []
    for l in (s or "").split("\n"):
        if l.strip() in ("تفوق", "تفوّق"): continue
        if out and len(out) < 4 and l.strip() == out[-1].strip(): continue
        out.append(l)
    return "\n".join(out).strip()
idx = json.load(open("tafawoq_levels_index.json", encoding="utf-8"))["items"]
ai = json.load(open("tafawoq_levels_ai.json", encoding="utf-8")) if os.path.exists("tafawoq_levels_ai.json") else {}
os.makedirs("web/data/tafawoq", exist_ok=True)
by = collections.defaultdict(list); skipped = collections.Counter(); unk = set()
for i in idx:
    lv = i["level"]
    if lv not in GR: continue
    k = "%s|%s|%s" % (lv, i["subject"], i["slug"])
    t, s = i["text"], i["solution"]
    if i["subject"] in SCI:
        if k not in ai: skipped[(lv, i["subject"])] += 1; continue
        t, s = ai[k]["text"], ai[k]["solution"]
    t, s = clean(t), clean(s)
    if len(t) < 60: skipped[(lv, "short")] += 1; continue
    if i["subject"] not in AR: unk.add(i["subject"])
    n = re.search(r"-(\d+)$", i["slug"])
    by[lv].append({"id": k, "subject": AR.get(i["subject"], i["subject"]), "kind": i["kind"], "term": i["term"],
                   "n": int(n.group(1)) if n else 0, "title": i["title"], "text": t, "solution": s})
for lv, items in by.items():
    json.dump({"schema": "sm-tafawoq-papers-v1", "level": lv, "grade": GR[lv], "items": items},
              open("web/data/tafawoq/%s.json" % lv, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print({lv: len(v) for lv, v in sorted(by.items())}, "| total", sum(len(v) for v in by.values()))
print("skipped:", sum(skipped.values()), dict(skipped), "| unknown subjects:", sorted(unk) or "none")
