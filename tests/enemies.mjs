import { launchBrowser, gameURL, productionURL } from './browser.mjs';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(gameURL, { waitUntil: 'networkidle' });
  await page.locator('[data-action="new"]').click();
  await page.getByRole('button', { name: '启动身体' }).click();
  await page.locator('#skip-arrival').click();
  for (let chapter = 0; chapter < 4; chapter++) {
    const result = await page.evaluate(async (chapter) => {
      const { animateMechanicalEnemy } = await import('/src/enemy-rigs.js');
      const g = __GAME__;
      g.state.chapters[chapter].stage = 4;
      g.load(chapter);
      g.mode = 'inspect';
      const boss = g.actors.find((e) => e.boss),
        r = boss.mesh.userData;
      boss.mesh.rotation.y = Math.PI;
      const checks = [];
      let maxSupportError = 0,
        finite = true,
        minFootY = Infinity;
      // Fixed-step locomotion changes heading and reverses without depending on GPU speed.
      for (let i = 0; i < 360; i++) {
        const t = i / 60;
        boss.mesh.position.x = Math.sin(t * 1.4) * 2;
        boss.mesh.position.z = -103 + Math.cos(t) * 2;
        boss.mesh.rotation.y = Math.PI + Math.sin(t) * 0.8;
        boss.exposed = i > 180 ? 2 : 0;
        boss.firedAt = i === 200 ? t : boss.firedAt;
        animateMechanicalEnemy(boss, t);
        boss.mesh.updateMatrixWorld(true);
        for (const f of r.limbs) {
          const pos = f.foot.getWorldPosition(g.player.position.clone());
          finite &&= pos.toArray().every(Number.isFinite);
          minFootY = Math.min(minFootY, pos.y);
          if (f.planted) maxSupportError = Math.max(maxSupportError, pos.distanceTo(f.anchor));
        }
      }
      checks.push(
        r.vents.every(
          (v) => Math.abs(v.kind === 'door' ? v.mesh.rotation.y : v.mesh.rotation.x) > 0.8,
        ),
      );
      boss.firedAt = 6;
      animateMechanicalEnemy(boss, 6);
      const recoil = r.recoils[0].position.z;
      animateMechanicalEnemy(boss, 6.2);
      checks.push(recoil > r.recoils[0].position.z + 0.1);
      boss.mesh.position.set(0, 0, -103);
      boss.mesh.rotation.y = Math.PI;
      r.initialized = false;
      boss.exposed = 2;
      animateMechanicalEnemy(boss, 6.3);
      g.player.visible = false;
      g.world.subject = boss.mesh;
      g.world.update(0, g.time);
      g.world.viewer = {
        render() {
          g.world.camera.position.set(6, 4.5, -93);
          g.world.camera.lookAt(0, 2.7, -103);
          g.world.pipeline.render();
        },
      };
      document.getElementById('ui').style.visibility = 'hidden';
      g.world.render();
      return {
        chapter,
        finite,
        minFootY,
        maxSupportError,
        ventsOpen: checks[0],
        recoil: checks[1],
        limbs: r.limbs.length,
        tools: r.tools.length,
      };
    }, chapter);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/enemy-${chapter + 1}-detail.png` });
    results.push(result);
  }
  const passed =
    errors.length === 0 &&
    results.every(
      (r) =>
        r.finite &&
        r.minFootY > 0.23 &&
        r.maxSupportError < 0.035 &&
        r.ventsOpen &&
        r.recoil &&
        r.limbs === 4,
    );
  writeFileSync('test-results/enemies.json', JSON.stringify({ passed, errors, results }, null, 2));
  console.log(results);
  assert.ok(passed);
} finally {
  await browser.close();
}
