import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('eval',Path('tools/evaluate_exam_quality.py')); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
paper={'grade':'الأولى متوسط','subject':'الرياضيات','term':1,'duration_minutes':60,'total_points':20,'student_version':{'questions':[{'id':'q1','points':10},{'id':'q2','points':10}]},'teacher_version':{'answer_key':[{'id':'q1'},{'id':'q2'}],'marking_scheme':[{'points':10,'criteria':[{'points':10}]},{'points':10,'criteria':[{'points':10}]}]}}
r=mod.evaluate(paper); assert r['passed'],r
bad={**paper,'teacher_version':{'answer_key':[],'marking_scheme':[]}}; assert not mod.evaluate(bad)['passed']
print('v2.8.4 exam quality benchmark tests passed')
