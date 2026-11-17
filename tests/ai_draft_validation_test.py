import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.main import ClaudeContentRequest, _validate_claude_educational_draft


def test_exercise_draft_requires_complete_questions_and_answers():
    payload = ClaudeContentRequest(task="exercise", grade="الأولى متوسط", subject="الرياضيات", topic="الأعداد", term=1)
    valid = {"questions": [{"prompt": f"سؤال {i}", "answer": f"حل {i}", "solution_steps": ["خطوة"]} for i in range(1, 6)], "marking_rubric": [{"criterion": "التصحيح", "points": 20}]}
    result = _validate_claude_educational_draft(valid, payload)
    assert result["quality_validation"]["status"] == "structure_validated"
    assert result["quality_validation"]["all_questions_have_model_answers"] is True
    assert result["published_to_bank"] is False
    assert result["questions"][0]["question"] == "سؤال 1"


def test_integrative_draft_requires_context_and_three_to_five_questions():
    payload = ClaudeContentRequest(task="integrative", grade="الأولى متوسط", subject="الرياضيات", topic="التناسبية", term=2)
    draft = {"situation": "تريد مدرسة تنظيم رحلة تعليمية وتحتاج إلى حساب التكاليف والمسافات.", "questions": [{"question": f"مهمة {i}", "model_answer": f"الحل {i}", "solution_steps": [f"خطوة {i}"]} for i in range(1, 4)]}
    result = _validate_claude_educational_draft(draft, payload)
    assert result["quality_validation"]["question_count"] == 3
    assert result["teacher_review_required"] is True


def test_incomplete_draft_is_rejected():
    payload = ClaudeContentRequest(task="exercise", grade="الأولى متوسط", subject="الرياضيات", topic="الأعداد", term=1)
    try:
        _validate_claude_educational_draft({"questions": [{"question": "سؤال بلا حل"}] * 5}, payload)
    except ValueError:
        return
    raise AssertionError("incomplete AI draft must be rejected")


def test_exercise_question_count_and_rubric_total_are_checked():
    payload = ClaudeContentRequest(task="exercise", grade="الأولى متوسط", subject="الرياضيات", topic="الأعداد", term=1, question_count=3, total_points=10)
    questions = [{"question": f"سؤال {i}", "answer": f"حل {i}", "solution_steps": ["خطوة"]} for i in range(1, 4)]
    valid = _validate_claude_educational_draft({"questions": questions, "marking_rubric": [{"criterion": "المنهجية", "points": 4}, {"criterion": "النتيجة", "points": 6}]}, payload)
    assert valid["quality_validation"]["status"] == "structure_validated"
    assert valid["quality_validation"]["rubric_total"] == 10
    mismatch = _validate_claude_educational_draft({"questions": questions, "marking_rubric": [{"criterion": "المنهجية", "points": 8}]}, payload)
    assert mismatch["quality_validation"]["status"] == "teacher_adjustment_required"
    assert mismatch["quality_validation"]["rubric_expected_total"] == 10


def test_exercise_count_must_match_requested_count():
    payload = ClaudeContentRequest(task="exercise", grade="الأولى متوسط", subject="الرياضيات", topic="الأعداد", term=1, question_count=6)
    questions = [{"question": f"سؤال {i}", "answer": f"حل {i}", "solution_steps": ["خطوة"]} for i in range(1, 6)]
    try:
        _validate_claude_educational_draft({"questions": questions}, payload)
    except ValueError:
        return
    raise AssertionError("exercise draft must match requested question count")


if __name__ == "__main__":
    test_exercise_draft_requires_complete_questions_and_answers()
    test_integrative_draft_requires_context_and_three_to_five_questions()
    test_incomplete_draft_is_rejected()
    test_exercise_question_count_and_rubric_total_are_checked()
    test_exercise_count_must_match_requested_count()
    print("PASS: AI educational draft structure and answer validation")
