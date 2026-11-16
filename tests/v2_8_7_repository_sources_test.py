"""v2.8.7: the approved-file importer handles DZExams and Raji3DZ separately (hosts, index, folder), offline."""
import hashlib, importlib.util, json, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("syncrepo", ROOT / "tools/sync_dzexams_repository.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

PDF = b"%PDF-1.4\n" + b"A" * 400

class FakeResponse:
    def __init__(self, url, data): self._u, self._d = url, data; self.headers = {"Content-Type": "application/pdf"}
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def geturl(self): return self._u
    def read(self, n=-1): return self._d

class Robots:
    def __init__(self, allow=True): self.allow = allow
    def can_fetch(self, *_): return self.allow

class Sources(unittest.TestCase):
    def test_host_allowlists_are_separate(self):
        self.assertTrue(mod.allowed_url("https://www.raji3dz.com/f.pdf", mod.SOURCES["raji3dz"]["allowed"]))
        self.assertFalse(mod.allowed_url("https://www.dzexams.com/f.pdf", mod.SOURCES["raji3dz"]["allowed"]))
        self.assertFalse(mod.allowed_url("https://raji3dz.com.evil.test/f.pdf", mod.SOURCES["raji3dz"]["allowed"]))
        self.assertFalse(mod.allowed_url("http://raji3dz.com/f.pdf", mod.SOURCES["raji3dz"]["allowed"]))
        self.assertTrue(mod.allowed_url("https://dzexams.com/f.pdf"))          # default = DZExams (backward compatible)
        self.assertFalse(mod.allowed_url("https://raji3dz.com/f.pdf"))
    def test_download_rejects_other_sources_host_and_redirects(self):
        with self.assertRaises(ValueError):
            mod.download("https://www.dzexams.com/a.pdf", Robots(), mod.SOURCES["raji3dz"]["allowed"])
        with mock.patch.object(mod, "urlopen", lambda req, timeout=0: FakeResponse("https://evil.test/x.pdf", PDF)):
            with self.assertRaises(ValueError):
                mod.download("https://www.raji3dz.com/a.pdf", Robots(), mod.SOURCES["raji3dz"]["allowed"])
        with self.assertRaises(ValueError):
            mod.download("https://www.raji3dz.com/a.pdf", Robots(False), mod.SOURCES["raji3dz"]["allowed"])
    def test_distinct_schema_index_and_folder(self):
        a, b = mod.SOURCES["dzexams"], mod.SOURCES["raji3dz"]
        self.assertNotEqual(a["schema"], b["schema"]); self.assertNotEqual(a["index"], b["index"]); self.assertNotEqual(a["dest"], b["dest"])
        self.assertEqual(b["url_path"], "repository/raji3dz")
        data = json.loads((ROOT / "web/data/raji3dz-repository-index.json").read_text(encoding="utf-8"))
        self.assertEqual(data["schema"], b["schema"]); self.assertIsInstance(data["items"], list)

    def _run(self, tmp, rows, extra=()):
        csv_path = tmp / "in.csv"; csv_path.write_text("url,grade,subject,title,year,term,solution\n" + rows, encoding="utf-8")
        src = dict(mod.SOURCES["raji3dz"], index=tmp / "idx.json", dest=tmp / "repo")
        argv = ["x", "--source", "raji3dz", "--csv", str(csv_path), "--delay", "0", *extra]
        with mock.patch.dict(mod.SOURCES, {"raji3dz": src}), mock.patch.object(sys, "argv", argv), \
             mock.patch.object(mod, "read_robots", lambda url: Robots()), mock.patch.object(mod.time, "sleep", lambda s: None), \
             mock.patch.object(mod, "urlopen", lambda req, timeout=0: FakeResponse(req.full_url, PDF)):
            return mod.main(), src

    def test_requires_permission_flag(self):
        with tempfile.TemporaryDirectory() as d, self.assertRaises(SystemExit):
            self._run(Path(d), "https://www.raji3dz.com/a.pdf,2AM,math,t,2025,1,1\n")
    def test_import_writes_file_and_index_for_raji3dz(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            code, src = self._run(tmp, "https://www.raji3dz.com/files/a.pdf,الثانية متوسط,رياضيات,فرض 1,2025,1,نعم\n", ["--permission-confirmed"])
            self.assertEqual(code, 0)
            idx = json.loads((tmp / "idx.json").read_text(encoding="utf-8"))
            self.assertEqual(idx["schema"], "sm-raji3dz-index-v1"); self.assertEqual(len(idx["items"]), 1)
            it = idx["items"][0]
            self.assertEqual(it["source"], "raji3dz"); self.assertTrue(it["rights_cleared"]); self.assertTrue(it["solution"])
            self.assertEqual((it["year"], it["term"], it["ext"]), (2025, 1, "pdf"))
            self.assertIn("/repository/raji3dz/", it["file"]); self.assertNotIn("/repository/exams/", it["file"])
            self.assertEqual(it["sha256"], hashlib.sha256(PDF).hexdigest()); self.assertEqual(it["source_url"], "https://www.raji3dz.com/files/a.pdf")
            self.assertEqual(len(list((tmp / "repo").rglob("*.pdf"))), 1)
            # re-running with the same URL does not duplicate
            code2, _ = self._run(tmp, "https://www.raji3dz.com/files/a.pdf,الثانية متوسط,رياضيات,فرض 1,2025,1,نعم\n", ["--permission-confirmed"])
            self.assertEqual(code2, 0); self.assertEqual(len(json.loads((tmp / "idx.json").read_text(encoding="utf-8"))["items"]), 1)
    def test_cross_source_url_is_refused_and_nothing_written(self):
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            code, _ = self._run(tmp, "https://www.dzexams.com/a.pdf,2AM,math,t,2025,1,0\n", ["--permission-confirmed"])
            self.assertEqual(code, 2); self.assertFalse((tmp / "repo").exists())
    def test_template_headers(self):
        import csv
        for name in ("dzexams", "raji3dz"):
            with (ROOT / f"templates/{name}-approved-files.csv").open(encoding="utf-8-sig") as f:
                self.assertEqual(next(csv.reader(f))[:7], ["url", "grade", "subject", "title", "year", "term", "solution"])

if __name__ == "__main__": unittest.main(verbosity=2)
