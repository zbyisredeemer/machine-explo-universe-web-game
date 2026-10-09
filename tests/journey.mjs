import { launchBrowser, gameURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.locator('[data-action="new"]').click();
  assert.equal(await page.locator('.welcome-step').count(), 3);
  assert.equal(await page.locator('.full-controls').getAttribute('open'), null);
  await page.screenshot({ path: 'test-results/journey-welcome.png' });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.getByRole('button', { name: '启动身体' }).click();
  if (await page.locator('#skip-arrival').isVisible()) await page.locator('#skip-arrival').click();
  await page.waitForTimeout(350);
  const tutorialBounds = await page.locator('#field-training').boundingBox();
  const moduleBounds = await page.locator('#modules').boundingBox();
  assert.ok(tutorialBounds.y + tutorialBounds.height < moduleBounds.y);
  await page.screenshot({ path: 'test-results/journey-training.png' });
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift');
  await page.keyboard.press('k');
  await page.keyboard.press('v');
  assert.equal(await page.evaluate(() => __GAME__.state.training.length), 5);
  await page.waitForFunction(() =>
    document.getElementById('field-training').classList.contains('hidden'),
  );
  checks.push('three-step compact welcome and five actions recognised through real keyboard input');
  await page.evaluate(() => {
    __GAME__.player.position.set(18, 0, 19);
    __GAME__.velocityY = 0;
  });
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '继续对话' }).click();
  assert.equal(await page.evaluate(() => __GAME__.state.chapters[0].caches.length), 1);
  assert.match(await page.locator('#encounter-result').textContent(), /18/);
  const salvage = await page.evaluate(() => __GAME__.state.salvage);
  await page.keyboard.press('e');
  assert.equal(await page.evaluate(() => __GAME__.state.salvage), salvage);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-action="continue"]').click();
  assert.equal(await page.evaluate(() => __GAME__.state.chapters[0].caches.length), 1);
  assert.equal(
    await page.evaluate(
      () => __GAME__.world.markers.find((m) => m.id === 'cache-arrival').group.visible,
    ),
    false,
  );
  checks.push('cache collection, reward, duplicate prevention and reload persistence');
  await page.evaluate(() => {
    const g = __GAME__;
    for (let stage = 1; stage <= 3; stage++) g.progress(stage);
    g.player.position.set(-30, 0, -34);
  });
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '继续对话' }).click();
  await page.evaluate(() => {
    __GAME__.progress(4);
    __GAME__.progress(5);
  });
  // Stage changes start the bridge animation; a real player cannot cross until it settles.
  await page.waitForFunction(() => __GAME__.world.bridge.position.y <= 0.4);
  await page.evaluate(() => __GAME__.player.position.set(24, 0, -91));
  await page.waitForFunction(() => __GAME__.nearby?.id === 'cache-observatory');
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '继续对话' }).click();
  assert.deepEqual(await page.evaluate(() => __GAME__.state.chapters[0].caches), [
    'arrival',
    'workshop',
    'observatory',
  ]);
  assert.equal(await page.evaluate(() => __GAME__.state.salvage), 122);
  await page.keyboard.press('Tab');
  await page.locator('.modal button').first().focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'starmap');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.cache-records').first().locator('h4').count(), 3);
  checks.push('staged discoveries, once-only set bonus and journal reading');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="settings"]:visible').click();
  for (const setting of ['musicVolume', 'effectsVolume'])
    await page.locator(`[data-setting="${setting}"]`).evaluate((input) => {
      input.value = '0';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  assert.equal(await page.evaluate(() => __GAME__.settings.musicVolume), 0);
  assert.equal(await page.evaluate(() => __GAME__.settings.effectsVolume), 0);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/journey-settings.png' });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => __GAME__.settings.musicVolume), 0);
  assert.equal(await page.evaluate(() => __GAME__.settings.effectsVolume), 0);
  await page.locator('[data-action="continue"]').click();
  await page.evaluate(() => {
    __GAME__.load(0);
    __GAME__.mode = 'playing';
    __GAME__.settings.reducedMotion = true;
  });
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => __GAME__.world.atmosphere.mechanisms[0].moving.rotation.x),
    0,
  );
  await page.evaluate(() => {
    __GAME__.settings.quality = 'low';
    __GAME__.world.quality();
  });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => __GAME__.world.atmosphere.motes.visible), false);
  checks.push('separate persisted sound controls and reduced-motion/low-quality atmosphere');
  await page.setViewportSize({ width: 1440, height: 900 });
  const memory = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let chapter = 0; chapter < 4; chapter++) {
      await page.evaluate((index) => {
        __GAME__.load(index);
        __GAME__.mode = 'playing';
        __GAME__.settings.reducedMotion = false;
        __GAME__.settings.quality = 'high';
        __GAME__.world.quality();
      }, chapter);
      await page.waitForTimeout(150);
      if (cycle === 0)
        await page.screenshot({ path: `test-results/journey-chapter-${chapter}.png` });
    }
    memory.push(await page.evaluate(() => ({ ...__GAME__.world.renderer.info.memory })));
  }
  assert.ok(memory[2].geometries <= memory[1].geometries + 2);
  assert.ok(memory[2].textures <= memory[1].textures + 2);
  checks.push('four chapter accents and bounded resources over repeated travel');
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/journey.json',
    JSON.stringify({ passed: true, checks, memory, errors }, null, 2),
  );
  console.log('PASS', checks);
} catch (error) {
  await page.screenshot({ path: 'test-results/journey-failure.png' });
  throw error;
} finally {
  await browser.close();
}
