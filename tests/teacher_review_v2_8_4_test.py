import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('review',Path('tools/validate_teacher_reviews.py')); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
base={'review_id':'R1','paper_id':'P1','reviewer_id':'T-001','reviewer_role':'teacher','reviewed_at':'2026-11-08','evidence_reference':'source URL or permitted document reference','decision':'accepted','comments':'Reviewed against taught progression.','scores':{'curriculum':28,'answer_key':24,'marking':19,'difficulty':9,'diversity':9,'clarity':5}}
r=mod.validate({'reviews':[base]}); assert r['passed'] and r['accepted_count']==1,r
bad={**base,'scores':{**base['scores'],'curriculum':31}}
r=mod.validate({'reviews':[bad]}); assert not r['passed'] and any('score_out_of_range' in e for e in r['errors']),r
missing={**base,'reviewer_id':''}; assert not mod.validate({'reviews':[missing]})['passed']
print('v2.8.4 teacher review validation tests passed')
