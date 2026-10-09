import { launchBrowser, productionURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve, extname } from 'node:path';
import { newState, SAVE_KEY, BACKUP_KEY } from '../src/state.js';

const browser = await launchBrowser(),
  errors = [],
  checks = [];
const context = await browser.newContext({
  viewport: { width: 960, height: 640 },
  acceptDownloads: true,
});
context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
let subpathServer;
try {
  const page = await context.newPage();
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    window.storageDenied = true;
    Storage.prototype.setItem = function (...args) {
      if (window.storageDenied) throw new DOMException('Full', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.goto(productionURL, { waitUntil: 'networkidle' });
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  await page.keyboard.press('w'); // Finish the arrival shot before opening pause.
  await page.keyboard.press('Escape');
  assert.match(await page.locator('.modal-intro').textContent(), /尚未保存/);
  assert.ok(await page.locator('#storage-warning').isVisible());
  assert.equal(
    await page.locator('#save-indicator').evaluate((el) => el.classList.contains('show')),
    false,
  );
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#storage-warning [data-backup="export"]').click();
  const download = await downloadPromise;
  const exported = JSON.parse(readFileSync(await download.path()));
  assert.equal(exported.version, 1);
  assert.equal(exported.chapters.length, 4);
  checks.push('quota failure stays visible and backup export remains available');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/reliability-storage.png' });
  await page.locator('[data-action="settings"]:visible').click();
  await page.locator('[data-action="about"]').click();
  const diagnosticPromise = page.waitForEvent('download');
  await page.locator('[data-backup="diagnostics"]').click();
  const diagnostic = JSON.parse(readFileSync(await (await diagnosticPromise).path()));
  assert.equal(diagnostic.storageAvailable, false);
  assert.deepEqual(
    Object.keys(diagnostic).sort(),
    [
      'version',
      'mode',
      'quality',
      'storageAvailable',
      'lastSaveSucceeded',
      'viewport',
      'webgl',
    ].sort(),
  );
  checks.push('version and diagnostics are reachable without private fields');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/reliability-support.png' });
  await page.evaluate(() => {
    window.storageDenied = false;
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() =>
    document.getElementById('storage-warning').classList.contains('hidden'),
  );
  checks.push('successful retry clears persistent warning');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/reliability-pause.png' });

  const recovered = await browser.newPage();
  await recovered.addInitScript(
    ({ save, backup, state }) => {
      localStorage.setItem(save, '{broken');
      localStorage.setItem(backup, JSON.stringify(state));
    },
    { save: SAVE_KEY, backup: BACKUP_KEY, state: newState() },
  );
  await recovered.goto(productionURL, { waitUntil: 'networkidle' });
  assert.match(await recovered.locator('#toast-stack').textContent(), /已恢复自动备份/);
  assert.ok(await recovered.locator('[data-action="continue"]').isVisible());
  checks.push('backup recovery is explicit on production startup');
  await recovered.close();

  const files = resolve('dist');
  subpathServer = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    const file = resolve(files, pathname.replace(/^\/games\/alien\//, '') || 'index.html');
    if (!pathname.startsWith('/games/alien/') || !file.startsWith(files + '/')) {
      response.writeHead(404).end();
      return;
    }
    try {
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
      };
      response.setHeader('Content-Type', types[extname(file)] || 'text/plain');
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  subpathServer.listen(0, '127.0.0.1');
  await once(subpathServer, 'listening');
  const nested = await context.newPage();
  const failed = [];
  nested.on('requestfailed', (request) => failed.push(request.url()));
  await nested.goto(`http://127.0.0.1:${subpathServer.address().port}/games/alien/`, {
    waitUntil: 'networkidle',
  });
  assert.ok(await nested.locator('[data-action="new"]').isVisible());
  assert.deepEqual(failed, []);
  checks.push('production assets and startup work under a repository subpath');
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/reliability.json',
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log('PASS', checks);
} finally {
  await browser.close();
  if (subpathServer) await new Promise((resolve) => subpathServer.close(resolve));
}
