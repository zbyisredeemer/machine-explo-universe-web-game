import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  checks = [],
  effects = [];
page.on('pageerror', (e) => errors.push(e.message));
mkdirSync('test-results', { recursive: true });
async function fixture(stage = 4) {
  await page.evaluate((stage) => {
    const g = __GAME__;
    g.state.modules = ['anchor', 'bloom', 'time', 'phase'];
    g.state.activeModule = 'anchor';
    g.state.chapters[0].stage = stage;
    g.state.chapters[0].killed = [];
    g.load(0);
    g.mode = 'playing';
    g.arrival = null;
    g.bossAnnounced = true;
    g.player.position.set(0, 0, -85);
    g.settings.volume = 0;
    g.settings.reducedMotion = false;
    for (const e of g.actors) {
      e.stunned = 1000;
      e.hp = e.maxHp = 10000;
    }
    g.actors[0].mesh.position.set(0, 0, -98);
    g.actors[1].mesh.position.set(8, 0, -94);
    __UI__.refresh();
  }, stage);
  await page.waitForTimeout(250);
}
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  await page.evaluate(() => {
    window.casts = [];
    __GAME__.on('ability-cast', (e) =>
      casts.push({ id: e.id, affected: e.affected, healed: e.healed }),
    );
  });
  for (const [i, id] of ['anchor', 'bloom', 'time', 'phase'].entries()) {
    await fixture();
    await page.keyboard.press(String(i + 1));
    await page.evaluate(() => {
      __GAME__.hp = 40;
      __GAME__.cooldowns.ability = 0;
      __GAME__.energy = 100;
    });
    await page.keyboard.down('x');
    await page.waitForFunction(() => __GAME__.abilityEffects.preview?.group.visible);
    const preview = await page.evaluate(() => ({
      position: __GAME__.abilityEffects.preview.group.position.toArray(),
      radius: __GAME__.abilityEffects.preview.ring.scale.x,
      energy: __GAME__.energy,
    }));
    assert.equal(preview.energy, 100);
    await page.keyboard.up('x');
    await page.keyboard.press('f');
    await page.waitForFunction(() => __GAME__.abilityEffects.effects.length > 0);
    assert.ok((await page.locator('#ability-feedback').textContent()).includes('已释放'));
    const result = await page.evaluate(() => {
      const g = __GAME__,
        e = g.abilityEffects.effects.at(-1);
      return {
        id: e.id,
        parts: e.group.children.length,
        hp: g.hp,
        timeSlow: g.timeSlow,
        position: g.player.position.toArray(),
        energy: g.energy,
        casts: casts.length,
      };
    });
    assert.equal(result.id, id);
    assert.ok(result.energy < 85);
    if (id === 'bloom') assert.ok(result.hp >= 72);
    if (id === 'time') assert.ok(result.timeSlow > 5);
    if (id === 'phase') {
      assert.ok(Math.abs(result.position[0] - preview.position[0]) < 0.01);
      assert.ok(Math.abs(result.position[2] - preview.position[2]) < 0.01);
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test-results/ability-${id}.png` });
    await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => casts.length), result.casts);
    effects.push(result);
    checks.push(id + ' preview, cast, feedback and cooldown');
  }
  await fixture();
  await page.keyboard.press('3');
  await page.keyboard.press('f');
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => __GAME__.abilityEffects.effects[0].elapsed);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => __GAME__.abilityEffects.effects[0].elapsed), paused);
  await page.locator('[data-action="resume"]').click();
  await page.evaluate(() => {
    const g = __GAME__;
    g.cooldowns.ability = 0;
    g.energy = 0;
  });
  await page.keyboard.press('f');
  await page.waitForFunction(() =>
    document.querySelector('#skill-status').textContent.includes('能源不足'),
  );
  assert.match(await page.locator('#skill-status').textContent(), /能源不足/);
  checks.push('pause freezes effects; insufficient energy is explicit');
  await fixture(3);
  await page.evaluate(() => {
    __GAME__.player.position.set(0, 0, -61);
  });
  await page.keyboard.press('2');
  await page.waitForFunction(() => document.querySelector('#interaction kbd').textContent === '1');
  await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => __GAME__.cs.stage), 3);
  await page.keyboard.press('1');
  await page.waitForFunction(() => document.querySelector('#interaction kbd').textContent === 'F');
  await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => __GAME__.cs.stage), 4);
  checks.push('gate prompts correct module and F, opens only on valid cast');
  await fixture(1);
  await page.evaluate(() => {
    const g = __GAME__;
    g.player.position.set(-19, 0, -19);
  });
  await page.waitForFunction(() =>
    document.querySelector('#task-progress').textContent.includes('0 / 3'),
  );
  assert.match(await page.locator('#objective-detail').textContent(), /护盾信标/);
  await page.evaluate(() => {
    for (const e of __GAME__.actors) if (e.id.startsWith('relay')) e.hp = 0;
  });
  await page.waitForFunction(
    () =>
      document.querySelector('#task-action kbd').textContent === 'E' &&
      document.querySelector('#objective-detail').textContent.includes('干扰已解除'),
  );
  assert.match(await page.locator('#objective-detail').textContent(), /干扰已解除/);
  await page.screenshot({ path: 'test-results/task-guidance.png' });
  checks.push('live task count, shield priority and post-combat interaction');
  await fixture();
  await page.evaluate(() => {
    const g = __GAME__;
    g.settings.reducedMotion = true;
    g.settings.quality = 'low';
    g.world.quality();
    g.ability();
  });
  assert.ok(await page.evaluate(() => __GAME__.abilityEffects.effects[0].reduced));
  await page.waitForTimeout(650);
  assert.equal(await page.evaluate(() => __GAME__.abilityEffects.effects.length), 0);
  const cleanup = await page.evaluate(() => {
    const g = __GAME__;
    let disposed = 0;
    g.settings.reducedMotion = false;
    for (let i = 0; i < 12; i++) {
      g.cooldowns.ability = 0;
      g.energy = 100;
      g.state.activeModule = ['anchor', 'bloom', 'time', 'phase'][i % 4];
      g.ability();
    }
    const bounded = g.abilityEffects.effects.length;
    for (const e of g.abilityEffects.effects)
      for (const m of e.materials) m.addEventListener('dispose', () => disposed++);
    g.load('hub');
    return {
      bounded,
      disposed,
      remaining: g.abilityEffects.effects.length,
      preview: g.abilityEffects.preview,
    };
  });
  assert.ok(cleanup.bounded <= 8);
  assert.ok(cleanup.disposed > 0);
  assert.equal(cleanup.remaining, 0);
  assert.equal(cleanup.preview, null);
  checks.push('reduced motion, bounded casts and material disposal on travel');
  await fixture();
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(200);
  const layout = await page.evaluate(() => {
    const card = document.querySelector('#skill-card').getBoundingClientRect(),
      modules = document.querySelector('#modules').getBoundingClientRect(),
      mission = document.querySelector('.mission').getBoundingClientRect();
    return { card: card.toJSON(), modules: modules.toJSON(), mission: mission.toJSON() };
  });
  assert.ok(layout.card.bottom < layout.modules.top);
  assert.ok(layout.mission.right < layout.card.left || layout.mission.bottom < layout.card.top);
  await page.screenshot({ path: 'test-results/guidance-compact.png' });
  checks.push('compact layout');
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/guidance.json',
    JSON.stringify({ passed: true, checks, effects, cleanup, errors }, null, 2),
  );
  console.log('PASS', checks);
} catch (error) {
  console.error(error);
  console.error(errors);
  await page.screenshot({ path: 'test-results/guidance-failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
