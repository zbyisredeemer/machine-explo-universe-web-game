import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const inputRoots = [
  'src',
  'public',
  'scripts',
  'tests',
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.js',
  'eslint.config.js',
  '.npmrc',
  '.prettierrc.json',
  '.prettierignore',
  '启动游戏.command',
  'start-game.sh',
  'start-game.cmd',
];
export function fingerprint(roots, root = process.cwd()) {
  const files = [];
  function walk(path) {
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (name === '__pycache__') continue;
        walk(join(path, name));
      }
    } else if (!path.endsWith('.pyc')) files.push(path);
  }
  for (const path of roots) walk(join(root, path));
  return Object.fromEntries(
    files
      .sort()
      .map((path) => [
        relative(root, path).split('\\').join('/'),
        createHash('sha256').update(readFileSync(path)).digest('hex'),
      ]),
  );
}
export function sameFingerprint(a, b) {
  const keys = Object.keys(a).sort();
  return (
    JSON.stringify(keys) === JSON.stringify(Object.keys(b).sort()) &&
    keys.every((key) => a[key] === b[key])
  );
}
