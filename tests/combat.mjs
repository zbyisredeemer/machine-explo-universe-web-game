import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
mkdirSync('test-results', { recursive: true });
async function reset() {
  await page.evaluate(() => {
    const g = __GAME__;
    g.state.chapters[0].stage = 4;
    g.load(0);
    g.mode = 'playing';
    g.arrival = null;
    g.bossAnnounced = true;
    g.player.position.set(0, 0, -85);
    g.settings.volume = 0;
    g.settings.quality = 'low';
    g.world.quality();
    for (const [i, e] of g.actors.entries()) {
      e.hp = e.maxHp = 10000;
      e.stunned = 1000;
      e.mesh.position.set(i === 0 ? 0 : 25, 0, i === 0 ? -105 : -140);
    }
    g.cameraPosition.set(0, 5.2, -74);
    g.cameraTarget.set(0, 2, -91);
  });
  await page.waitForTimeout(250);
}
async function targetPoint() {
  return page.evaluate(() => {
    const g = __GAME__,
      p = g.actors[0].mesh.position.clone();
    p.y = 1.5;
    p.project(g.world.camera);
    return { x: ((p.x + 1) * innerWidth) / 2, y: ((1 - p.y) * innerHeight) / 2 };
  });
}
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  await reset();
  await page.keyboard.down('d');
  await page.waitForTimeout(180);
  await page.keyboard.up('d');
  await page.keyboard.down('a');
  await page.waitForFunction(() => __GAME__.velocity.x < -9);
  await page.keyboard.up('a');
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => __GAME__.velocity.length() < 1));
  checks.push('rapid reverse and braking');
  await reset();
  await page.keyboard.down('w');
  await page.keyboard.press('Shift');
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  await page.waitForFunction(() => __GAME__.dashVector.x > 0.65);
  await page.keyboard.up('d');
  checks.push('steer a live dash');
  await page.waitForTimeout(350);
  await page.keyboard.press('Space');
  await page.keyboard.down('a');
  await page.waitForTimeout(120);
  await page.keyboard.up('a');
  await page.keyboard.down('d');
  await page.waitForTimeout(120);
  assert.ok(await page.evaluate(() => __GAME__.player.position.y > 0 && __GAME__.velocity.x > 9));
  await page.keyboard.up('d');
  checks.push('air reversal');
  await reset();
  const aim = await targetPoint();
  await page.mouse.move(aim.x, aim.y);
  const hp = await page.evaluate(() => __GAME__.actors[0].hp);
  await page.mouse.down();
  await page.waitForTimeout(430);
  await page.mouse.up();
  assert.ok((await page.evaluate(() => __GAME__.actors[0].hp)) < hp);
  assert.ok(await page.locator('#reticle').evaluate((e) => e.classList.contains('on-target')));
  checks.push('mouse aim and held fire');
  const alignment = await page.evaluate(() => {
    const g = __GAME__,
      r = g.player.userData.rig,
      origin = r.gun.getWorldPosition(g.player.position.clone()),
      tip = r.muzzle.getWorldPosition(g.player.position.clone());
    return tip.sub(origin).normalize().dot(g.player.userData.aimAt.clone().sub(origin).normalize());
  });
  assert.ok(alignment > 0.999);
  checks.push('barrel aligns with intended aim');
  await page.mouse.move(1100, 290);
  await page.waitForTimeout(250);
  const missed = await page.evaluate(() => __GAME__.actors[0].hp);
  await page.mouse.click(1100, 290);
  await page.waitForTimeout(70);
  assert.equal(await page.evaluate(() => __GAME__.actors[0].hp), missed);
  checks.push('off-axis cursor does not steal a target');
  await reset();
  await page.evaluate(() => {
    const g = __GAME__;
    g.actors[0].mesh.position.copy(g.player.position).add({ x: 0.25, y: 0, z: -0.1 });
  });
  await page.keyboard.press('k');
  await page.waitForTimeout(60);
  assert.ok((await page.evaluate(() => __GAME__.actors[0].hp)) < 10000);
  checks.push('point-blank keyboard shooting');
  await reset();
  await page.evaluate(() => (__GAME__.settings.aimAssist = false));
  const exact = await targetPoint();
  await page.mouse.click(exact.x, exact.y);
  await page.waitForTimeout(60);
  assert.ok((await page.evaluate(() => __GAME__.actors[0].hp)) < 10000);
  checks.push('manual aim with assist disabled');
  await reset();
  await page.evaluate(() => (__GAME__.settings.aimAssist = true));
  await page.keyboard.press('l');
  assert.ok(await page.evaluate(() => !!__GAME__.lockedTarget));
  await page.keyboard.down('a');
  await page.keyboard.down('k');
  await page.waitForTimeout(350);
  await page.keyboard.up('k');
  await page.keyboard.up('a');
  assert.ok((await page.evaluate(() => __GAME__.actors[0].hp)) < 10000);
  checks.push('locked strafing fire');
  // Cooldown input buffer and pause cancellation run at controlled frame steps.
  const buffers = await page.evaluate(() => {
    const g = __GAME__;
    g.clearInput();
    g.cooldowns.dash = 0.06;
    g.dashBuffer = 0.13;
    g.energy = 100;
    g.update(0.04);
    g.update(0.04);
    const dashed = g.dashTime > 0;
    g.jumpBuffer = 0.13;
    g.jumps = 2;
    g.player.position.y = 0.01;
    g.velocityY = -1;
    g.update(0.02);
    const jumped = g.jumps === 1 && g.velocityY > 0;
    g.dashBuffer = 0.1;
    g.jumpBuffer = 0.1;
    g.keys.add('Mouse0');
    g.mode = 'paused';
    return {
      dashed,
      jumped,
      cleared: g.dashBuffer === 0 && g.jumpBuffer === 0 && g.keys.size === 0,
    };
  });
  assert.deepEqual(buffers, { dashed: true, jumped: true, cleared: true });
  checks.push('dash/jump buffering and pause clears input');
  await reset();
  await page.evaluate(() => {
    const g = __GAME__;
    g.settings.quality = 'high';
    g.world.quality();
    g.state.equipment.weapon = 'lance';
    g.stats.weapon = { id: 'lance', interval: 0.5, damage: 38 };
  });
  await page.waitForTimeout(500);
  const heavy = await targetPoint();
  await page.mouse.move(heavy.x, heavy.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.screenshot({ path: 'test-results/combat-lance.png' });
  await page.mouse.up();
  await page.evaluate(() => {
    const g = __GAME__;
    g.settings.reducedMotion = true;
    g.settings.quality = 'low';
    g.world.quality();
    g.cooldowns.shot = 0;
    g.shoot();
  });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => __GAME__.world.fx.filter((f) => f.ownMaterial).length), 0);
  checks.push('heavy shot and reduced-motion effect cleanup');
  await page.keyboard.down('k');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('k');
  assert.equal(await page.evaluate(() => __GAME__.keys.size), 0);
  checks.push('blur stops firing');
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/combat.json',
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log('PASS', checks);
} catch (error) {
  await page.screenshot({ path: 'test-results/combat-failure.png' }).catch(() => {});
  console.error(error);
  console.error(
    await page
      .evaluate(() => ({
        mode: __GAME__.mode,
        aim: __GAME__.aim.solution?.target?.id,
        position: __GAME__.player.position.toArray(),
        errors: document.querySelector('#modal-root')?.textContent,
      }))
      .catch(() => null),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
