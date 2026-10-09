import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const completed = JSON.parse(readFileSync('test-results/playthrough.json', 'utf8')).final;
async function load(state) {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.evaluate((s) => {
    __UI__.hasSave = false;
    localStorage.setItem('alien-body.save.v1', JSON.stringify(s));
    localStorage.setItem(
      'alien-body.settings.v1',
      JSON.stringify({ quality: 'low', volume: 0, difficulty: 'story' }),
    );
  }, state);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-action="continue"]').click();
}
try {
  // Valid checkpoint fixtures derived from the completed, real-input playthrough.
  const ending = structuredClone(completed);
  ending.location = 3;
  ending.chapters[3].completed = false;
  ending.ending = null;
  await load(ending);
  await page.evaluate(() => __GAME__.player.position.set(0, 0, 29));
  await page.keyboard.press('e');
  await page.locator('[data-action="ending-journey"]').click();
  assert.equal(await page.evaluate(() => __GAME__.state.ending), 'journey');
  await page.screenshot({ path: 'test-results/ending-journey.png' });
  await page.locator('[data-action="hub"]').click();
  assert.equal(await page.evaluate(() => __GAME__.state.location), 'hub');

  const combat = structuredClone(completed);
  combat.location = 3;
  combat.ending = null;
  combat.chapters[3].stage = 4;
  combat.chapters[3].completed = false;
  combat.chapters[3].killed = [];
  combat.activeModule = 'anchor';
  await load(combat);
  await page.evaluate(() => __GAME__.player.position.set(0, 0, -91));
  await page.keyboard.press('1');
  await page.keyboard.press('f');
  assert.ok((await page.evaluate(() => __GAME__.actors.find((e) => e.boss).exposed)) > 0);
  assert.ok((await page.evaluate(() => __GAME__.actors.find((e) => e.boss).stunned)) > 0);
  await page.keyboard.press('2');
  await page.waitForFunction(() => __GAME__.cooldowns.ability <= 0, {}, { timeout: 15000 });
  await page.evaluate(() => {
    __GAME__.hp = 40;
    __GAME__.invincible = 1;
  });
  await page.keyboard.press('f');
  assert.ok((await page.evaluate(() => __GAME__.hp)) >= 70);
  await page.keyboard.press('3');
  await page.waitForFunction(() => __GAME__.cooldowns.ability <= 0, {}, { timeout: 15000 });
  await page.keyboard.press('f');
  assert.ok((await page.evaluate(() => __GAME__.timeSlow)) > 5);
  await page.screenshot({ path: 'test-results/time-module.png' });
  await page.keyboard.press('4');
  await page.waitForFunction(() => __GAME__.cooldowns.ability <= 0, {}, { timeout: 15000 });
  const before = await page.evaluate(() => {
    __GAME__.player.position.set(0, 0, -85);
    __GAME__.player.rotation.y = 0;
    return __GAME__.player.position.z;
  });
  await page.keyboard.press('f');
  assert.ok(before - (await page.evaluate(() => __GAME__.player.position.z)) > 10);

  const discovery = structuredClone(completed);
  discovery.location = 0;
  discovery.chapters[0].stage = 5;
  discovery.chapters[0].completed = false;
  await load(discovery);
  await page.evaluate(() => __GAME__.player.position.set(0, 0, -138));
  await page.keyboard.press('e');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/discovery-cinematic.png' });
  assert.ok(await page.evaluate(() => __GAME__.world.revealObjects.every((o) => o.visible)));
  while (await page.locator('#dialog').isVisible())
    await page.locator('[data-action="dialog-next"]').click();
  await page.evaluate(() => {
    __GAME__.state.companion = false;
    __GAME__.player.position.set(0, 0, 29);
  });
  await page.keyboard.press('e');
  while (await page.locator('#dialog').isVisible())
    await page.locator('[data-action="dialog-next"]').click();
  await page.locator('[data-action="invite-no"]').click();
  assert.equal(await page.evaluate(() => __GAME__.state.companion), false);
  assert.equal(await page.evaluate(() => __GAME__.world.npc.visible), false);
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/branches.json',
    JSON.stringify(
      {
        passed: true,
        errors,
        checks: [
          'alternate ending',
          'anchor exposure/stun',
          'bloom repair',
          'time dilation',
          'phase displacement',
          'discovery render',
          'decline companion',
        ],
      },
      null,
      2,
    ),
  );
  console.log('PASS: alternate ending, all four module mechanics, discovery and companion choice.');
} catch (e) {
  console.error(e);
  await page.screenshot({ path: 'test-results/branches-failure.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
