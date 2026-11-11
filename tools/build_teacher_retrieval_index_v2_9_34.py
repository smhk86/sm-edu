#!/usr/bin/env python3
"""Build a deterministic, evidence-aware retrieval index for Smart Teacher."""
import hashlib, json, re
from collections import defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'web'/'data'
FILES=['teacher-encyclopedia-2026-2027.json','teacher-deep-content-2026-2027.json','teacher-knowledge-2026-2027.json','exercise-bank-2026-2027.json']
STOP=set('من في على عن مع هذا هذه ذلك التي الذي هو هي ان او و ثم كما يتم تكون كان بين عند بعد قبل الى كل بعض حيث ما لا لم لن قد'.split())
def norm(s):
 s=str(s or '').lower().replace('ـ',''); s=re.sub(r'[\u064b-\u065f\u0670]','',s)
 s=s.translate(str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ى':'ي'}))
 return re.sub(r'[^\w\u0600-\u06ff]+',' ',s).strip()
def tokens(s): return sorted({w for w in norm(s).split() if len(w)>2 and w not in STOP and not w.isdigit()})
def read(n): return json.loads((DATA/n).read_text(encoding='utf-8'))
enc=read(FILES[0])['records']; deep=read(FILES[1])['records']; knowledge=read(FILES[2])['records']; exercises=read(FILES[3])['records']
deep_by={str(x.get('lesson_id')):x for x in deep}; ex_by={str(x.get('id')):x for x in exercises}
# Only exact lesson metadata matches are used for knowledge cross-links.
k_by=defaultdict(list)
enc_by_scope_lesson=defaultdict(list)
for e in enc:
 key=(norm(e.get('grade')),norm(e.get('subject')),int(e.get('term') or 0),norm(e.get('lesson')))
 enc_by_scope_lesson[key].append(str(e.get('id')))
for k in knowledge:
 base=(norm(k.get('grade')),norm(k.get('subject')),int(k.get('term') or 0))
 lessons={norm(x) for x in (k.get('lessons') or k.get('platform_lessons') or []) if norm(x)}
 for lesson in lessons:
  for lesson_id in enc_by_scope_lesson.get((*base,lesson),[]):
   k_by[lesson_id].append(str(k.get('id')))
docs=[]; postings=defaultdict(list)
for r in enc:
 rid=str(r.get('id') or ''); d=deep_by.get(rid,{})
 exids=sorted({str(x) for x in (r.get('exercise_ids') or []) if str(x) in ex_by})
 text_parts=[r.get('grade'),r.get('subject'),r.get('topic'),r.get('lesson')]
 text_parts += r.get('learning_targets') or []; text_parts += r.get('key_ideas') or []; text_parts += r.get('procedures') or []
 for x in r.get('worked_examples') or []: text_parts += [x.get('question'),x.get('answer'),x.get('explanation')]
 lc=d.get('lesson_explanation') or {}; text_parts += lc.get('core_explanation') or []; text_parts += lc.get('teaching_sequence') or []
 rule=d.get('rules_and_laws') or {}; text_parts += [rule.get('rule'),rule.get('new_example'),rule.get('check')]
 for exid in exids:
  ex=ex_by[exid]; text_parts += [ex.get('question'),ex.get('solution'),ex.get('explanation')]
  text_parts += ex.get('choices') or []; text_parts += ex.get('solution_steps') or []
 ts=tokens(' '.join(str(x or '') for x in text_parts))
 doc={'id':rid,'grade':r.get('grade',''),'stage':r.get('stage',''),'subject':r.get('subject',''),'term':r.get('term',0),'topic':r.get('topic',''),'lesson':r.get('lesson',''),'tokens':ts,'exercise_ids':exids,'deep_content_available':bool(d),'knowledge_record_ids':sorted(set(k_by.get(rid,[]))),'evidence_status':r.get('evidence_status','unspecified'),'official_sequence_verified':r.get('official_sequence_verified') is True}
 docs.append(doc)
 for t in ts: postings[t].append(rid)
summary={'lesson_documents':len(docs),'indexed_terms':len(postings),'lesson_exercise_links':sum(len(x['exercise_ids']) for x in docs),'lessons_with_deep_content':sum(x['deep_content_available'] for x in docs),'lessons_with_exact_knowledge_links':sum(bool(x['knowledge_record_ids']) for x in docs),'knowledge_crosswalk_policy':'Exact grade, subject, term and lesson-name match only; no fuzzy crosswalk.'}
out={'schema_version':'1.0','release':'2.9.34','academic_year':'2026-2027','title':'Smart Teacher evidence-aware retrieval index','summary':summary,'documents':docs,'postings':dict(sorted(postings.items())),'source_hashes':{n:hashlib.sha256((DATA/n).read_bytes()).hexdigest() for n in FILES},'policy':{'search':'Arabic normalization and token overlap are retrieval aids, not proof of semantic equivalence.','official_status':'Platform-derived content is not ministry-verified unless a record explicitly carries verified evidence.','knowledge_links':'Only exact metadata and lesson-name matches are linked.'}}
(DATA/'teacher-retrieval-index-2026-2027.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
