import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  palettes = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
mkdirSync('test-results', { recursive: true });
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/theme-title.png' });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.screenshot({ path: 'test-results/theme-title-compact.png' });
  const bounds = await page.locator('[data-action="new"]').boundingBox();
  assert.ok(bounds.y + bounds.height < 700);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  for (let i = 0; i < 4; i++) {
    await page.evaluate((i) => {
      const g = __GAME__;
      g.state.unlocked = 3;
      g.state.modules = ['anchor', 'bloom', 'time', 'phase'];
      g.state.activeModule = g.state.modules[i];
      g.state.chapters[i].stage = 4;
      g.load(i);
      g.arrival = null;
      g.mode = 'playing';
      g.bossAnnounced = true;
      g.player.position.set(0, 0, 20);
      g.settings.volume = 0;
      for (const e of g.actors) e.stunned = 1000;
      __UI__.refresh();
    }, i);
    await page.waitForTimeout(700);
    const palette = await page.evaluate(() => ({
      chapter: document.documentElement.dataset.chapter,
      signal: getComputedStyle(document.documentElement).getPropertyValue('--signal'),
      dome: __GAME__.world.root.children.filter((o) => o.userData.skyBackdrop).length,
      objects: (() => {
        let n = 0;
        __GAME__.world.root.traverseVisible((o) => {
          if (o.isMesh) n++;
        });
        return n;
      })(),
    }));
    assert.equal(palette.chapter, String(i));
    assert.equal(palette.dome, 1);
    assert.ok(palette.objects > 10);
    palettes.push(palette);
    await page.screenshot({ path: `test-results/theme-chapter-${i + 1}.png` });
  }
  assert.equal(new Set(palettes.map((p) => p.signal)).size, 4);
  await page.evaluate(() => __UI__.starmap());
  await page.screenshot({ path: 'test-results/theme-starmap.png' });
  await page.locator('[data-action="close"]').last().click();
  await page.evaluate(() => {
    __GAME__.settings.quality = 'low';
    __GAME__.world.quality();
    __GAME__.load('hub');
  });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.chapter), '3');
  await page.screenshot({ path: 'test-results/theme-hub-low.png' });
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/theme.json',
    JSON.stringify(
      {
        passed: true,
        palettes,
        errors,
        checks: [
          'title and compact primary action',
          'four chapter transitions and sky shaders',
          'distinct UI palettes',
          'star map',
          'hub theme and low quality',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: four chapter palettes, sky shaders, title, compact layout, star map and low-quality hub.',
  );
} catch (e) {
  console.error(e);
  console.error(errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
