"""Release metadata consistency checks for SM SCHOOL AI."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_EXPECTED = "2.9.38"
BACKEND_EXPECTED = "2.9.38"

def run():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    backend = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    sw = (ROOT / "web/sw.js").read_text(encoding="utf-8")
    app = (ROOT / "web/app.js").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "web/manifest.webmanifest").read_text(encoding="utf-8"))

    assert package["version"] == FRONTEND_EXPECTED, package["version"]
    capacitor = json.loads((ROOT / "capacitor.config.json").read_text(encoding="utf-8"))
    assert capacitor["appName"] == "SM éducation", "Capacitor display name is out of sync"
    assert f'version="{BACKEND_EXPECTED}"' in backend, "FastAPI version is out of sync"
    assert f'"version": "{BACKEND_EXPECTED}"' in backend, "API response version is out of sync"
    assert readme.startswith(f"# SM éducation v{FRONTEND_EXPECTED}"), "README title is out of sync"
    assert f"sm-school-ai-v{FRONTEND_EXPECTED}-shell-r1" in sw, "PWA cache key is out of sync"
    assert "v2-9-26.js" in (ROOT / "web/index.html").read_text(encoding="utf-8"), "v2.9.38 parent comparison module is not loaded"
    assert "parentMonthlyComparison:true" in (ROOT / "web/v2-9-26-marker.js").read_text(encoding="utf-8"), "v2.9.38 feature metadata is missing"
    assert "v2-9-27.js" in (ROOT / "web/index.html").read_text(encoding="utf-8"), "v2.9.38 Smart Teacher knowledge module is not loaded"
    assert "teacher-knowledge-2026-2027.json" in sw, "Smart Teacher knowledge database is not cached"
    index = (ROOT / "web/index.html").read_text(encoding="utf-8")
    assert "v2-9-28.js" in index, "v2.9.38 lesson encyclopedia module is not loaded"
    assert "teacher-encyclopedia-2026-2027.json" in sw, "Smart Teacher encyclopedia is not cached"
    assert "teacher-deep-content-2026-2027.json" in sw, "Deep teacher content is not cached"
    assert "./v2-9-29.js" in sw, "Deep teacher content module is not cached"
    assert "v2-9-29.js" in index, "Deep teacher content module is not loaded"
    assert "v2-9-30.js" in index, "Teacher content quality review module is not loaded"
    assert "./v2-9-30.js" in sw, "Teacher content quality review module is not cached"
    assert "teacher-content-quality-2026-2027.json" in sw, "Teacher content quality audit is not cached"
    assert "v2-9-31.js" in index and "./v2-9-31.js" in sw, "Teacher knowledge traceability module is not wired"
    assert "teacher-knowledge-integrity-2026-2027.json" in sw, "Teacher knowledge integrity index is not cached"
    assert "v2-9-32.js" in index and "./v2-9-32.js" in sw, "Teacher knowledge graph module is not wired"
    assert "teacher-knowledge-graph-2026-2027.json" in sw, "Teacher knowledge graph is not cached"
    assert "v2-9-33.js" in index and "./v2-9-33.js" in sw, "Teacher scientific audit module is not wired"
    assert "teacher-scientific-audit-2026-2027.json" in sw, "Teacher scientific audit data is not cached"
    assert "v2-9-34.js" in index and "./v2-9-34.js" in sw, "Unified retrieval module is not wired"
    assert "teacher-retrieval-index-2026-2027.json" in sw, "Unified retrieval index is not cached"
    assert 'src="smart-teacher-books.js"' in index and "./smart-teacher-books.js" in sw, "Smart Teacher textbook library is not wired into app/PWA"
    runtime = (ROOT / "web/platform-enhancements.js").read_text(encoding="utf-8")
    assert 'src="platform-enhancements.js"' in index and "./platform-enhancements.js" in sw, "Runtime status module is not wired"
    assert "skip-link" in index and "connectionStatus" in runtime, "Accessibility or connection status enhancement is missing"
    assert "request.mode==='navigate'" in sw and "caches.match('./index.html')" in sw, "Offline navigation fallback is missing"
    assert "function calculateStudyStreak(" in app, "Study streak logic is missing"
    assert "function adaptiveTrendForSubject(" in app and "engine_version:'1.8.8'" in app, "v1.8.8 adaptive learning engine is missing"
    assert manifest["name"] == "SM éducation", "PWA manifest name is out of sync"
    assert (ROOT / "V1.8.9_RELEASE_REPORT.md").exists(), "v1.8.9 release report is missing"
    planner = (ROOT / "web/lesson-planner-v1-18-2.js").read_text(encoding="utf-8")
    assert "smSchoolLessonPlansV182" in planner and 'src="lesson-planner-v1-18-2.js"' in (ROOT / "web/index.html").read_text(encoding="utf-8"), "v1.19.0 lesson planner is not wired"
    teacher = (ROOT / "web/smart-teacher.js").read_text(encoding="utf-8")
    assert "function analyzeSmartTeacherReasoning(" in teacher and "smSchoolReasoningRecords" in teacher, "reasoning coach is missing"
    assert "smSchoolReasoningRecords" in app, "reasoning records are not included in backup/delete handling"
    home = (ROOT / "web/home-school.js").read_text(encoding="utf-8")
    assert "function homeSchoolPage(" in home and "function homeWeekPlan(" in home, "Home school module is missing"
    assert 'src="home-school.js"' in index and "./home-school.js" in sw, "Home school script is not wired into index/service worker"
    assert (ROOT / "web/lessons-extra.js").exists() and 'src="lessons-extra.js"' in index and "./lessons-extra.js" in sw, "Extra lessons are not wired in"
    assert "smSchoolHomeSchool" in app, "Home school data is not included in backup/delete handling"
    assert "function learnerManager()" in app and "function selectLearner(id)" in app, "Learner profile UI is missing"
    assert "learnerId:learner.id" in app, "Progress is not tagged to an active learner"
    assert "smSchoolLearners" in app, "Learner profiles are not included in local backup"
    assert "smSchoolStudentProfileGoals" in app, "Student profile goals are not backed up"
    assert "smSchoolLearningMemory" in app, "Learning memory is not included in backup/delete handling"
    memory = (ROOT / "web/learning-memory.js").read_text(encoding="utf-8")
    assert "function learningMemoryEvidence(" in memory and "function learningMemorySnapshot(" in memory, "Long-term learning memory engine is missing"
    assert 'src="learning-memory.js"' in index and "./learning-memory.js" in sw, "Learning memory module is not wired into app/PWA"
    profile = (ROOT / "web/student-profile.js").read_text(encoding="utf-8")
    assert "function studentProfilePanel(learner)" in profile, "AI student profile module is missing"
    assert 'src="student-profile.js"' in index and "./student-profile.js" in sw, "Student profile module is not wired into app/PWA"
    assert 'src="family-dashboard.js"' in index and "./family-dashboard.js" in sw, "Family dashboard module is not wired into app/PWA"
    assert 'src="parent-account.js"' in index and "./parent-account.js" in sw, "Parent account module is not wired into app/PWA"
    auth = (ROOT / "backend/app/parent_auth.py").read_text(encoding="utf-8")
    assert "PBKDF2_ROUNDS = 310_000" in auth and "role TEXT NOT NULL DEFAULT 'parent' CHECK(role='parent')" in auth, "Parent-only authentication policy is missing"
    sync = (ROOT / "web/parent-account.js").read_text(encoding="utf-8")
    assert "AES-256-GCM" in sync and "PBKDF2-SHA256-310000" in sync, "Client-side encrypted transfer is missing"
    assert '@app.post("/api/v1/parents/sync/create")' in backend and '@app.post("/api/v1/parents/sync/redeem")' in backend, "Parent sync endpoints are missing"
    assert (ROOT / "tests/parent_sync_test.py").exists() and (ROOT / "tests/parent_sync_ui_test.js").exists(), "Parent sync regression tests are missing"
    print(f"PASS: release metadata, long-term learning memory, adaptive learning engine and retained integrations are frontend v{FRONTEND_EXPECTED} and backend API v{BACKEND_EXPECTED}")

if __name__ == "__main__":
    run()
