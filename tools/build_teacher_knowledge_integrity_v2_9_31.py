#!/usr/bin/env python3
"""Build a reproducible cross-dataset integrity index for Smart Teacher knowledge."""
import json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'web/data'

def load(name):
    p=DATA/name
    return json.loads(p.read_text(encoding='utf-8')), p
knowledge,kp=load('teacher-knowledge-2026-2027.json')
encyclopedia,ep=load('teacher-encyclopedia-2026-2027.json')
deep,dp=load('teacher-deep-content-2026-2027.json')
krows=knowledge.get('records',[]); erows=encyclopedia.get('records',[]); drows=deep.get('records',[])
encyclopedia_ids={str(r.get('id')) for r in erows if r.get('id')}
exercise_to_lesson={str(ex):str(r.get('id')) for r in erows for ex in r.get('exercise_ids',[]) if ex}
lesson_key=lambda r:(str(r.get('grade','')).strip(),str(r.get('subject','')).strip(),int(r.get('term') or 0),str(r.get('lesson','')).strip())
encyclopedia_by_key={lesson_key(r):r for r in erows}
rows=[]; all_source_ids=set(); linked=0; missing=[]; duplicate_ids=[]; seen_ids=set()
for r in drows:
    ev=r.get('evidence') or {}; src=[str(x) for x in ev.get('source_exercise_ids',[]) if x]
    matched=[x for x in src if x in exercise_to_lesson]
    all_source_ids.update(src); linked+=len(matched)
    absent=[x for x in src if x not in exercise_to_lesson]
    if absent: missing.extend(absent)
    rows.append({'deep_lesson_id':str(r.get('lesson_id') or ''),'encyclopedia_id':str((encyclopedia_by_key.get(lesson_key(r)) or {}).get('id') or ''),'grade':r.get('grade',''),'subject':r.get('subject',''),'term':r.get('term',0),'lesson':r.get('lesson',''),'source_exercise_ids':src,'matched_source_count':len(matched),'unmatched_source_ids':absent,'official_curriculum_verified':bool(ev.get('official_curriculum_verified') is True),'evidence_status':ev.get('status','unspecified')})
for r in krows:
    for ex in r.get('examples',[]):
        eid=str(ex.get('id') or '')
        if eid:
            if eid in seen_ids: duplicate_ids.append(eid)
            seen_ids.add(eid)
# Content-level warnings are deliberately structural; they do not judge correctness.
summary={
 'knowledge_records':len(krows),'encyclopedia_lessons':len(erows),'deep_content_lessons':len(drows),
 'unique_encyclopedia_ids':len(encyclopedia_ids),'unique_knowledge_example_ids':len(seen_ids),
 'deep_lessons_linked_to_encyclopedia':sum(bool(x['encyclopedia_id']) for x in rows),
 'deep_source_references':len(all_source_ids),'matched_source_references':linked,
 'unmatched_source_references':len(missing),'duplicate_knowledge_example_ids':len(duplicate_ids),
 'officially_verified_deep_lessons':sum(x['official_curriculum_verified'] for x in rows),
 'source_hashes':{'knowledge':hashlib.sha256(kp.read_bytes()).hexdigest(),'encyclopedia':hashlib.sha256(ep.read_bytes()).hexdigest(),'deep_content':hashlib.sha256(dp.read_bytes()).hexdigest()},
 'policy':'Structural traceability audit only. It does not validate pedagogical correctness or official curriculum alignment.'}
result={'schema_version':'1.0','release':'2.9.31','academic_year':'2026-2027','summary':summary,'deep_content_links':rows,'unmatched_source_ids':sorted(set(missing)),'duplicate_knowledge_example_ids':sorted(set(duplicate_ids))}
out=DATA/'teacher-knowledge-integrity-2026-2027.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
