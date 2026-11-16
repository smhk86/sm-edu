from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
active = [ROOT/'backend/app/main.py', ROOT/'backend/.env.example', ROOT/'web/app.js', ROOT/'web/smart-generator.js', ROOT/'web/config.js', ROOT/'web/index.html', ROOT/'web/sw.js', ROOT/'web/styles.css']
for path in active:
    text = path.read_text(encoding='utf-8')
    assert not re.search(r'claude|anthropic', text, re.I), f'provider residue in {path.relative_to(ROOT)}'
main = (ROOT/'backend/app/main.py').read_text(encoding='utf-8')
assert '@app.post("/api/v1/ai/tutor")' in main
assert 'version="2.9.48"' in main
index = (ROOT/'web/index.html').read_text(encoding='utf-8')
assert 'gemini-direct.js' in index and 'claude-chat' not in index
print('PASS: provider removal, retained Gemini integration, and release metadata')
