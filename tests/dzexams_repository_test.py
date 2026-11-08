import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('dzrepo', ROOT / 'tools/sync_dzexams_repository.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

class RepositoryImporterTests(unittest.TestCase):
    def test_url_allowlist(self):
        self.assertTrue(mod.allowed_url('https://www.dzexams.com/file.pdf'))
        self.assertTrue(mod.allowed_url('https://dzexams.com/file.pdf'))
        self.assertFalse(mod.allowed_url('http://dzexams.com/file.pdf'))
        self.assertFalse(mod.allowed_url('https://dzexams.com.evil.test/file.pdf'))
        self.assertFalse(mod.allowed_url('https://other.test/file.pdf'))
    def test_safe_filename(self):
        name = mod.safe_name('../../فرض الرياضيات: 2025.pdf')
        self.assertNotIn('/', name); self.assertNotIn(':', name); self.assertTrue(name)
    def test_download_rejects_unsafe_before_network(self):
        class Robots:
            def can_fetch(self, *_): return True
        with self.assertRaises(ValueError):
            mod.download('https://attacker.test/file.pdf', Robots())
    def test_manifest_schema_and_template(self):
        import json, csv
        data=json.loads((ROOT/'web/data/dzexams-repository-index.json').read_text())
        self.assertEqual(data['schema'],'sm-dzexams-index-v1'); self.assertEqual(data['items'],[])
        with (ROOT/'templates/dzexams-approved-files.csv').open() as f:
            self.assertEqual(next(csv.reader(f)),['url','grade','subject','title','year','term','solution'])

if __name__ == '__main__': unittest.main(verbosity=2)
