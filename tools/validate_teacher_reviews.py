#!/usr/bin/env python3
"""Validate teacher review records for the SM EDUCATION exam benchmark."""
import json, sys
from pathlib import Path

FIELDS = ('curriculum', 'answer_key', 'marking', 'difficulty', 'diversity', 'clarity')
WEIGHTS = {'curriculum':30, 'answer_key':25, 'marking':20, 'difficulty':10, 'diversity':10, 'clarity':5}

def validate(data):
    rows = data.get('reviews', data if isinstance(data, list) else [])
    errors, warnings, accepted = [], [], 0
    seen = set()
    for i, r in enumerate(rows):
        prefix = f'review_{i+1}'
        rid = str(r.get('review_id','')).strip()
        if not rid: errors.append(prefix + ':missing_review_id')
        elif rid in seen: errors.append(prefix + ':duplicate_review_id')
        seen.add(rid)
        if not str(r.get('paper_id','')).strip(): errors.append(prefix + ':missing_paper_id')
        if not str(r.get('reviewer_id','')).strip(): errors.append(prefix + ':missing_reviewer_id')
        if not str(r.get('reviewer_role','')).strip(): errors.append(prefix + ':missing_reviewer_role')
        scores = r.get('scores', {})
        for f in FIELDS:
            if f not in scores: errors.append(prefix + ':missing_score_' + f)
            else:
                try: score = float(scores[f])
                except (TypeError, ValueError): errors.append(prefix + ':invalid_score_' + f); continue
                if not 0 <= score <= WEIGHTS[f]: errors.append(prefix + ':score_out_of_range_' + f)
        if not str(r.get('evidence_reference','')).strip(): warnings.append(prefix + ':missing_evidence_reference')
        if not str(r.get('reviewed_at','')).strip(): warnings.append(prefix + ':missing_review_date')
        if r.get('decision') not in ('accepted','revision_required','rejected','pending'):
            errors.append(prefix + ':invalid_decision')
        if not str(r.get('comments','')).strip(): warnings.append(prefix + ':no_reviewer_comments')
        if not any(e.startswith(prefix+':') for e in errors) and r.get('decision') == 'accepted': accepted += 1
    return {'passed': not errors, 'review_count': len(rows), 'accepted_count': accepted, 'errors': errors, 'warnings': warnings}

if __name__ == '__main__':
    p = Path(sys.argv[1]); result = validate(json.loads(p.read_text(encoding='utf-8')))
    print(json.dumps(result, ensure_ascii=False, indent=2)); sys.exit(0 if result['passed'] else 1)
