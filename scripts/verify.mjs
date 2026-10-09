import { findPython } from './python.mjs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { inputRoots, fingerprint, sameFingerprint } from './release-inputs.mjs';

const npmCLI = process.env.npm_execpath;
if (!npmCLI) throw new Error('Run this tool with npm run verify');
const python = findPython();
const suites = [
  'playthrough',
  'branches',
  'directed',
  'polish',
  'robot',
  'inspection-robustness',
  'motion-matrix',
  'enemies',
  'combat',
  'guidance',
  'theme',
  'appearance',
  'production',
  'reliability',
  'journey',
];
const reportName = (name) => (name === 'inspection-robustness' ? 'inspection' : name);
const children = new Set();
function child(command, args, options = {}) {
  const proc = spawn(command, args, { stdio: 'inherit', ...options });
  children.add(proc);
  proc.once('exit', () => children.delete(proc));
  return proc;
}
async function run(command, args, timeout = 600000) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const proc = child(command, args);
  const timer = setTimeout(() => proc.kill(), timeout);
  try {
    const [code] = await once(proc, 'exit');
    if (code !== 0) throw new Error(`${command} failed (${code ?? 'terminated'})`);
  } finally {
    clearTimeout(timer);
  }
}
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitReady(proc, url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (proc.exitCode !== null) throw new Error(`Server exited before ready: ${url}`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* Server is still starting. */
    }
    await delay(200);
  }
  throw new Error(`Server did not start: ${url}`);
}
async function cleanup() {
  for (const proc of children) proc.kill();
  await Promise.all(
    [...children].map((proc) =>
      Promise.race([
        once(proc, 'exit').catch(() => {}),
        delay(3000).then(() => proc.kill('SIGKILL')),
      ]),
    ),
  );
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void cleanup().then(() => process.exit(130));
  });

mkdirSync('test-results', { recursive: true });
rmSync('test-results/verification.json', { force: true });
for (const suite of suites) rmSync(`test-results/${reportName(suite)}.json`, { force: true });
const inputs = fingerprint(inputRoots);
const startedAt = new Date().toISOString();
try {
  await run(process.execPath, [npmCLI, 'run', 'check']);
  await run(process.execPath, [
    npmCLI,
    'audit',
    '--audit-level=low',
    '--registry=https://registry.npmjs.org',
  ]);
  await run(process.execPath, [npmCLI, 'run', 'build']);
  const build = fingerprint(['dist']);
  const js = readdirSync('dist/assets').filter((file) => file.endsWith('.js'));
  const gzipBytes = js.reduce(
    (sum, file) => sum + gzipSync(readFileSync(`dist/assets/${file}`)).length,
    0,
  );
  if (gzipBytes > 350000)
    throw new Error(`JavaScript gzip budget exceeded: ${gzipBytes} > 350000 bytes`);
  console.log(`JavaScript gzip: ${gzipBytes} / 350000 bytes`);
  const devPort = await freePort();
  const productionPort = await freePort();
  process.env.GAME_TEST_URL = `http://127.0.0.1:${devPort}`;
  process.env.GAME_PRODUCTION_URL = `http://127.0.0.1:${productionPort}`;
  const dev = child(process.execPath, [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    String(devPort),
    '--strictPort',
  ]);
  const production = child(python.command, [
    ...python.prefix,
    'scripts/serve.py',
    '--port',
    String(productionPort),
    '--strict-port',
    '--no-open',
  ]);
  await waitReady(dev, process.env.GAME_TEST_URL);
  await waitReady(production, process.env.GAME_PRODUCTION_URL);
  for (const suite of suites) {
    await run(process.execPath, [`tests/${suite}.mjs`]);
    const report = JSON.parse(readFileSync(`test-results/${reportName(suite)}.json`));
    if (report.passed !== true) throw new Error(`Missing successful report: ${suite}`);
  }
  if (
    !sameFingerprint(inputs, fingerprint(inputRoots)) ||
    !sameFingerprint(build, fingerprint(['dist']))
  ) {
    throw new Error('Source or build changed during verification. Run verification again.');
  }
  const reports = fingerprint(suites.map((name) => `test-results/${reportName(name)}.json`));
  const { version } = JSON.parse(readFileSync('package.json'));
  writeFileSync(
    'test-results/verification.json',
    JSON.stringify(
      {
        passed: true,
        version,
        startedAt,
        completedAt: new Date().toISOString(),
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        browserOverride: Boolean(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE),
        gzipBytes,
        suites,
        inputs,
        build,
        reports,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `\nVerified current source, production build, all ${suites.length} browser suites and release fingerprints.`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
