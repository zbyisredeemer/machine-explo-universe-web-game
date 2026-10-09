import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const state = JSON.parse(readFileSync('test-results/playthrough.json', 'utf8')).final;
await page.addInitScript((s) => {
  s.location = 0;
  localStorage.setItem('alien-body.save.v1', JSON.stringify(s));
  localStorage.setItem('alien-body.settings.v1', JSON.stringify({ quality: 'low', volume: 0 }));
}, state);
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.locator('[data-action="continue"]').click();
  for (let chapter = 0; chapter < 4; chapter++) {
    await page.evaluate((i) => {
      __GAME__.load(i);
      __GAME__.mode = 'playing';
      __GAME__.player.position.set(0, 0, -137);
      __GAME__.cinematic = __GAME__.world.discoveryFocus;
    }, chapter);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `test-results/final-civilization-${chapter + 1}.png` });
    assert.ok(await page.evaluate(() => __GAME__.world.revealObjects.every((o) => o.visible)));
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/showcase.json',
    JSON.stringify({ passed: true, errors, chaptersRendered: 4 }, null, 2),
  );
  console.log('PASS: all four final civilization scenes render without errors.');
} finally {
  await browser.close();
}
