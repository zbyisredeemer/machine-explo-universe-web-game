#!/usr/bin/env python3
"""Fail closed on stale verification; create checksummed runtime/source archives."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
INPUTS = ['src', 'public', 'scripts', 'tests', 'package.json', 'package-lock.json', 'index.html', 'vite.config.js', 'eslint.config.js', '.npmrc', '.prettierrc.json', '.prettierignore', '启动游戏.command', 'start-game.sh', 'start-game.cmd']
SUITES = ['playthrough', 'branches', 'directed', 'polish', 'robot', 'inspection-robustness', 'motion-matrix', 'enemies', 'combat', 'guidance', 'theme', 'appearance', 'production', 'reliability', 'journey']
DOCS = ['README.md', 'README.en.md', 'LICENSE', 'THIRD_PARTY_LICENSES.txt', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'docs/ARCHITECTURE.md', 'docs/RELEASING.md', 'docs/PRIVACY.md', 'docs/QUALITY.md', 'docs/verification-1.5.md', 'docs/verification-1.6.md']
LAUNCHERS = ['启动游戏.command', 'start-game.sh', 'start-game.cmd']


def file_list(paths, root=ROOT):
    result = []
    for name in paths:
        path = root / name
        candidates = path.rglob('*') if path.is_dir() else [path]
        for item in candidates:
            if item.is_symlink():
                raise ValueError(f'Symlinks cannot enter releases: {item.relative_to(root)}')
            if item.is_file() and '__pycache__' not in item.parts and item.suffix != '.pyc':
                result.append(item)
    return sorted(set(result))


def fingerprint(paths, root=ROOT):
    return {p.relative_to(root).as_posix(): sha256(p.read_bytes()).hexdigest() for p in file_list(paths, root)}


def verify(root=ROOT):
    evidence = json.loads((root / 'test-results/verification.json').read_text())
    version = json.loads((root / 'package.json').read_text())['version']
    if evidence.get('passed') is not True or evidence.get('version') != version or evidence.get('suites') != SUITES:
        raise ValueError('Incomplete verification or mismatched release version')
    for field, paths in [('inputs', INPUTS), ('build', ['dist'])]:
        if evidence.get(field) != fingerprint(paths, root):
            raise ValueError(f'{field} changed after verification; run npm run verify again')
    expected_reports = [f'test-results/{"inspection" if suite == "inspection-robustness" else suite}.json' for suite in SUITES]
    if evidence.get('reports') != fingerprint(expected_reports, root):
        raise ValueError('Test reports changed after verification')
    for name in expected_reports:
        if json.loads((root / name).read_text()).get('passed') is not True:
            raise ValueError(f'Failed test report: {name}')
    return version, evidence


def archive(path, files, manifest, prefix):
    stamp = datetime.now(timezone.utc).timetuple()[:6]
    with ZipFile(path, 'w', ZIP_DEFLATED) as bundle:
        for name in files:
            info = ZipInfo(prefix + name, stamp)
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            mode = 0o755 if name.endswith(('.command', '.sh')) else 0o644
            info.external_attr = (0o100000 | mode) << 16
            bundle.writestr(info, (ROOT / name).read_bytes())
        bundle.writestr(prefix + 'release.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    with ZipFile(path) as bundle:
        if bundle.testzip() is not None:
            raise ValueError('ZIP CRC verification failed')
        for name, digest in files.items():
            if sha256(bundle.read(prefix + name)).hexdigest() != digest:
                raise ValueError(f'ZIP hash mismatch: {name}')


def main():
    try:
        version, evidence = verify()
        if not re.fullmatch(r'[0-9A-Za-z.+-]+', version):
            raise ValueError('Invalid version')
        output = ROOT / 'artifacts'
        output.mkdir(exist_ok=True)
        runtime = fingerprint(['dist', 'scripts/serve.py', *LAUNCHERS, *DOCS])
        source = fingerprint([*INPUTS, 'docs', '.github', '.editorconfig', '.gitignore', '.nvmrc', '.env.example', *LAUNCHERS, *DOCS])
        for name, files in [('offline', runtime), ('source', source)]:
            manifest = {'version': version, 'builtAt': evidence['completedAt'], 'kind': name, 'files': files, 'verification': evidence}
            archive(output / f'alien-body-{version}-{name}.zip', files, manifest, 'alien-body/')
        paths = sorted(output.glob(f'alien-body-{version}-*.zip'))
        (output / 'SHA256SUMS.txt').write_text(''.join(f'{sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in paths))
        (output / 'verification.json').write_text(json.dumps(evidence, indent=2) + '\n')
        for path in paths:
            print(f'Verified {path.name}: {path.stat().st_size:,} bytes')
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(f'Release refused: {error}') from error


if __name__ == '__main__':
    main()
