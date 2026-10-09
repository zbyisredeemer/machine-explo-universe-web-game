import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.locator('[data-inspect]:visible').click();
  assert.equal(await page.locator('[data-skin]:enabled').count(), 6);
  for (const id of ['coral', 'arctic', 'cobalt', 'citrus', 'orchid', 'ivory']) {
    await page.locator(`[data-skin="${id}"]`).click();
    assert.equal(await page.locator(`[data-skin="${id}"]`).getAttribute('aria-pressed'), 'true');
    const result = await page.evaluate(() => ({
      preview: __INSPECTION__.robot.userData.skinId,
      player: __GAME__.player.userData.skinId,
      state: __GAME__.state.equipment.skin,
      npc: __GAME__.world.npc.userData.skinMaterials.paint.color.getHexString(),
    }));
    assert.equal(result.preview, id);
    assert.equal(result.player, id);
    assert.equal(result.state, id);
    assert.equal(result.npc, 'cf9e66');
  }
  await page.locator('[data-skin="coral"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/skin-coral.png' });
  await page.setViewportSize({ width: 960, height: 640 });
  await page.screenshot({ path: 'test-results/skin-compact.png' });
  const boxes = await page
    .locator('[data-skin]:enabled')
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().toJSON()));
  assert.ok(boxes.every((b) => b.bottom < 550 && b.x >= 0));
  await page.keyboard.press('Escape');
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  await page.locator('#skip-arrival').click();
  assert.equal(await page.evaluate(() => __GAME__.state.equipment.skin), 'coral');
  checks.push(
    'six live palettes, material isolation, menu-to-new-game selection and compact controls',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    __GAME__.hp = 43;
    __GAME__.energy = 52;
    __GAME__.cooldowns.ability = 3;
  });
  await page.keyboard.press('i');
  const before = await page.evaluate(() => ({
    hp: __GAME__.hp,
    energy: __GAME__.energy,
    position: __GAME__.player.position.toArray(),
    cooldown: __GAME__.cooldowns.ability,
    actor: __GAME__.actors[0].mesh.uuid,
  }));
  await page.locator('[data-skin="cobalt"]').click();
  assert.deepEqual(
    await page.evaluate(() => ({
      hp: __GAME__.hp,
      energy: __GAME__.energy,
      position: __GAME__.player.position.toArray(),
      cooldown: __GAME__.cooldowns.ability,
      actor: __GAME__.actors[0].mesh.uuid,
    })),
    before,
  );
  assert.ok(await page.locator('[data-skin="moss"]').isDisabled());
  // Warming each palette once must bound GPU resources on repeated swaps.
  const memory = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const id of ['coral', 'arctic', 'cobalt', 'citrus', 'orchid', 'ivory']) {
      await page.locator(`[data-skin="${id}"]`).click();
      await page.waitForTimeout(25);
    }
    memory.push(await page.evaluate(() => ({ ...__GAME__.world.renderer.info.memory })));
  }
  assert.ok(memory[2].geometries <= memory[1].geometries + 1);
  assert.ok(memory[2].textures <= memory[1].textures + 1);
  await page.locator('[data-skin="cobalt"]').click();
  await page.screenshot({ path: 'test-results/skin-cobalt.png' });
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-action="continue"]').click();
  assert.equal(await page.evaluate(() => __GAME__.player.userData.skinId), 'cobalt');
  checks.push('no stat/position/encounter reset, locked skins, bounded swapping and save reload');
  const factions = [];
  for (let chapter = 0; chapter < 4; chapter++) {
    const result = await page.evaluate(async (chapter) => {
      const g = __GAME__;
      g.state.chapters[chapter].stage = 4;
      g.load(chapter);
      g.mode = 'inspect';
      g.player.visible = false;
      g.arrival = null;
      const boss = g.actors.find((e) => e.boss);
      const enemies = ['cutter', 'turret', 'beacon'].map((type) =>
        g.actors.find((e) => e.type === type),
      );
      for (const e of g.actors) e.mesh.visible = enemies.includes(e);
      for (const [i, e] of enemies.entries()) {
        e.mesh.position.set((i - 1) * 3.3, 0, -17);
        e.mesh.rotation.y = Math.PI;
        e.stunned = 1000;
      }
      g.world.viewer = {
        render() {
          g.world.camera.position.set(2.8, 3.8, -8);
          g.world.camera.lookAt(0, 1.1, -17);
          g.world.pipeline.render();
        },
      };
      document.getElementById('ui').style.visibility = 'hidden';
      return {
        boss: boss.mesh.userData.faction,
        paint: boss.mesh.userData.palette.paint,
        patrol: enemies.map((e) => ({ type: e.type, ...e.mesh.userData.palette })),
      };
    }, chapter);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/patrol-style-${chapter + 1}.png` });
    assert.equal(new Set(result.patrol.map((e) => e.paint)).size, 3);
    factions.push(result);
  }
  assert.equal(new Set(factions.map((f) => f.paint)).size, 4);
  assert.deepEqual(errors, []);
  checks.push('four faction palettes and three distinct patrol variants per chapter');
  writeFileSync(
    'test-results/appearance.json',
    JSON.stringify({ passed: true, errors, checks, memory, factions }, null, 2),
  );
  console.log('PASS', checks);
} catch (e) {
  console.error(e);
  console.error(errors);
  await page.screenshot({ path: 'test-results/appearance-failure.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
