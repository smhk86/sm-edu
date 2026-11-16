import json,re,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'web/data/teacher-deep-content-2026-2027.json'
out=ROOT/'web/data/teacher-content-quality-2026-2027.json'
data=json.loads(src.read_text(encoding='utf-8'))
rows=[]
for r in data.get('records',[]):
    flags=[]
    exp=r.get('new_worked_examples') or []
    ex=exp[0] if exp else {}
    q=str(ex.get('question','')).strip(); ans=str(ex.get('answer','')).strip(); steps=ex.get('steps') or []
    rule=str((r.get('rules_and_laws') or {}).get('rule','')).strip()
    generic_q=('طبّق فكرة الدرس على موقف جديد' in q or 'اذكر مثالاً من حياتك الدراسية' in q or len(q)<35)
    if generic_q: flags.append({'code':'generic_example_question','severity':'review','label':'صياغة المثال عامة وتحتاج سؤالاً محدداً'})
    if not ans or len(ans)<12: flags.append({'code':'weak_example_answer','severity':'high','label':'الإجابة قصيرة أو غير مكتملة'})
    if ans and q and ans==q: flags.append({'code':'answer_repeats_question','severity':'high','label':'الإجابة تكرر السؤال'})
    if not steps or len(steps)<2: flags.append({'code':'insufficient_solution_steps','severity':'review','label':'خطوات الحل غير كافية'})
    if not rule or len(rule)<18: flags.append({'code':'weak_rule','severity':'high','label':'القاعدة أو القانون يحتاج استكمالاً'})
    if r.get('science_experiment') and not (r['science_experiment'].get('safety') and len(r['science_experiment'].get('steps') or [])>=2): flags.append({'code':'experiment_safety_or_steps','severity':'high','label':'بيانات التجربة أو السلامة غير مكتملة'})
    ev=r.get('evidence') or {}
    if ev.get('official_curriculum_verified') is not False: flags.append({'code':'provenance_missing','severity':'high','label':'حالة التحقق الرسمي غير محددة بوضوح'})
    rows.append({'record_id':str(r.get('lesson_id') or ''),'grade':r.get('grade',''),'subject':r.get('subject',''),'term':r.get('term',0),'lesson':r.get('lesson',''),'flags':flags,'initial_status':'draft','officially_verified':False})
summary={'records':len(rows),'records_with_flags':sum(bool(x['flags']) for x in rows),'high_severity_flags':sum(f['severity']=='high' for x in rows for f in x['flags']),'review_flags':sum(f['severity']=='review' for x in rows for f in x['flags']),'teacher_reviewed':0,'officially_verified':0,'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'policy':'Automated screening only; no record is approved or officially verified by this report.'}
out.write_text(json.dumps({'academic_year':'2026-2027','generated_by':'build_teacher_content_quality_v2_9_30.py','summary':summary,'records':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
