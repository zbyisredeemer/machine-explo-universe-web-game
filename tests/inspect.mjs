import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import { existsSync, mkdirSync } from 'node:fs';
const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE', msg.text());
});
await page.goto(gameURL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
mkdirSync('test-results', { recursive: true });
await page.screenshot({ path: 'test-results/title.png' });
console.log(
  await page.evaluate(() => ({
    game: !!window.__GAME__,
    mode: window.__GAME__?.mode,
    draws: window.__GAME__?.world.renderer.info.render.calls,
    triangles: window.__GAME__?.world.renderer.info.render.triangles,
  })),
);
await page.locator('[data-action="new"]').click();
await page.getByRole('button', { name: '启动身体' }).click();
await page.waitForTimeout(4500);
await page.screenshot({ path: 'test-results/gameplay.png' });
console.log(
  await page.evaluate(() => ({
    mode: window.__GAME__.mode,
    position: window.__GAME__.player.position.toArray(),
  })),
);
await browser.close();
