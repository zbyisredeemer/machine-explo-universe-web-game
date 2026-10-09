#!/usr/bin/env python3
"""Loopback-only offline launcher. Not a public production web server."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import argparse
import json
import threading
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def valid_request(self):
        expected = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if self.headers.get('Host') not in expected:
            self.send_error(403, 'Use the loopback address printed by the launcher')
            return False
        path = unquote(urlsplit(self.path).path)
        root = Path(self.directory).resolve()
        resolved = Path(self.translate_path(self.path)).resolve()
        if any(part.startswith('.') for part in path.split('/') if part) or not resolved.is_relative_to(root):
            self.send_error(403)
            return False
        if resolved.is_dir() and not (resolved / 'index.html').is_file():
            self.send_error(404)
            return False
        return True

    def do_GET(self):
        if not self.valid_request():
            return
        if self.path == '/_alien-body':
            self.send_metadata()
        else:
            super().do_GET()

    def do_HEAD(self):
        if not self.valid_request():
            return
        if self.path == '/_alien-body':
            self.send_metadata(head=True)
        else:
            super().do_HEAD()

    def send_metadata(self, head=False):
        payload = (Path(self.directory) / 'build-info.json').read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        if not head:
            self.wfile.write(payload)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
        super().end_headers()

    def log_message(self, *_):
        pass


def main():
    parser = argparse.ArgumentParser(description='异星之躯 · 本地启动器')
    parser.add_argument('--port', type=int, default=4174)
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--strict-port', action='store_true', help='Fail rather than reuse or change the port')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    if not (ROOT / 'dist' / 'index.html').is_file() or not (ROOT / 'dist' / 'build-info.json').is_file():
        raise SystemExit('未找到完整游戏构建。开发环境请先执行 npm ci 和 npm run build。')
    server = None
    metadata = json.loads((ROOT / 'dist' / 'build-info.json').read_text())
    for port in range(args.port, min(args.port + (1 if args.strict_port else 10), 65536)):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(ROOT / 'dist')))
            break
        except OSError:
            if args.strict_port:
                raise SystemExit(f'端口 {port} 已被占用。') from None
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/_alien-body', timeout=1) as response:
                    running = json.load(response)
                    if running == metadata:
                        url = f'http://127.0.0.1:{port}'
                        if not args.no_open:
                            webbrowser.open(url)
                        print(f'游戏已经运行：{url}')
                        return
            except Exception:
                continue
    if server is None:
        raise SystemExit('没有可用本地端口。请使用 --port 指定另一个端口。')
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'异星之躯 {metadata["version"]} 已启动：{url}', flush=True)
    if server.server_port != args.port:
        print('注意：地址端口已改变，旧地址的存档不会自动迁移。请回到旧地址导出后在此导入。', flush=True)
    print('请保持此窗口开启。按 Control+C 退出。存档按浏览器和地址分别保存。', flush=True)
    if not args.no_open:
        threading.Timer(.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
