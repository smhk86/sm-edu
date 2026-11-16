#!/usr/bin/env python3
"""Select a balanced subset of the approved Raji3DZ list: per (grade, subject, term) up to N files,
preferring papers that have a solution, a mix of فرض/اختبار, distinct years, recent first.
Usage: python tools/select_raji3dz.py [--per-cell 5] [--max-total 1300] [--src templates/raji3dz-approved-files-full.csv] [--out templates/raji3dz-approved-files.csv]"""
import argparse, csv, re, collections, sys
SUBJ = {'arabe': 'اللغة العربية', 'mathematiques': 'الرياضيات', 'islamia': 'التربية الإسلامية',
        'tarbia-madania': 'التربية المدنية', 'technologie': 'التكنولوجيا'}
TERM_PATS = [(r'الفصل\s*(الأول|1)\b|الأول', '1'), (r'الفصل\s*(الثاني|2)\b|الثاني', '2'), (r'الفصل\s*(الثالث|3)\b|الثالث', '3')]
def term_of(r):
    if r.get('term') in ('1', '2', '3'): return r['term']
    s = ' '.join([r.get('kind', ''), r.get('branch', ''), r.get('title', '')])
    m = re.search(r'الفصل\s*(\d)', s)
    if m and m.group(1) in '123': return m.group(1)
    for pat, t in TERM_PATS:
        if re.search(pat, s): return t
    return ''
def kind_of(r):
    s = r.get('kind', '') + ' ' + r.get('title', '')
    if 'فرض' in s: return 'فرض'
    if 'اختبار' in s or 'إختبار' in s or 'امتحان' in s: return 'اختبار'
    if 'واجب' in s: return 'واجب'
    return 'موضوع'
def yr(r):
    m = re.search(r'(19|20)\d\d', r.get('year') or '')
    return int(m.group(0)) if m else 0
def score(r):
    return (r['solution'] == 'true', yr(r))
def pick(rows, n):
    """Greedy: solution first, alternate kinds, spread years/branches."""
    rows = sorted(rows, key=score, reverse=True)
    out, seen_year, seen_kind, seen_branch = [], collections.Counter(), collections.Counter(), collections.Counter()
    while rows and len(out) < n:
        best = min(rows, key=lambda r: (seen_kind[r['_kind']] + seen_year[r['year']] + seen_branch[r['branch']],
                                         r['solution'] != 'true', -yr(r)))
        rows.remove(best); out.append(best)
        seen_kind[best['_kind']] += 1; seen_year[best['year']] += 1; seen_branch[best['branch']] += 1
    return out
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='templates/raji3dz-approved-files-full.csv'); ap.add_argument('--out', default='templates/raji3dz-approved-files.csv')
    ap.add_argument('--per-cell', type=int, default=5); ap.add_argument('--max-total', type=int, default=1300)
    a = ap.parse_args()
    rows = list(csv.DictReader(open(a.src, encoding='utf-8-sig')))
    cells = collections.defaultdict(list); skipped = 0
    for r in rows:
        r['subject'] = SUBJ.get(r['subject'], r['subject']); r['term'] = term_of(r); r['_kind'] = kind_of(r)
        if not r['term']: skipped += 1; continue
        cells[(r['grade'], r['subject'], r['term'])].append(r)
    n = a.per_cell
    while n > 1 and sum(min(n, len(v)) for v in cells.values()) > a.max_total: n -= 1
    chosen = []
    for k in sorted(cells): chosen += pick(cells[k], n)
    fields = list(rows[0].keys() if rows else [])
    fields = [f for f in fields if not f.startswith('_')]
    with open(a.out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore'); w.writeheader(); w.writerows(chosen)
    g = collections.Counter(r['grade'] for r in chosen)
    print(f'source {len(rows)} | without term (skipped) {skipped} | cells {len(cells)} | per-cell {n} | selected {len(chosen)}')
    print('with solution:', sum(r['solution'] == 'true' for r in chosen)); print('by grade:', dict(g))
if __name__ == '__main__': main()
