import * as T from 'three';
import { validateSave } from './state.js';
import { storage } from './storage.js';

export class Experience {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.popups = [];
    document
      .getElementById('hud')
      .insertAdjacentHTML(
        'beforeend',
        `<div id="target-lock" class="target-lock hidden"><i></i><span>LOCKED</span></div><div id="combat-readout" class="combat-readout"></div><div id="module-meter" class="module-meter"><i></i></div><div id="stage-progress" class="stage-progress"></div><div id="combat-numbers"></div><div id="temporal-field"></div>`,
      );
    game.on('frame', () => this.frame());
    document
      .getElementById('hud')
      .insertAdjacentHTML(
        'beforeend',
        '<div id="aim-impact" class="aim-impact hidden"></div><div id="aim-label" class="aim-label"></div><div id="dash-status" class="dash-status"><kbd>SHIFT</kbd><span></span><i></i></div>',
      );
    game.on('fire', (shot) => {
      if (shot.target) {
        this.hitPoint = shot.point.clone();
        this.hitUntil = performance.now() + 130;
      }
    });
    game.on('hit', (data) => {
      this.damageNumber(data);
      if (data.position) {
        this.hitPoint = data.position.clone();
        this.hitUntil = performance.now() + 130;
      }
    });
    game.on('combo', ({ combo }) =>
      this.readout(
        combo === 3 ? '终结连击' : '连击 ' + combo,
        combo === 3 ? 'FINISHER' : 'CHAIN',
        combo === 3,
      ),
    );
    game.on('dodge', () => this.readout('完美闪避', 'ENERGY +12', true));
    game.on('loaded', () => {
      for (const p of this.popups) p.node.remove();
      this.popups = [];
      this.updateProgress();
    });
    game.on('objective', () => {
      this.updateProgress();
      document.getElementById('stage-progress').animate(
        [
          { opacity: 0, transform: 'translateX(-8px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: game.settings.reducedMotion ? 0 : 400 },
      );
    });
    this.observeModals();
    this.attachFiles();
    this.updateProgress();
    document.addEventListener('keydown', (event) => {
      if (event.code !== 'Tab') return;
      const modal = document.querySelector('.modal');
      if (!modal) return;
      const items = [
        ...modal.querySelectorAll('button:not(:disabled),input,select,a[href],summary'),
      ].filter((el) => el.getClientRects().length);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (event.shiftKey && i <= 0) {
        event.preventDefault();
        items.at(-1).focus();
      } else if (!event.shiftKey && (i < 0 || i === items.length - 1)) {
        event.preventDefault();
        items[0].focus();
      }
    });
  }
  updateProgress() {
    const element = document.getElementById('stage-progress');
    if (!element) return;
    element.innerHTML = this.game.cs
      ? Array.from(
          { length: 7 },
          (_, i) =>
            `<i class="${i < this.game.cs.stage ? 'done' : i === this.game.cs.stage ? 'current' : ''}"></i>`,
        ).join('') + `<span>航程节点 ${this.game.cs.stage + 1} / 7</span>`
      : '<span>HOME / 这里有人等你回来</span>';
  }
  readout(title, sub, strong) {
    const node = document.getElementById('combat-readout');
    node.innerHTML = `<strong>${title}</strong><small>${sub}</small>`;
    node.classList.toggle('strong', strong);
    node.classList.add('show');
    clearTimeout(this.readoutTimer);
    this.readoutTimer = setTimeout(() => node.classList.remove('show'), 1200);
  }
  damageNumber({ damage, position, shield, heavy }) {
    if (this.game.settings.damageNumbers === false || !position || this.popups.length > 20) return;
    const node = document.createElement('span');
    node.className = `damage-number ${heavy ? 'heavy' : ''} ${shield ? 'shield' : ''}`;
    node.textContent = shield ? '◇ ' + damage : damage;
    document.getElementById('combat-numbers').appendChild(node);
    this.popups.push({ node, position, life: 0.7, offset: (Math.random() - 0.5) * 28 });
  }
  frame() {
    const now = performance.now(),
      dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    this.aimFrame(now);
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      const screen = p.position.clone().project(this.game.world.camera);
      p.node.style.left = ((screen.x + 1) * innerWidth) / 2 + p.offset + 'px';
      p.node.style.top = ((1 - screen.y) * innerHeight) / 2 - (0.7 - p.life) * 45 + 'px';
      p.node.style.opacity = screen.z > 1 ? '0' : String(Math.min(1, p.life * 3));
      if (p.life <= 0) {
        p.node.remove();
        this.popups.splice(i, 1);
      }
    }
    const target = this.game.lockedTarget,
      lock = document.getElementById('target-lock');
    lock.classList.toggle('hidden', !target || !this.game.playing);
    if (target) {
      const pos = target.mesh.position
        .clone()
        .add(new T.Vector3(0, target.boss ? 3 : 1.4, 0))
        .project(this.game.world.camera);
      lock.style.left = ((pos.x + 1) * innerWidth) / 2 + 'px';
      lock.style.top = ((1 - pos.y) * innerHeight) / 2 + 'px';
    }
    const meter = document.getElementById('module-meter');
    meter.classList.toggle('ready', this.game.cooldowns.ability <= 0);
    meter.firstChild.style.transform = `scaleX(${1 - this.game.cooldowns.ability / (this.game.state.chapters[2].helped ? 5 : 6)})`;
    document
      .getElementById('temporal-field')
      .classList.toggle('active', this.game.timeSlow > 0 && !this.game.settings.reducedMotion);
    document.body.classList.toggle('reduced-motion', this.game.settings.reducedMotion === true);
  }
  aimFrame(now) {
    const g = this.game,
      aim = g.aim,
      shot = aim.solution;
    const active = g.playing && !g.arrival && g.state.location !== 'hub';
    const reticle = document.getElementById('reticle'),
      impact = document.getElementById('aim-impact'),
      label = document.getElementById('aim-label');
    const canvas = g.world.renderer.domElement,
      rect = canvas.getBoundingClientRect();
    const input = aim.mouse ? aim.pointer : { x: 0, y: 0 };
    const x = rect.left + ((input.x + 1) * rect.width) / 2,
      y = rect.top + ((1 - input.y) * rect.height) / 2;
    reticle.classList.toggle('hidden', !active);
    reticle.style.left = x + 'px';
    reticle.style.top = y + 'px';
    reticle.style.setProperty('--recoil', g.settings.reducedMotion ? '0px' : aim.kick * 12 + 'px');
    reticle.classList.toggle('on-target', active && !!shot?.target);
    reticle.classList.toggle('blocked', active && !!shot?.blocked);
    canvas.classList.toggle('combat-cursor', active && aim.mouse);
    const projected = shot?.point.clone().project(g.world.camera);
    const visible =
      active &&
      projected &&
      projected.z >= -1 &&
      projected.z <= 1 &&
      Math.abs(projected.x) <= 1 &&
      Math.abs(projected.y) <= 1;
    impact.classList.toggle('hidden', !visible);
    if (visible) {
      impact.style.left = rect.left + ((projected.x + 1) * rect.width) / 2 + 'px';
      impact.style.top = rect.top + ((1 - projected.y) * rect.height) / 2 + 'px';
    }
    impact.classList.toggle('on-target', !!shot?.target);
    impact.classList.toggle('blocked', !!shot?.blocked);
    label.textContent = !active
      ? ''
      : shot?.blocked
        ? '遮挡'
        : shot?.target
          ? shot.locked
            ? '锁定'
            : shot.assisted
              ? '辅助命中'
              : '命中路径'
          : '';
    label.style.left = x + 'px';
    label.style.top = y + 24 + 'px';
    if (this.hitPoint && now < this.hitUntil) {
      const p = this.hitPoint.clone().project(g.world.camera),
        marker = document.getElementById('hitmarker');
      marker.style.left = rect.left + ((p.x + 1) * rect.width) / 2 + 'px';
      marker.style.top = rect.top + ((1 - p.y) * rect.height) / 2 + 'px';
    }
    const dash = document.getElementById('dash-status'),
      ready = g.cooldowns.dash <= 0 && g.energy >= g.dashCost();
    dash.classList.toggle('hidden', !g.playing || !!g.arrival);
    dash.classList.toggle('ready', ready);
    dash.querySelector('span').textContent =
      g.dashTime > 0
        ? '推进中 · 可转向'
        : ready
          ? '冲刺就绪'
          : g.energy < g.dashCost()
            ? '能源恢复中'
            : g.cooldowns.dash.toFixed(1) + 's';
    dash.querySelector('i').style.transform =
      `scaleX(${Math.min(1, 1 - g.cooldowns.dash / 0.28, g.energy / g.dashCost())})`;
  }
  observeModals() {
    new MutationObserver(() => {
      const modal = document.querySelector('.modal');
      document.getElementById('menu').inert = !!modal;
      document.getElementById('hud').inert = !!modal;
      if (!modal) return;
      if (this.ui.modal === 'settings' && !modal.querySelector('.save-tools')) {
        const tools = document.createElement('div');
        tools.className = 'save-tools';
        tools.innerHTML =
          '<span>旅程备份<small>存档只保存在此浏览器。可导出到文件留存。</small></span><div><button class="secondary" data-backup="export">导出存档 ↓</button><button class="secondary" data-backup="import">导入存档 ↑</button></div>';
        modal.querySelector('.settings-list').after(tools);
      }
    }).observe(document.getElementById('modal-root'), { childList: true });
  }
  attachFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    document.body.appendChild(input);
    document.addEventListener('click', (event) => {
      const action = event.target.closest('[data-backup]')?.dataset.backup;
      if (!action) return;
      if (action === 'diagnostics') {
        const report = {
          version: __APP_VERSION__,
          mode: this.game.mode,
          quality: this.game.settings.quality,
          storageAvailable: storage.available,
          lastSaveSucceeded: this.game.lastSaveSucceeded ?? null,
          viewport: { width: innerWidth, height: innerHeight },
          webgl: 2,
        };
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'alien-body-diagnostics.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else if (action === 'export') {
        const data = JSON.stringify(this.game.state, null, 2),
          url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = '异星之躯-旅程备份.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        this.ui.toast('旅程已导出', '将文件保存好，之后可以从设置中恢复');
      } else if (action === 'import') input.click();
      else if (action === 'restore' && this.pendingSave) {
        this.game.state = this.pendingSave;
        this.pendingSave = null;
        this.game.start(false);
        this.ui.toast(
          this.game.lastSaveSucceeded ? '旅程已恢复并保存' : '旅程已在本次会话恢复',
          this.game.lastSaveSucceeded ? '' : '浏览器无法保存，请保留原始备份文件',
        );
      }
    });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        if (file.size > 250000) throw new Error();
        const save = validateSave(JSON.parse(await file.text()));
        if (!save) throw new Error();
        this.pendingSave = save;
        this.ui.showModal(
          'import',
          '恢复这段旅程？',
          `<p class="modal-intro">这份备份记录了 ${save.chapters.filter((c) => c.completed).length} 个已完成的文明与 ${Math.floor(save.playTime / 60)} 分钟旅程。恢复后将替换当前进度；原进度会保留为自动备份。</p><button class="primary wide" data-backup="restore">恢复备份 ↗</button><button class="secondary wide" data-action="close">保留当前旅程</button>`,
        );
      } catch {
        this.ui.toast('无法读取这份存档', '请选择由游戏导出的有效 JSON 备份');
      }
    });
  }
}
