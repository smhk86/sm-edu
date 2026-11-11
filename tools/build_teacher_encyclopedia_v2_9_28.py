#!/usr/bin/env python3
"""Build the evidence-labelled Smart Teacher lesson encyclopedia from the platform exercise bank."""
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web/data/exercise-bank-2026-2027.json'
TARGET = ROOT / 'web/data/teacher-encyclopedia-2026-2027.json'


def build():
    bank = json.loads(SOURCE.read_text(encoding='utf-8'))
    groups = collections.OrderedDict()
    for item in bank['records']:
        key = (item.get('grade', ''), item.get('subject', ''), int(item.get('term') or 0),
               item.get('topic') or 'موضوع غير محدد', item.get('lesson') or item.get('topic') or 'درس غير محدد')
        groups.setdefault(key, []).append(item)

    lessons = []
    for index, (key, items) in enumerate(groups.items(), 1):
        grade, subject, term, topic, lesson = key
        examples, ideas, procedures, alternatives, targets = [], [], [], [], []
        for item in items:
            choices = item.get('choices') or []
            answer_index = item.get('answer_index')
            answer = item.get('solution')
            if not answer and isinstance(answer_index, int) and 0 <= answer_index < len(choices):
                answer = choices[answer_index]
            example = {
                'exercise_id': item.get('id'), 'question': item.get('question'), 'answer': answer,
                'explanation': item.get('explanation') or '', 'solution_steps': item.get('solution_steps') or [],
                'difficulty': item.get('difficulty') or 'غير محدد',
                'question_type': item.get('question_type') or 'غير محدد'
            }
            if len(examples) < 4:
                examples.append(example)
            explanation = (item.get('explanation') or '').strip()
            if explanation and explanation not in ideas:
                ideas.append(explanation)
            for step in item.get('solution_steps') or []:
                step = (step or '').strip()
                if step and step not in procedures:
                    procedures.append(step)
            if isinstance(answer_index, int) and 0 <= answer_index < len(choices):
                for choice_index, choice in enumerate(choices):
                    if choice_index != answer_index and choice not in alternatives:
                        alternatives.append(choice)
            target = (item.get('curriculum_alignment') or {}).get('competency_target')
            if target and target not in targets:
                targets.append(target)
        lessons.append({
            'id': f'ency-{index:05d}', 'grade': grade, 'stage': items[0].get('level') or '',
            'subject': subject, 'term': term, 'topic': topic, 'lesson': lesson,
            'exercise_count': len(items), 'exercise_ids': [item.get('id') for item in items],
            'learning_targets': targets[:4], 'key_ideas': ideas[:6], 'procedures': procedures[:10],
            'worked_examples': examples, 'observed_alternatives': alternatives[:12],
            'evidence_status': 'platform_practice_derived_not_official_curriculum',
            'content_review_status': 'requires_human_editorial_review', 'official_sequence_verified': False
        })
    pack = {
        'schema_version': '1.0.0', 'academic_year': bank.get('academic_year', '2026-2027'),
        'country': 'Algeria',
        'title': 'موسوعة المعلم الذكي — وحدات دروس مستخلصة من بنك تمارين المنصة',
        'source_policy': {
            'primary_source': 'web/data/exercise-bank-2026-2027.json',
            'derivation': 'Grouped and indexed existing platform exercises, explanations and solution steps; no new ministry curriculum claims were added.',
            'official_status': 'not_official_ministry_content', 'human_review': 'pending',
            'warning': 'هذه الموسوعة مشتقة من محتوى تدريبي للمنصة. لا تثبت وحدها صحة التدرج السنوي أو الاعتماد الوزاري. البدائل المرصودة ليست تشخيصاً لأخطاء المتعلمين.'
        },
        'statistics': {
            'lesson_capsules': len(lessons), 'exercise_records_linked': len(bank['records']),
            'worked_examples_indexed': sum(len(item['worked_examples']) for item in lessons),
            'distinct_grades': len({item['grade'] for item in lessons}),
            'distinct_subjects': len({item['subject'] for item in lessons})
        },
        'records': lessons
    }
    TARGET.write_text(json.dumps(pack, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f"Built {len(lessons)} lesson capsules from {len(bank['records'])} exercises: {TARGET}")


if __name__ == '__main__':
    build()
