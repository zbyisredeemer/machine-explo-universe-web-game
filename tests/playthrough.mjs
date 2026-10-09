import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [],
  records = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
mkdirSync('test-results', { recursive: true });
const state = () =>
  page.evaluate(() => ({
    location: __GAME__.state.location,
    stage: __GAME__.cs?.stage,
    position: __GAME__.player.position.toArray(),
    yaw: __GAME__.yaw,
    mode: __GAME__.mode,
    hp: __GAME__.hp,
    active: __GAME__.state.activeModule,
    modules: __GAME__.state.modules,
    enemies: __GAME__.actors
      .filter((e) => e.hp > 0)
      .map((e) => ({ id: e.id, hp: e.hp, position: e.mesh.position.toArray() })),
  }));
async function screenshot(name) {
  await page.screenshot({ path: `test-results/${name}.png` });
}
async function move(x, z) {
  // Navigation is in world coordinates; return the camera to north with real keys.
  for (let i = 0; i < 35; i++) {
    const yaw = (await state()).yaw,
      delta = Math.atan2(Math.sin(-yaw), Math.cos(-yaw));
    if (Math.abs(delta) < 0.035) break;
    const key = delta > 0 ? 'q' : 'r';
    await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(120, Math.max(15, (Math.abs(delta) / 1.6) * 950)));
    await page.keyboard.up(key);
  }
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const s = await state();
    assert.equal(s.mode, 'playing', `move interrupted: ${JSON.stringify(s)}`);
    const dx = x - s.position[0],
      dz = z - s.position[2];
    if (Math.hypot(dx, dz) < 1.2) return;
    const keys = [];
    if (Math.abs(dx) > 0.65) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dz) > 0.65) keys.push(dz > 0 ? 's' : 'w');
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(Math.min(160, Math.max(40, (Math.hypot(dx, dz) / 10) * 800)));
    for (const key of keys) await page.keyboard.up(key);
  }
  throw Error(`Movement stuck toward ${x},${z}: ${JSON.stringify(await state())}`);
}
async function talk() {
  await page.keyboard.press('e');
  await page.waitForTimeout(100);
  for (let i = 0; i < 12; i++) {
    if (!(await page.locator('#dialog').isVisible())) break;
    await page.locator('[data-action="dialog-next"]').click();
    await page.waitForTimeout(50);
  }
}
async function fight(prefix, timeout = 40000) {
  const start = Date.now();
  await page.keyboard.down('k');
  try {
    while (Date.now() - start < timeout) {
      const s = await state();
      assert.notEqual(s.mode, 'dead', `Player died in ${prefix}`);
      if (!s.enemies.some((e) => e.id.startsWith(prefix))) return;
      const target = s.enemies.find((e) => e.id.startsWith(prefix)),
        dx = target.position[0] - s.position[0],
        dz = target.position[2] - s.position[2];
      const desired = Math.atan2(-dx, -dz),
        difference = Math.atan2(Math.sin(desired - s.yaw), Math.cos(desired - s.yaw));
      if (Math.abs(difference) > 0.3) {
        const turn = difference > 0 ? 'q' : 'r';
        await page.keyboard.down(turn);
        await page.waitForTimeout(120);
        await page.keyboard.up(turn);
      }
      if (s.hp < 50) await page.keyboard.press('g');
      if (prefix === 'boss') {
        await page.keyboard.press('j');
        if (s.active) await page.keyboard.press('f');
      }
      await page.waitForTimeout(250);
    }
    throw Error(`Combat timeout ${prefix}: ${JSON.stringify(await state())}`);
  } finally {
    await page.keyboard.up('k');
  }
}
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__GAME__);
  await screenshot('01-title');
  await page.locator('[data-action="settings"]').click();
  await page.selectOption('[data-setting="difficulty"]', 'story');
  await page.selectOption('[data-setting="quality"]', 'low');
  await page.locator('[data-setting="volume"]').evaluate((input) => {
    input.value = '0';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('[data-action="close"]').last().click();
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  assert.equal((await state()).mode, 'playing');
  if (await page.locator('#skip-arrival').isVisible()) await page.locator('#skip-arrival').click();
  // Actual keyboard input: movement, airborne second jump, energy-consuming dash.
  await page.keyboard.press('Space');
  await page.waitForFunction(() => __GAME__.player.position.y > 0.5);
  await page.keyboard.press('Space');
  assert.ok((await state()).position[1] > 0.5);
  const energy = await page.evaluate(() => __GAME__.energy);
  await page.keyboard.press('Shift');
  assert.ok((await page.evaluate(() => __GAME__.energy)) < energy);
  await page.waitForTimeout(1500);
  await screenshot('02-first-steps');
  for (let chapter = 0; chapter < 4; chapter++) {
    console.log('Chapter', chapter + 1, 'started');
    assert.equal((await state()).location, chapter);
    await move(-9, 10);
    await talk();
    assert.equal((await state()).stage, 1);
    if (chapter === 0) {
      await move(22, 6);
      await talk();
      assert.equal(await page.evaluate(() => __GAME__.cs.tool), true);
    }
    await move(-15, -8);
    await fight('relay');
    await move(-19, -19);
    await talk();
    assert.equal((await state()).stage, 2);
    await move(15, -34);
    await fight('module');
    await move(18, -48);
    await talk();
    assert.equal((await state()).stage, 3);
    await screenshot(`chapter-${chapter + 1}-module`);
    await page.locator('[data-action="close"]').last().click();
    assert.equal((await state()).modules.length, chapter + 1);
    // Optional route: module-gated records and persistent inventory.
    await move(-17, -48);
    await fight('optional-0');
    await move(-29, -51);
    await talk();
    assert.equal(await page.evaluate(() => __GAME__.cs.memory), true);
    await move(0, -60);
    await page.keyboard.press('f');
    await page.waitForTimeout(120);
    assert.equal((await state()).stage, 4);
    await move(0, -80);
    await screenshot(`chapter-${chapter + 1}-combat`);
    await fight('boss');
    assert.equal((await state()).stage, 5);
    await move(0, -141);
    await talk();
    assert.equal((await state()).stage, 6);
    await screenshot(`chapter-${chapter + 1}-discovery`);
    if (chapter === 3) {
      await page.locator('[data-action="ending-share"]').click();
      assert.equal(await page.evaluate(() => __GAME__.state.ending), 'share');
      await screenshot('09-ending');
      await page.locator('[data-action="hub"]').click();
    } else {
      await move(0, 29);
      await talk();
      if (chapter === 0) await page.locator('[data-action="invite-yes"]').click();
    }
    assert.equal((await state()).location, 'hub');
    await screenshot(`chapter-${chapter + 1}-home`);
    if (chapter === 0) {
      await move(-10, 1);
      await talk();
      await page.locator('[data-action="equip-chassis-guardian"]').click();
      assert.equal(await page.evaluate(() => __GAME__.state.equipment.chassis), 'guardian');
      await page.locator('[data-action="close"]').click();
      assert.equal((await state()).hp, 150);
      await move(-8, -5);
      await page.keyboard.press('e');
      await screenshot('05-companion');
      while (await page.locator('#dialog').isVisible())
        await page.locator('[data-action="dialog-next"]').click();
      // Reload real localStorage, then use the title-menu Continue button.
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('[data-action="continue"]').click();
      assert.equal((await state()).location, 'hub');
      assert.equal(await page.evaluate(() => __GAME__.state.companion), true);
      assert.equal(await page.evaluate(() => __GAME__.state.chapters[0].tool), true);
    }
    records.push(
      await page.evaluate(() => ({
        chapter: __GAME__.state.unlocked,
        completed: __GAME__.state.chapters.map((c) => c.completed),
        modules: [...__GAME__.state.modules],
        salvage: __GAME__.state.salvage,
      })),
    );
    if (chapter < 3) {
      await move(0, -15);
      await talk();
      await screenshot(`chapter-${chapter + 1}-starmap`);
      await page.locator(`[data-action="travel-${chapter + 1}"]`).click();
    }
  }
  // The final perception upgrade unlocks a real hidden record in an old chapter.
  await move(0, -15);
  await talk();
  await page.locator('[data-action="travel-0"]').click();
  await move(22, -128);
  await fight('optional-1');
  await move(28, -128);
  await talk();
  assert.equal(await page.evaluate(() => __GAME__.state.chapters[0].secret), true);
  await page.keyboard.press('Tab');
  await screenshot('10-archive');
  await page.locator('[data-action="close"]').click();
  // A lethal hit must present retry and preserve campaign state.
  await page.evaluate(() => {
    __GAME__.invincible = 0;
    __GAME__.hurt(9999);
  });
  assert.equal((await state()).mode, 'dead');
  await page.locator('[data-action="retry"]').click();
  assert.equal((await state()).mode, 'playing');
  assert.equal(await page.evaluate(() => __GAME__.state.ending), 'share');
  await page.keyboard.press('Escape');
  assert.equal((await state()).mode, 'paused');
  const before = (await state()).position;
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  assert.deepEqual((await state()).position, before);
  await page.locator('[data-action="resume"]').click();
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    errors,
    chapters: records,
    final: await page.evaluate(() => __GAME__.state),
  };
  writeFileSync('test-results/playthrough.json', JSON.stringify(report, null, 2));
  console.log(
    'PASS: all four chapters, real input/combat, equipment, companion, save/reload, ending, revisit, death/retry and pause.',
  );
} catch (error) {
  await screenshot('FAILURE').catch(() => {});
  console.error(error);
  console.error('Runtime state:', await state().catch(() => null));
  writeFileSync(
    'test-results/failure.json',
    JSON.stringify(
      { error: String(error), errors, state: await state().catch(() => null) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
