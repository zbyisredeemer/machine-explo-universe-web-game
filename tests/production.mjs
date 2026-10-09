import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
  page = await context.newPage();
const errors = [],
  external = [];
page.on('pageerror', (e) => errors.push(e.message));
await context.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1') route.continue();
  else {
    external.push(u.href);
    route.abort();
  }
});
try {
  await page.goto(productionURL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => typeof window.__GAME__), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.__UI__), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.__INSPECTION__), 'undefined');
  await page.locator('[data-inspect]:visible').click();
  await page.waitForTimeout(300);
  assert.ok(await page.locator('#robot-inspection').isVisible());
  assert.equal(await page.locator('[data-skin]:enabled').count(), 6);
  await page.locator('[data-skin="cobalt"]').click();
  assert.equal(await page.locator('[data-skin="cobalt"]').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/production-title.png' });
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  await page.waitForTimeout(600);
  const before = await page.locator('#coordinates').textContent();
  await page.keyboard.down('w');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w');
  assert.notEqual(await page.locator('#coordinates').textContent(), before);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="settings"]:visible').click();
  await page.selectOption('[data-setting="quality"]', 'low');
  await page.locator('[data-action="close"]').last().click();
  await page.screenshot({ path: 'test-results/production-gameplay.png' });
  await page.setViewportSize({ width: 3000, height: 1700 });
  await page.waitForTimeout(150);
  assert.ok(
    await page.evaluate(() => {
      const canvas = document.getElementById('world');
      return canvas.width * canvas.height <= 2350000;
    }),
  );
  await page.setViewportSize({ width: 960, height: 640 });
  await page.keyboard.press('Tab');
  assert.ok(await page.getByRole('heading', { name: '我记得的宇宙' }).isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'test-results/production-compact.png' });
  await page.locator('[data-action="close"]').click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await page.locator('[data-action="continue"]').isVisible());
  await page.locator('[data-action="continue"]').click();
  assert.ok(await page.locator('#chapter-name').isVisible());
  await page.keyboard.press('i');
  assert.equal(await page.locator('[data-skin="cobalt"]').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  writeFileSync(
    'test-results/production.json',
    JSON.stringify(
      {
        passed: true,
        errors,
        externalRequests: external,
        checks: [
          'production WebGL startup',
          'live skin choice and persisted colour',
          'QA tools absent',
          'keyboard movement',
          'settings',
          'compact viewport',
          'save reload',
          'no external resources',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: production build, local-only resources, no QA globals, real keyboard input, settings and persisted save.',
  );
} catch (error) {
  console.error(error);
  await page.screenshot({ path: 'test-results/production-failure.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
