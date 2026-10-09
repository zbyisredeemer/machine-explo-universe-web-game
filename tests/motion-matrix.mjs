import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
  errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(e.message));
async function hold(keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  await page.locator('#skip-arrival').click();
  for (const chassis of ['scout', 'guardian', 'drifter']) {
    await page.evaluate((chassis) => {
      const g = __GAME__;
      g.state.equipment.chassis = chassis;
      g.load('hub');
      g.mode = 'playing';
      g.player.position.set(0, 0, 9);
      g.world.npc.visible = false;
      window.poseSamples = [];
      window.samplePose = true;
      const tick = () => {
        if (!samplePose) return;
        const r = g.player.userData.rig;
        for (const [i, f] of r.footState.entries()) {
          const foot = r.feet[i].getWorldPosition(g.player.position.clone());
          poseSamples.push({
            planted: f.planted,
            air: g.jumps > 0,
            dash: g.dashTime > 0,
            speed: g.velocity.length(),
            y: foot.y,
            clamped: f.clamped,
            error: foot.distanceTo(f.anchor),
            finite: foot.toArray().every(Number.isFinite),
          });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, chassis);
    await hold(['w', 'd'], 550);
    await hold(['a'], 600);
    await hold(['s', 'a'], 400);
    await hold(['w'], 300);
    await page.keyboard.down('d');
    await page.keyboard.press('Shift');
    await page.waitForTimeout(350);
    await page.keyboard.up('d');
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await hold(['w'], 350);
    await page.keyboard.press('Space');
    await hold(['s'], 350);
    await page.waitForTimeout(1400);
    await page.keyboard.press('i');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await hold(['a'], 250);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const g = __GAME__;
      g.state.chapters[0].stage = 4;
      g.load(0);
      g.mode = 'playing';
      g.player.position.set(0, 0, -88);
      for (const e of g.actors) e.stunned = 100;
    });
    await page.keyboard.press('l');
    assert.ok(await page.evaluate(() => !!__GAME__.lockedTarget));
    await hold(['k', 'a'], 450);
    await hold(['k', 'd'], 500);
    await hold(['k', 'w', 'a'], 450);
    await hold(['j', 's'], 350);
    await page.waitForTimeout(250);
    const samples = await page.evaluate(() => {
      samplePose = false;
      return poseSamples;
    });
    const contacts = samples.filter((s) => s.planted && !s.air && !s.dash && s.speed > 1);
    const entry = {
      chassis,
      samples: samples.length,
      contacts: contacts.length,
      maxContactError: Math.max(0, ...contacts.map((s) => s.error)),
      minFootY: Math.min(...samples.map((s) => s.y)),
      invalid: samples.filter((s) => !s.finite).length,
      thrustPlanted: samples.filter((s) => s.dash && s.planted).length,
    };
    results.push(entry);
    await page.screenshot({ path: `test-results/motion-${chassis}.png` });
  }
  writeFileSync(
    'test-results/motion-matrix.json',
    JSON.stringify(
      {
        passed:
          results.every(
            (r) =>
              r.invalid === 0 &&
              r.maxContactError < 0.035 &&
              r.minFootY > 0.08 &&
              r.thrustPlanted === 0,
          ) && errors.length === 0,
        errors,
        results,
      },
      null,
      2,
    ),
  );
  console.log(results);
  assert.deepEqual(errors, []);
  for (const r of results) {
    assert.equal(r.invalid, 0);
    assert.ok(r.maxContactError < 0.035);
    assert.ok(r.minFootY > 0.08);
    assert.equal(r.thrustPlanted, 0);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
