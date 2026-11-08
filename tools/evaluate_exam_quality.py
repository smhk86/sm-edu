#!/usr/bin/env python3
"""Deterministic structural quality gate for generated exam papers."""
import json,sys
from pathlib import Path

def evaluate(paper):
 p=paper.get('paper',paper); student=p.get('student_version',{}); teacher=p.get('teacher_version',{}); qs=student.get('questions',[]); key=teacher.get('answer_key',[]); scheme=teacher.get('marking_scheme',[])
 errors=[]; warnings=[]
 if not qs: errors.append('empty_student_questions')
 ids=[str(q.get('id') or q.get('question_id') or q.get('number')) for q in qs]
 if len(ids)!=len(set(ids)): errors.append('duplicate_question_ids')
 total=float(p.get('total_points',20) or 20)
 if abs(sum(float(q.get('points',0) or 0) for q in qs)-total)>0.05: errors.append('question_points_do_not_sum_to_total')
 if not key: errors.append('missing_answer_key')
 if len(key)!=len(qs): warnings.append('answer_key_question_count_mismatch')
 if not scheme: errors.append('missing_marking_scheme')
 criteria=sum(float(c.get('points',0) or 0) for row in scheme for c in row.get('criteria',[]))
 scheme_total=sum(float(row.get('points',0) or 0) for row in scheme)
 if scheme and abs(scheme_total-total)>0.1: errors.append('marking_scheme_total_mismatch')
 if scheme and criteria and abs(criteria-scheme_total)>0.1: warnings.append('criteria_points_do_not_match_scheme')
 if not p.get('grade') or not p.get('subject') or int(p.get('term',0) or 0) not in (1,2,3): errors.append('missing_or_invalid_curriculum_scope')
 if int(p.get('duration_minutes',0) or 0)<=0: errors.append('invalid_duration')
 if p.get('official_exam') is True: warnings.append('must_not_label_generated_paper_as_official')
 return {'passed':not errors,'errors':errors,'warnings':warnings,'question_count':len(qs),'total_points':total,'marking_scheme_points':scheme_total}

if __name__=='__main__':
 data=json.loads(Path(sys.argv[1]).read_text(encoding='utf8')); result=evaluate(data); print(json.dumps(result,ensure_ascii=False,indent=2)); sys.exit(0 if result['passed'] else 1)
