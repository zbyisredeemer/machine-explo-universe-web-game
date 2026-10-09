import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  resources = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('i');
    await page.waitForTimeout(120);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    resources.push(await page.evaluate(() => ({ ...__GAME__.world.renderer.info.memory })));
  }
  assert.ok(resources.at(-1).geometries <= resources[2].geometries + 1);
  assert.ok(resources.at(-1).textures <= resources[2].textures + 1);
  await page.keyboard.press('i');
  await page.setViewportSize({ width: 960, height: 640 });
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('#robot-inspection')));
  }
  await page.screenshot({ path: 'test-results/robot-compact.png' });
  await page.evaluate(() => {
    window.robotLoss = __GAME__.world.renderer.getContext().getExtension('WEBGL_lose_context');
    robotLoss.loseContext();
  });
  await page.getByRole('heading', { name: '图形设备暂时断开' }).waitFor();
  assert.ok(await page.locator('#restore-graphics').isVisible());
  assert.equal(await page.evaluate(() => __INSPECTION__.active), false);
  await page.evaluate(() => robotLoss.restoreContext());
  await page.waitForLoadState('networkidle');
  await page.locator('[data-action="new"]').waitFor();
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/inspection.json',
    JSON.stringify(
      {
        passed: true,
        errors,
        resources,
        checks: [
          '8 open-close cycles',
          'compact layout',
          'keyboard focus loop',
          'context loss during inspection',
          'recovery',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: inspection resource bounds, keyboard access and context recovery',
    resources.at(-1),
  );
} catch (error) {
  console.error(error);
  await page.screenshot({ path: 'test-results/inspection-failure.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
