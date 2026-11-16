#!/usr/bin/env python3
"""Build evidence-aware quality signals for Smart Teacher content.

This is a deterministic structural/editorial screening tool, not a scientific
fact checker. Findings are review candidates and never certify correctness.
"""
from __future__ import annotations
import hashlib, json, re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'web' / 'data'
OUT = DATA / 'teacher-scientific-audit-2026-2027.json'

def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))

def norm(value):
    s = str(value or '').strip().lower()
    s = re.sub(r'[\u064b-\u065f\u0670ـ]', '', s)
    s = s.translate(str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ى':'ي'}))
    return re.sub(r'\s+', ' ', s)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    encyclopedia = load('teacher-encyclopedia-2026-2027.json')['records']
    deep = load('teacher-deep-content-2026-2027.json')['records']
    exercises = load('exercise-bank-2026-2027.json')['records']
    knowledge = load('teacher-knowledge-2026-2027.json')['records']
    graph = load('teacher-knowledge-graph-2026-2027.json')
    exercise_by_id = {str(x.get('id')): x for x in exercises}
    deep_by_id = {str(x.get('lesson_id')): x for x in deep}
    findings = []
    counts = defaultdict(int)

    def add(record_id, grade, subject, lesson, code, severity, confidence, detail, evidence):
        finding = {'record_id': record_id, 'grade': grade, 'subject': subject,
                   'lesson': lesson, 'code': code, 'severity': severity,
                   'confidence': confidence, 'detail': detail,
                   'evidence': evidence, 'requires_human_review': True}
        findings.append(finding); counts[severity] += 1

    seen_ids = set()
    title_groups = defaultdict(list)
    for rec in encyclopedia:
        rid = str(rec.get('id') or '')
        title = norm(rec.get('lesson'))
        if not rid or rid in seen_ids:
            add(rid or 'unknown', rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                'duplicate_or_missing_record_id', 'high', 'high',
                'معرّف الدرس مفقود أو مكرر داخل الموسوعة.', {'record_id': rid})
        seen_ids.add(rid)
        if title: title_groups[(title, norm(rec.get('grade')), norm(rec.get('subject')), str(rec.get('term')))].append(rec)
        required = ['grade','subject','term','topic','lesson']
        missing = [k for k in required if rec.get(k) in (None, '', [])]
        if missing:
            add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                'missing_lesson_metadata', 'medium', 'high',
                'بيانات وصفية أساسية ناقصة.', {'missing_fields': missing})
        if not rec.get('key_ideas'):
            add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                'missing_key_ideas', 'medium', 'high',
                'لا توجد أفكار أساسية مسجلة لهذا الدرس.', {'field': 'key_ideas'})
        if not rec.get('procedures'):
            add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                'missing_procedures', 'medium', 'high',
                'لا توجد خطوات أو إجراءات تعليمية مسجلة.', {'field': 'procedures'})
        examples = rec.get('worked_examples') or []
        if not examples:
            add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                'missing_worked_examples', 'medium', 'high',
                'لا يحتوي سجل الدرس على مثال محلول.', {'field': 'worked_examples'})
        for ix, ex in enumerate(examples):
            if not str(ex.get('question') or '').strip() or not str(ex.get('answer') or '').strip():
                add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                    'incomplete_worked_example', 'high', 'high',
                    'مثال محلول ينقصه نص السؤال أو الإجابة.', {'example_index': ix,
                    'question_present': bool(str(ex.get('question') or '').strip()),
                    'answer_present': bool(str(ex.get('answer') or '').strip())})
            if not ex.get('solution_steps'):
                add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                    'example_without_solution_steps', 'low', 'high',
                    'المثال لا يتضمن خطوات حل مفصلة.', {'example_index': ix})
            exid = str(ex.get('exercise_id') or '')
            if exid and exid not in exercise_by_id:
                add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                    'unmatched_exercise_reference', 'high', 'high',
                    'مرجع المثال لا يطابق تمريناً موجوداً في بنك التمارين.',
                    {'exercise_id': exid})
        # Check source exercise references from deep content against actual bank.
        dc = deep_by_id.get(rid)
        if not dc:
            add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                'missing_deep_content_link', 'medium', 'high',
                'لا توجد بطاقة محتوى عميق مرتبطة بمعرّف هذا الدرس.', {'lesson_id': rid})
        else:
            src = (dc.get('evidence') or {}).get('source_exercise_ids') or []
            missing_src = [str(x) for x in src if str(x) not in exercise_by_id]
            if missing_src:
                add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                    'unmatched_deep_source_ids', 'high', 'high',
                    'إحالات بطاقة المحتوى العميق لا تطابق بنك التمارين.',
                    {'missing_source_exercise_ids': missing_src})
        # Duplicate ideas within one record are editorial signals, not proof of error.
        ideas = [norm(x) for x in (rec.get('key_ideas') or []) if norm(x)]
        repeated = sorted({x for x in ideas if ideas.count(x) > 1})
        if repeated:
            add(rid, rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                'repeated_key_ideas', 'low', 'high',
                'توجد أفكار أساسية مكررة حرفياً بعد التطبيع.', {'repeated_ideas': repeated[:5]})

    # Same normalized lesson title with divergent key-idea sets: review candidate only.
    for title, group in title_groups.items():
        if len(group) < 2: continue
        variants = defaultdict(list)
        for rec in group:
            key = tuple(sorted({norm(x) for x in (rec.get('key_ideas') or []) if norm(x)}))
            variants[key].append(rec)
        if len(variants) > 1:
            ids = [str(r.get('id')) for r in group]
            for rec in group:
                add(str(rec.get('id')), rec.get('grade'), rec.get('subject'), rec.get('lesson'),
                    'same_title_content_divergence', 'medium', 'medium',
                    'دروس تحمل العنوان نفسه لكن أفكارها الأساسية تختلف؛ قد يكون الاختلاف مشروعاً لاختلاف المستوى أو السياق.',
                    {'related_record_ids': ids, 'distinct_key_idea_sets': len(variants)})

    # Knowledge records use a separate identifier space; they are intentionally
    # not joined to encyclopedia IDs without an explicit crosswalk.

    findings.sort(key=lambda x: ({'high':0,'medium':1,'low':2,'info':3}.get(x['severity'],9), x['record_id'], x['code']))
    source_files = ['teacher-encyclopedia-2026-2027.json','teacher-deep-content-2026-2027.json',
                    'exercise-bank-2026-2027.json','teacher-knowledge-2026-2027.json',
                    'teacher-knowledge-graph-2026-2027.json']
    summary = {'lessons_checked': len(encyclopedia), 'deep_content_records': len(deep),
               'exercise_records': len(exercises), 'knowledge_records': len(knowledge),
               'findings_total': len(findings), 'high_priority': counts['high'],
               'medium_priority': counts['medium'], 'low_priority': counts['low'],
               'officially_verified_lessons': sum(1 for x in encyclopedia if x.get('evidence_status') == 'officially_verified'),
               'policy': 'Deterministic structural/editorial screening only; findings are not proof of scientific or pedagogical error.'}
    payload = {'schema_version':'1.0','release':'2.9.33','academic_year':'2026-2027',
               'title':'Teacher scientific and pedagogical review candidates',
               'summary':summary,'severity_policy':{
                   'high':'خلل بنيوي واضح أو إحالة مفقودة تستلزم الفحص قبل الاستخدام.',
                   'medium':'نقص أو اختلاف يستحق مراجعة المحرر؛ لا يثبت خطأ علمياً.',
                   'low':'تحسين تحريري أو استكمال اختياري.'},
               'findings':findings,
               'source_hashes':{name:digest(DATA/name) for name in source_files}}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    print('Output:', OUT.relative_to(ROOT))

if __name__ == '__main__': main()
