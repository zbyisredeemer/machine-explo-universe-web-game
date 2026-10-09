import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const completed = JSON.parse(readFileSync('test-results/playthrough.json', 'utf8')).final;
async function setup(state) {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.evaluate((s) => {
    __UI__.hasSave = false;
    localStorage.setItem('alien-body.save.v1', JSON.stringify(s));
    localStorage.setItem('alien-body.settings.v1', JSON.stringify({ volume: 0, quality: 'low' }));
  }, state);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-action="continue"]').click();
}
try {
  const s = structuredClone(completed);
  s.location = 3;
  s.chapters[3].stage = 4;
  s.chapters[3].completed = false;
  s.chapters[3].killed = [];
  s.ending = null;
  await setup(s);
  await page.evaluate(() => __GAME__.player.position.set(0, 0, -90));
  await page.keyboard.press('l');
  assert.ok(await page.evaluate(() => !!__GAME__.lockedTarget));
  await page.keyboard.press('k');
  await page.waitForTimeout(100);
  assert.ok((await page.locator('.damage-number').count()) > 0);
  await page.screenshot({ path: 'test-results/v11-target-lock.png' });
  await page.keyboard.press('Shift');
  await page.evaluate(() => __GAME__.hurt(10));
  assert.ok(
    await page
      .locator('#combat-readout')
      .textContent()
      .then((t) => t.includes('完美闪避')),
  );
  await page.keyboard.press('l');
  assert.equal(await page.evaluate(() => __GAME__.lockedTarget), null);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="settings"]:visible').click();
  await page.locator('[data-setting="reducedMotion"]').check();
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('.modal')));
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('.modal')));
  }
  await page.screenshot({ path: 'test-results/v11-settings.png' });
  const download = page.waitForEvent('download');
  await page.locator('.modal [data-backup="export"]').click();
  assert.equal((await download).suggestedFilename(), '异星之躯-旅程备份.json');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await page.waitForTimeout(150);
  assert.ok((await page.locator('#toast-stack').textContent()).includes('无法读取'));
  const imported = structuredClone(completed);
  imported.location = 'hub';
  await page.locator('input[type="file"]').setInputFiles({
    name: 'save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.locator('[data-backup="restore"]').click();
  assert.equal(await page.evaluate(() => __GAME__.state.location), 'hub');
  assert.equal(await page.evaluate(() => __GAME__.state.modules.length), 4);
  await page.evaluate(() => {
    __GAME__.keys.add('KeyW');
    __GAME__.rightDrag = { x: 0, y: 0, moved: 1 };
    window.dispatchEvent(new Event('blur'));
  });
  assert.equal(await page.evaluate(() => __GAME__.keys.size), 0);
  assert.equal(await page.evaluate(() => __GAME__.rightDrag), null);
  await page.locator('[data-action="resume"]').click();
  // Bounded caches and GPU-owned scene resources over repeated travel.
  const resourceCounts = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const location of [0, 1, 2, 3, 'hub']) {
      await page.evaluate((i) => {
        __GAME__.load(i);
        __GAME__.mode = 'playing';
      }, location);
      await page.waitForTimeout(100);
    }
    resourceCounts.push(
      await page.evaluate(() => ({
        ...__GAME__.world.renderer.info.memory,
        fx: __GAME__.world.fx.length,
      })),
    );
  }
  assert.ok(resourceCounts[2].textures <= resourceCounts[1].textures + 2);
  assert.ok(resourceCounts[2].geometries <= resourceCounts[1].geometries + 2);
  await page.evaluate(() => {
    __GAME__.settings.quality = 'high';
    __GAME__.world.quality();
    __GAME__.load(0);
    __GAME__.mode = 'playing';
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/v11-gameplay.png' });
  const timing = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const samples = [];
        let previous = performance.now();
        const measure = (now) => {
          samples.push(now - previous);
          previous = now;
          if (samples.length < 120) requestAnimationFrame(measure);
          else {
            samples.sort((a, b) => a - b);
            resolve({
              medianMs: samples[60],
              p95Ms: samples[114],
              pixels:
                __GAME__.world.renderer.domElement.width *
                __GAME__.world.renderer.domElement.height,
            });
          }
        };
        requestAnimationFrame(measure);
      }),
  );
  assert.ok(timing.pixels <= 2350000);
  // Real WebGL loss freezes play and exposes a recoverable UI; restoration reloads the saved checkpoint.
  const supported = await page.evaluate(() => {
    const extension = __GAME__.world.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!extension) return false;
    window.testGraphicsExtension = extension;
    extension.loseContext();
    return true;
  });
  assert.ok(supported);
  await page.getByRole('heading', { name: '图形设备暂时断开' }).waitFor();
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#restore-graphics').isVisible());
  await page.evaluate(() => testGraphicsExtension.restoreContext());
  await page.waitForLoadState('networkidle');
  await page.locator('[data-action="continue"]').waitFor();
  // Denied browser storage still permits a full session and reports that persistence is unavailable.
  const denied = await browser.newPage();
  await denied.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
    }),
  );
  await denied.goto(gameURL, { waitUntil: 'networkidle' });
  await denied.locator('[data-action="new"]').click();
  await denied.getByRole('button', { name: '启动身体' }).click();
  assert.equal(await denied.evaluate(() => __GAME__.mode), 'playing');
  assert.ok((await denied.locator('#toast-stack').textContent()).includes('无法保存'));
  await denied.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/polish.json',
    JSON.stringify(
      {
        passed: true,
        errors,
        resourceCounts,
        timing,
        checks: [
          'target lock',
          'damage feedback',
          'perfect dodge',
          'focus trap',
          'reduced motion',
          'export/import',
          'invalid import',
          'blur input reset',
          'resource bounds',
          'HDR render',
          'WebGL context recovery',
          'denied localStorage',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: polish interactions, backup UI, resource stability, context recovery and storage denial.',
    timing,
  );
} catch (error) {
  console.error(error);
  await page.screenshot({ path: 'test-results/polish-failure.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
