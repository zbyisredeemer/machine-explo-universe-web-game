import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('packager', Path(__file__).resolve().parents[1] / 'scripts/package_release.py')
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for name in packager.INPUTS:
            path = self.root / name
            if '.' not in name:
                path.mkdir()
                (path / 'sample.js').write_text('input')
            else:
                path.write_text('input')
        (self.root / 'package.json').write_text(json.dumps({'version': '1.0.0'}))
        (self.root / 'dist').mkdir()
        (self.root / 'dist/index.html').write_text('build')
        (self.root / 'test-results').mkdir()
        reports = []
        for suite in packager.SUITES:
            name = 'inspection' if suite == 'inspection-robustness' else suite
            path = f'test-results/{name}.json'
            (self.root / path).write_text(json.dumps({'passed': True}))
            reports.append(path)
        evidence = {'passed': True, 'version': '1.0.0', 'suites': packager.SUITES,
                    'inputs': packager.fingerprint(packager.INPUTS, self.root),
                    'build': packager.fingerprint(['dist'], self.root),
                    'reports': packager.fingerprint(reports, self.root)}
        (self.root / 'test-results/verification.json').write_text(json.dumps(evidence))

    def tearDown(self):
        self.temp.cleanup()

    def test_verified_inputs_are_accepted(self):
        self.assertEqual(packager.verify(self.root)[0], '1.0.0')

    def test_source_build_and_report_edits_each_invalidate_release(self):
        for file in ['src/sample.js', 'dist/index.html', 'test-results/production.json']:
            path = self.root / file
            original = path.read_text()
            path.write_text('changed')
            with self.assertRaises(ValueError):
                packager.verify(self.root)
            path.write_text(original)

    def test_missing_suite_cannot_reuse_an_old_pass(self):
        path = self.root / 'test-results/verification.json'
        data = json.loads(path.read_text())
        data['suites'] = ['production']
        path.write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            packager.verify(self.root)

    def test_added_source_file_invalidates_release(self):
        (self.root / 'src/new.js').write_text('new')
        with self.assertRaises(ValueError):
            packager.verify(self.root)
