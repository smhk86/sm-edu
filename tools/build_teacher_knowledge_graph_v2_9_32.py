#!/usr/bin/env python3
"""Build a cautious, reproducible concept graph from existing teacher datasets."""
import json,re,hashlib,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'web/data'

def load(n):
 p=DATA/n; return json.loads(p.read_text(encoding='utf-8')),p

def norm(s):
 s=str(s or '').lower().replace('ـ','')
 s=re.sub(r'[\u064b-\u065f\u0670]','',s).translate(str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ى':'ي'}))
 return re.sub(r'[^\w\u0600-\u06ff]+',' ',s).strip()
STOP=set('من في على الي اليها عن مع هذا هذه ذلك التي الذي هو هي ان انما او و ثم كما يتم تكون كان بين عند بعد قبل الى كل بعض جدا حيث ما لا لم لن قد'.split())
def tokens(s): return sorted({x for x in norm(s).split() if len(x)>2 and x not in STOP and not x.isdigit()})
enc,ep=load('teacher-encyclopedia-2026-2027.json'); deep,dp=load('teacher-deep-content-2026-2027.json')
deep_by={str(x.get('lesson_id')):x for x in deep.get('records',[])}
records=enc.get('records',[]); nodes=[]; postings=collections.defaultdict(list); groups=collections.defaultdict(list); title_groups=collections.defaultdict(list)
for r in records:
 rid=str(r.get('id') or '')
 title=' '.join([str(r.get('lesson') or ''),str(r.get('topic') or '')])
 ts=tokens(title)
 d=deep_by.get(rid,{})
 node={'id':rid,'grade':r.get('grade',''),'stage':r.get('stage',''),'subject':r.get('subject',''),'term':r.get('term',0),'topic':r.get('topic',''),'lesson':r.get('lesson',''),'concepts':ts,'evidence_status':r.get('evidence_status','unspecified'),'content_review_status':r.get('content_review_status','requires_human_editorial_review'),'official_sequence_verified':bool(r.get('official_sequence_verified') is True)}
 nodes.append(node)
 for t in ts: postings[t].append(rid)
 key=(norm(r.get('grade')),norm(r.get('subject')),int(r.get('term') or 0),norm(r.get('topic')))
 groups[key].append(rid)
 title_groups[(norm(r.get('grade')),norm(r.get('subject')),int(r.get('term') or 0),norm(r.get('lesson')))].append(rid)
byid={x['id']:x for x in nodes}; edges=[]; edge_seen=set()
def add(a,b,kind,basis,score=None):
 if a==b:return
 key=(min(a,b),max(a,b),kind)
 if key in edge_seen:return
 edge_seen.add(key); e={'source':a,'target':b,'type':kind,'basis':basis}
 if score is not None:e['similarity']=round(score,3)
 edges.append(e)
# Strong structural grouping: same grade/subject/term/topic.
for key,ids in groups.items():
 for i,a in enumerate(ids):
  for b in ids[i+1:]: add(a,b,'same_topic','same_grade_subject_term_topic')
# Lexical candidates within the same grade and subject; not asserted prerequisites.
by_scope=collections.defaultdict(list)
for n in nodes: by_scope[(norm(n['grade']),norm(n['subject']))].append(n)
for scope,items in by_scope.items():
 for i,a in enumerate(items):
  A=set(a['concepts'])
  if not A: continue
  for b in items[i+1:]:
   if a['term']!=b['term'] and abs(int(a['term'] or 0)-int(b['term'] or 0))>1: continue
   B=set(b['concepts']); inter=A&B
   if len(inter)>=2:
    sim=len(inter)/max(1,len(A|B))
    if sim>=0.28: add(a['id'],b['id'],'shared_concept','arabic_title_topic_token_overlap',sim)
# Exact-title duplicates are review candidates only when content differs.
review=[]
for key,ids in title_groups.items():
 if len(ids)<2: continue
 for a in ids:
  for b in ids:
   if a>=b: continue
   ra=next(x for x in records if str(x.get('id'))==a); rb=next(x for x in records if str(x.get('id'))==b)
   ka=' '.join(map(norm,ra.get('key_ideas',[]))); kb=' '.join(map(norm,rb.get('key_ideas',[])))
   if ka and kb and ka!=kb: review.append({'type':'possible_content_divergence','records':[a,b],'reason':'same_normalized_title_different_key_ideas','requires_human_review':True})
summary={'lessons':len(nodes),'concept_terms':len(postings),'relations':len(edges),'same_topic_relations':sum(e['type']=='same_topic' for e in edges),'shared_concept_candidates':sum(e['type']=='shared_concept' for e in edges),'possible_divergences_for_review':len(review),'official_prerequisite_relations':0,'official_sequence_relations':0,'coverage_groups':len(by_scope),'policy':'Relations are structural or lexical suggestions, not official prerequisites, curriculum sequence, or proof of pedagogical correctness.'}
coverage=[]
for (grade,subject),items in sorted(by_scope.items()): coverage.append({'grade':items[0]['grade'],'subject':items[0]['subject'],'lesson_count':len(items),'terms':sorted({int(x['term'] or 0) for x in items})})
result={'schema_version':'1.0','release':'2.9.32','academic_year':'2026-2027','summary':summary,'nodes':nodes,'edges':edges,'concept_index':dict(postings),'coverage':coverage,'review_candidates':review,'source_hashes':{'encyclopedia':hashlib.sha256(ep.read_bytes()).hexdigest(),'deep_content':hashlib.sha256(dp.read_bytes()).hexdigest()}}
out=DATA/'teacher-knowledge-graph-2026-2027.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
