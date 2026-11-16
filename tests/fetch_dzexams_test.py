"""tools/fetch_dzexams.py: allowed hosts, robots.txt, validation, no duplicates, index format (local mock site)."""
import json, subprocess, sys, tempfile, threading, http.server, functools
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools/fetch_dzexams.py"

with tempfile.TemporaryDirectory() as tmp:
    site = Path(tmp) / "site"
    (site / "files").mkdir(parents=True)
    (site / "robots.txt").write_text("User-agent: *\nDisallow: /private\n")
    (site / "files/a.pdf").write_bytes(b"%PDF-1.4\nAAA")
    (site / "files/b.docx").write_bytes(b"PK\x03\x04word")
    (site / "files/fake.pdf").write_bytes(b"<html>login</html>")
    (site / "files/secret.pdf").write_bytes(b"%PDF-1.4\nSECRET")
    (site / "list.html").write_text(
        '<h1>امتحانات الرياضيات</h1><a href="/files/a.pdf">اختبار</a><a href="/files/a.pdf">تحميل الحل</a>'
        '<a href="/files/b.docx">فرض</a><a href="/files/fake.pdf">x</a><a href="/private/s.pdf">خاص</a>'
        '<a href="https://evil.example.com/e.pdf">ext</a>', encoding="utf8")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    out, idx = Path(tmp) / "exams", Path(tmp) / "index.json"
    cmd = [sys.executable, str(TOOL), "--allow-local", "--delay", "0", "--out-dir", str(out), "--index", str(idx), "--page", f"G1={base}/list.html"]
    r1 = subprocess.run(cmd, capture_output=True, text=True)
    assert r1.returncode == 0, r1.stderr
    d = json.loads(idx.read_text(encoding="utf8"))
    assert d["count"] == 2, d  # a.pdf + b.docx; fake, /private and external host are rejected
    assert {x["ext"] for x in d["documents"]} == {"pdf", "docx"}
    assert all(x["file"].startswith("exams/dzexams/") and x["grade"] == "G1" for x in d["documents"])
    assert len(list(out.iterdir())) == 2
    r2 = subprocess.run(cmd, capture_output=True, text=True)
    assert json.loads(idx.read_text(encoding="utf8"))["count"] == 2, "second run must not duplicate"
    assert '"new_files": 0' in r2.stdout
    # host outside the allow-list is refused without any request
    r3 = subprocess.run([sys.executable, str(TOOL), "--delay", "0", "--out-dir", str(out), "--index", str(idx), "--page", "G1=https://example.com/x"], capture_output=True, text=True)
    assert "not allowed" in r3.stdout
    srv.shutdown()
print("PASS: fetch_dzexams tool — hosts, robots.txt, validation, idempotent index")
