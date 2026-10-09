import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
mkdirSync('test-results/robot-video', { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: 'test-results/robot-video', size: { width: 1440, height: 900 } },
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.locator('[data-inspect]:visible').click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => __GAME__.mode), 'inspect');
  await page.screenshot({ path: 'test-results/robot-v3-front.png' });
  await page.locator('[data-detail="head"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/robot-v3-head.png' });
  await page.locator('#inspection-reset').click();
  await page.locator('[data-pose="walk"]').click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'test-results/robot-v3-walk.png' });
  await page.locator('[data-pose="aim"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/robot-v3-aim.png' });
  await page.mouse.move(750, 400);
  await page.mouse.down();
  await page.mouse.move(1140, 430, { steps: 20 });
  await page.mouse.up();
  await page.screenshot({ path: 'test-results/robot-v3-back.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => __GAME__.mode), 'menu');
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  await page.locator('#skip-arrival').click();
  await page.keyboard.press('i');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('#robot-inspection')));
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => __GAME__.mode), 'playing');
  const samples = await page.evaluate(() => {
    window.robotSamples = [];
    const start = performance.now();
    const tick = () => {
      const g = __GAME__,
        r = g.player.userData.rig;
      for (const [i, f] of r.footState.entries())
        if (f.planted && g.velocity.length() > 3)
          robotSamples.push({
            actualError: r.feet[i].getWorldPosition(g.player.position.clone()).distanceTo(f.anchor),
            ankleY: f.solved?.y,
            error: f.solved?.distanceTo(f.requested),
            clamped: f.clamped,
            target: f.requested?.toArray(),
            velocity: r.velocity.toArray(),
            phase: f.phase,
            time: g.time,
          });
      if (performance.now() - start < 3000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  });
  await page.keyboard.down('w');
  await page.waitForTimeout(2800);
  await page.keyboard.up('w');
  await page.waitForTimeout(250);
  const contacts = await page.evaluate(() => robotSamples);
  assert.ok(contacts.length > 40);
  const maxError = Math.max(
    ...contacts.map((x) => x.error || 0),
    ...contacts.map((x) => x.actualError || 0),
  );
  writeFileSync('test-results/robot-contacts.json', JSON.stringify(contacts, null, 2));
  assert.ok(maxError < 0.025, `support error ${maxError}`);
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  await page.keyboard.press('k');
  await page.waitForTimeout(200);
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  await page.keyboard.down('s');
  await page.waitForTimeout(900);
  await page.keyboard.up('s');
  await page.keyboard.press('Shift');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/robot-v3-in-game.png' });
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/robot.json',
    JSON.stringify(
      {
        passed: true,
        errors,
        contactSamples: contacts.length,
        maxContactError: maxError,
        clampedSamples: contacts.filter((c) => c.clamped).length,
        checks: [
          'inspection entry/exit',
          'pose preview',
          'camera orbit',
          'focus',
          'real movement',
          'jump/landing',
          'combat feedback',
        ],
      },
      null,
      2,
    ),
  );
  console.log('Robot checks:', {
    contactSamples: contacts.length,
    maxContactError: maxError,
    clampedSamples: contacts.filter((c) => c.clamped).length,
  });
} catch (error) {
  console.error(error);
  console.error(errors);
  await page.screenshot({ path: 'test-results/robot-failure.png' });
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
