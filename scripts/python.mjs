import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function findPython() {
  const candidates = process.env.PYTHON
    ? [[process.env.PYTHON, []]]
    : process.platform === 'win32'
      ? [
          ['py', ['-3']],
          ['python3', []],
          ['python', []],
        ]
      : [
          ['python3', []],
          ['python', []],
        ];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(
      command,
      [...prefix, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'],
      { stdio: 'ignore' },
    );
    if (result.status === 0) return { command, prefix };
  }
  throw new Error('Python 3.10+ is required. Install Python or set PYTHON to its executable path.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { command, prefix } = findPython();
    const result = spawnSync(command, [...prefix, ...process.argv.slice(2)], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
