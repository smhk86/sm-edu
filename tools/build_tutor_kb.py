#!/usr/bin/env python3
"""يبني web/data/tutor-kb.json من ملفات PDF المتوفرة فعلاً في web/repository (Raji3DZ / DZExams).
يعمل داخل Termux أو GitHub Actions. يعتمد على pdftotext (poppler) إن وُجد وإلا pypdf.
الاستعمال:  python3 tools/build_tutor_kb.py [--root .] [--max-per-file 6] [--limit 0]
لا يدخل إلا الملفات المعلَّمة rights_cleared=true في الفهرس، ولا يُنسخ إلا مقاطع قصيرة للاستئناس والبحث."""
import argparse, json, os, re, shutil, subprocess, sys, unicodedata, urllib.parse, datetime

AR = re.compile(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]')
LETTER = re.compile(r'[^\W\d_]', re.U)

def extract(path):
    if shutil.which('pdftotext'):
        try:
            r = subprocess.run(['pdftotext', '-enc', 'UTF-8', path, '-'], capture_output=True, timeout=60)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.decode('utf-8', 'replace')
        except Exception:
            pass
    try:
        from pypdf import PdfReader
        return '\n'.join((p.extract_text() or '') for p in PdfReader(path).pages)
    except Exception:
        return ''

def clean(t):
    t = unicodedata.normalize('NFKC', t)
    t = re.sub(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069\u0640\x00-\x08\x0b\x0c\x0e-\x1f]', '', t)
    lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in t.splitlines()]
    return [l for l in lines if len(LETTER.findall(l)) >= 3]

def chunks(lines, size=800):
    out, cur = [], ''
    for l in lines:
        if len(cur) + len(l) + 1 > size and cur:
            out.append(cur); cur = ''
        cur = (cur + ' ' + l).strip()
    if cur: out.append(cur)
    return out

def good(c):
    s = re.sub(r'\s', '', c)
    return len(s) >= 60 and len(LETTER.findall(s)) / max(1, len(s)) >= 0.6

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='.')
    ap.add_argument('--max-per-file', type=int, default=6)
    ap.add_argument('--limit', type=int, default=0, help='أقصى عدد ملفات (0 = كلها)')
    ap.add_argument('--out', default='web/data/tutor-kb.json')
    a = ap.parse_args()
    web = os.path.join(a.root, 'web')
    items = []
    for name in ('raji3dz-repository-index.json', 'dzexams-repository-index.json'):
        p = os.path.join(web, 'data', name)
        if os.path.exists(p):
            items += json.load(open(p, encoding='utf-8')).get('items', [])
    res, files, skipped = [], 0, 0
    for it in items:
        if it.get('rights_cleared') is not True or (it.get('ext') or 'pdf') != 'pdf':
            continue
        m = re.search(r'/repository/(.+)$', it.get('file', ''))
        if not m:
            continue
        path = os.path.join(web, 'repository', urllib.parse.unquote(m.group(1)))
        if not os.path.exists(path):
            skipped += 1; continue
        cs = [c for c in chunks(clean(extract(path))) if good(c)][:a.max_per_file]
        if not cs:
            skipped += 1; continue
        files += 1
        for i, c in enumerate(cs):
            res.append({'grade': it.get('grade', ''), 'subject': it.get('subject', ''), 'term': it.get('term') or 0,
                        'year': it.get('year'), 'solution': bool(it.get('solution')), 'title': it.get('title', ''),
                        'text': c, 'source': it.get('source', 'repository'), 'ref': it.get('file', ''), 'part': i + 1})
        if a.limit and files >= a.limit:
            break
    out = os.path.join(a.root, a.out)
    json.dump({'schema': 'sm-tutor-kb-v1', 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'files': files, 'skipped_files': skipped, 'chunks': res},
              open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'ملفات: {files} · مقاطع: {len(res)} · متخطاة (غير موجودة/بلا نص): {skipped} · الحجم: {os.path.getsize(out)//1024} KB')

if __name__ == '__main__':
    sys.exit(main())
