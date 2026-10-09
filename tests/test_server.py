import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location('launcher', Path(__file__).resolve().parents[1] / 'scripts/serve.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'index.html').write_text('<h1>game</h1>')
        (self.root / 'build-info.json').write_text(json.dumps({'game': 'alien-body', 'version': 'test'}))
        (self.root / '.secret').write_text('not public')
        (self.root / 'assets').mkdir()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(launcher.Handler, directory=str(self.root)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def test_headers_and_build_identity(self):
        with urllib.request.urlopen(self.url) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
            self.assertIn("connect-src 'none'", response.headers['Content-Security-Policy'])
        with urllib.request.urlopen(self.url + '/_alien-body') as response:
            self.assertEqual(json.load(response)['version'], 'test')

    def assert_status(self, path, status, headers=None):
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(urllib.request.Request(self.url + path, headers=headers or {}))
        self.assertEqual(error.exception.code, status)
        error.exception.close()

    def test_host_dotfiles_directory_listing_and_source_are_denied(self):
        self.assert_status('/', 403, {'Host': 'attacker.example'})
        self.assert_status('/.secret', 403)
        self.assert_status('/%2esecret', 403)
        self.assert_status('/assets/', 404)
        self.assert_status('/src/main.js', 404)

    def test_symlink_cannot_serve_outside_distribution(self):
        with tempfile.TemporaryDirectory() as outside:
            secret = Path(outside) / 'secret.txt'
            secret.write_text('outside')
            try:
                (self.root / 'leak.txt').symlink_to(secret)
            except OSError:
                self.skipTest('OS does not permit symlinks for this account')
            self.assert_status('/leak.txt', 403)
