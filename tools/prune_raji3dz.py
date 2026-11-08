#!/usr/bin/env python3
"""Remove already-imported Raji3DZ files (and index entries) that are NOT in the selected CSV.
Dry run by default. Usage: python tools/prune_raji3dz.py [--csv templates/raji3dz-approved-files.csv] [--apply]"""
import argparse, csv, json, sys
from pathlib import Path
from urllib.parse import urlparse, unquote
ap = argparse.ArgumentParser()
ap.add_argument('--csv', default='templates/raji3dz-approved-files.csv')
ap.add_argument('--index', default='web/data/raji3dz-repository-index.json')
ap.add_argument('--root', default='.'); ap.add_argument('--apply', action='store_true')
a = ap.parse_args(); root = Path(a.root)
keep = {r['url'] for r in csv.DictReader(open(root / a.csv, encoding='utf-8-sig'))}
ip = root / a.index; idx = json.loads(ip.read_text(encoding='utf-8'))
kept, drop, freed = [], [], 0
for x in idx['items']:
    (kept if x.get('source_url') in keep else drop).append(x)
for x in drop:
    marker = '/repository/'; path = unquote(urlparse(x['file']).path); i = path.find(marker)
    f = root / 'web' / path[i + 1:] if i >= 0 else None
    if f and f.exists():
        freed += f.stat().st_size
        if a.apply: f.unlink()
print(f"index items {len(idx['items'])} | keep {len(kept)} | remove {len(drop)} | disk freed ~{freed // 1_000_000} MB | {'APPLIED' if a.apply else 'dry run'}")
if a.apply:
    idx['items'] = kept; ip.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding='utf-8')
