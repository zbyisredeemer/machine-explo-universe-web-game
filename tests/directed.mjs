import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(e.message));
const save = JSON.parse(readFileSync('test-results/playthrough.json', 'utf8')).final;
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.evaluate((s) => {
    localStorage.setItem('alien-body.save.v1', JSON.stringify(s));
    localStorage.setItem(
      'alien-body.settings.v1',
      JSON.stringify({ volume: 0, quality: 'high', difficulty: 'story' }),
    );
  }, save);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-action="continue"]').click();
  for (let chapter = 0; chapter < 4; chapter++) {
    // Fixture only positions a prior traveller at each story and encounter.
    // Interactions, module use and combat use the real keyboard path.
    const coords = [
      [21, -6],
      [-23, -34],
      [23, -20],
      [-23, -28],
    ][chapter];
    await page.evaluate(
      ({ chapter, coords }) => {
        const g = __GAME__;
        g.state.chapters[chapter].stage = 4;
        g.state.chapters[chapter].killed = g.state.chapters[chapter].killed.filter(
          (x) => x !== 'boss',
        );
        g.state.chapters[chapter].helped = false;
        g.load(chapter);
        g.mode = 'playing';
        g.player.position.set(coords[0], 0, coords[1]);
        g.state.activeModule = ['anchor', 'bloom', 'time', 'phase'][chapter];
      },
      { chapter, coords },
    );
    // Let the follow camera settle after fixture teleportation; shader warmup
    // can leave it at the checkpoint for more than a fixed 250 ms.
    await page.waitForFunction(
      () => __GAME__.cameraPosition.distanceTo(__GAME__.player.position) < 20,
    );
    await page.keyboard.press('v');
    await page.locator('.signal-label').first().waitFor({ state: 'visible' });
    assert.ok((await page.locator('.signal-label').count()) > 0);
    await page.screenshot({ path: `test-results/v12-chapter-${chapter + 1}-scan.png` });
    await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => __GAME__.mode), 'dialog');
    while (await page.locator('#dialog').isVisible())
      await page.locator('[data-action="dialog-next"]').click();
    assert.equal(await page.evaluate(() => __GAME__.cs.helped), true);
    await page.keyboard.press('e');
    assert.equal(await page.evaluate(() => __GAME__.mode), 'playing');
    const salvage = await page.evaluate(() => __GAME__.state.salvage);
    await page.evaluate(() => {
      __GAME__.load(__GAME__.state.location);
      __GAME__.mode = 'playing';
      __GAME__.player.position.set(0, 0, -84);
    });
    assert.equal(await page.evaluate(() => __GAME__.cs.helped), true);
    assert.equal(await page.evaluate(() => __GAME__.state.salvage), salvage);
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => __GAME__.encounters.hazards.length > 0,
      {},
      { timeout: 15000 },
    );
    await page.screenshot({ path: `test-results/v12-chapter-${chapter + 1}-attack.png` });
    const hazard = await page.evaluate(() => __GAME__.encounters.hazards.map((h) => h.kind));
    assert.ok(hazard.includes(chapter === 1 ? 'disk' : chapter === 2 ? 'ring' : 'line'));
    await page.keyboard.press('l');
    await page.keyboard.down('k');
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const state = await page.evaluate(() => ({
        stage: __GAME__.cs.stage,
        hp: __GAME__.hp,
        mode: __GAME__.mode,
      }));
      if (state.stage === 5) break;
      assert.notEqual(state.mode, 'dead');
      if (state.hp < 70) await page.keyboard.press('g');
      await page.keyboard.press('f');
      await page.keyboard.press('Space');
      await page.keyboard.press('Shift');
      await page.keyboard.press('j');
      await page.waitForTimeout(450);
    }
    await page.keyboard.up('k');
    assert.equal(await page.evaluate(() => __GAME__.cs.stage), 5);
    results.push({
      chapter,
      pattern: hazard,
      sideSaved: true,
      bossDefeated: true,
      ...(await page.evaluate(() => ({
        architecture: __GAME__.world.environmentStats,
        hp: __GAME__.hp,
      }))),
    });
    await page.evaluate(() => {
      __GAME__.player.position.set(0, 0, 25);
      __GAME__.yaw = 0;
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `test-results/v12-chapter-${chapter + 1}-environment.png` });
  }
  await page.evaluate(() => __GAME__.toHub());
  assert.equal(await page.evaluate(() => __GAME__.heals), 4);
  assert.ok(await page.evaluate(() => __GAME__.world.markers.some((m) => m.id === 'messenger')));
  await page.evaluate(() => {
    __GAME__.hp = 50;
    __GAME__.state.activeModule = 'bloom';
    __GAME__.state.location = 0;
  });
  await page.keyboard.press('f');
  assert.ok((await page.evaluate(() => __GAME__.hp)) >= 92);
  assert.ok((await page.evaluate(() => __GAME__.cooldowns.ability)) <= 5);
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/directed.json',
    JSON.stringify({ passed: true, errors, results }, null, 2),
  );
  console.log(
    'PASS: four distinct encounters, scans, saved side stories, repeat prevention, hub consequence and upgrades',
    results,
  );
} catch (error) {
  console.error(error);
  console.error(errors);
  await page.screenshot({ path: 'test-results/directed-failure.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
