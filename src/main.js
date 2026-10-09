import './style.css';
import { World } from './world.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { readSaveResult, newState, SETTINGS_KEY } from './state.js';
import { storage } from './storage.js';
import { RobotInspection } from './robot-inspection.js';
import { Direction } from './direction.js';
import { Experience } from './experience.js';
import { GuidanceHUD } from './guidance-hud.js';
import './theme.css';
import { JourneyExperience } from './journey-experience.js';

const defaults = {
  volume: 30,
  musicVolume: 35,
  effectsVolume: 80,
  quality: 'high',
  difficulty: 'standard',
  sensitivity: 1,
  shake: true,
  aimAssist: true,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  damageNumbers: true,
};
let settings = { ...defaults };
try {
  const raw = JSON.parse(storage.getItem(SETTINGS_KEY) || '{}');
  settings.volume = Number.isFinite(raw.volume) ? Math.max(0, Math.min(100, raw.volume)) : 30;
  for (const key of ['musicVolume', 'effectsVolume'])
    settings[key] = Number.isFinite(raw[key])
      ? Math.max(0, Math.min(100, raw[key]))
      : defaults[key];
  settings.sensitivity = Number.isFinite(raw.sensitivity)
    ? Math.max(0.4, Math.min(2, raw.sensitivity))
    : 1;
  settings.quality = raw.quality === 'low' ? 'low' : 'high';
  settings.difficulty = raw.difficulty === 'story' ? 'story' : 'standard';
  settings.shake = raw.shake !== false;
  settings.aimAssist = raw.aimAssist !== false;
  settings.reducedMotion =
    typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : defaults.reducedMotion;
  settings.damageNumbers = raw.damageNumbers !== false;
} catch {
  /* Default settings also work when storage is unavailable. */
}

try {
  const result = readSaveResult(storage);
  const saved = result.state;
  const initial = saved || newState();
  const world = new World(document.getElementById('world'), settings);
  const game = new Game(world, initial, settings);
  const ui = new UI(game, !!saved);
  new Experience(game, ui);
  new Direction(game);
  new GuidanceHUD(game);
  new JourneyExperience(game, ui);
  const inspection = new RobotInspection(game);
  if (result.status === 'recovered')
    ui.toast('已恢复自动备份', '主存档无法读取，已载入上一次有效节点。建议导出备份。');
  if (result.status === 'invalid')
    ui.toast('存档无法读取', '本地存档和备份均无效；可从设置导入此前导出的文件。');
  if (!storage.available) game.emit('storage-error');
  window.addEventListener('resize', () => world.resize());
  window.addEventListener('beforeunload', () => {
    if (ui.hasSave) game.save();
  });
  let previous = performance.now(),
    contextLost = false,
    failed = false;
  const recover = () => location.reload();
  world.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    const savedNow = ui.hasSave ? game.save() : null;
    game.mode = 'paused';
    game.keys.clear();
    ui.showModal(
      'graphics',
      '图形设备暂时断开',
      `<p class="modal-intro">${savedNow === false ? '进度未能保存，请先导出存档。' : '图形设备恢复后可重新连接。'}重新连接后从已保存节点继续。</p><button class="secondary wide" data-backup="export">导出存档 ↓</button><button class="primary wide" id="restore-graphics">重新连接 ↗</button>`,
      false,
    );
    document.getElementById('restore-graphics').onclick = recover;
  });
  world.renderer.domElement.addEventListener('webglcontextrestored', () => {
    if (game.lastSaveSucceeded !== false) recover();
  });
  function frame(now) {
    try {
      if (!contextLost && !failed) game.update((now - previous) / 1000);
    } catch (error) {
      console.error(error);
      failed = true;
      game.mode = 'paused';
      game.keys.clear();
      const savedNow = ui.hasSave ? game.save() : null;
      ui.showModal(
        'failure',
        '运行暂时中断',
        `<p class="modal-intro">${savedNow === false ? '浏览器未能保存进度，请先导出存档。' : '可从最近保存的旅程节点继续。'}</p><button class="secondary wide" data-backup="export">导出存档 ↓</button><button class="secondary wide" data-backup="diagnostics">导出诊断信息 ↓</button><button class="primary wide" id="reload-game">重新连接 ↗</button>`,
        false,
      );
      document.getElementById('reload-game').onclick = recover;
    }
    previous = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Development-only QA access; production builds contain no campaign controls.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('qa')) {
    window.__GAME__ = game;
    window.__UI__ = ui;
    window.__INSPECTION__ = inspection;
  }
} catch (error) {
  console.error(error);
  document.getElementById('ui').innerHTML =
    '<div class="modal-scrim"><section class="modal"><h2>场景未能启动</h2><p class="modal-intro" style="margin-top:24px">请使用支持 WebGL 2 的桌面浏览器，并启用硬件加速。如果仍无法进入，请查看控制台错误。</p><button class="primary wide" id="startup-retry">重新连接 ↗</button></section></div>';
  document.getElementById('startup-retry').onclick = () => location.reload();
}
