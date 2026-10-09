import { MODULES } from './data.js';
import { ABILITY_INFO, abilityState, taskGuidance } from './guidance.js';
import './guidance.css';

export class GuidanceHUD {
  constructor(game) {
    this.game = game;
    this.feedbackLeft = 0;
    this.taskLeft = 0;
    this.previousCooldown = 0;
    document
      .querySelector('.mission')
      .insertAdjacentHTML(
        'beforeend',
        '<div id="task-action"><kbd></kbd><span></span></div><div id="task-progress"></div><div id="task-update" role="status"></div>',
      );
    document
      .getElementById('hud')
      .insertAdjacentHTML(
        'beforeend',
        `<section id="skill-card"><header><div><small>身体模块</small><strong id="skill-name"></strong></div><kbd>F</kbd></header><p id="skill-description"></p><div class="skill-state"><span id="skill-status"></span><small>消耗 30 能源</small></div><div class="skill-charge"><i></i></div><footer><span>1—4 切换</span><span>按住 X 查看范围</span></footer><div id="skill-active"></div></section><div id="ability-feedback" role="status"><strong></strong><span></span></div>`,
      );
    game.on('ability-cast', (event) => this.cast(event));
    game.on('ability-blocked', (status) => this.feedback(status.text, status.help, true));
    game.on('loaded', () => {
      this.feedbackLeft = 0;
      this.taskLeft = 0;
      this.previousCooldown = 0;
      this.stage = game.cs?.stage;
    });
    game.on('objective', () => {
      if (this.stage !== game.cs?.stage) {
        this.stage = game.cs?.stage;
        this.taskLeft = 2.4;
        document.getElementById('task-update').textContent = '目标更新 · ' + game.objective().text;
      }
    });
    game.on('frame', () => this.frame());
  }
  feedback(title, detail, blocked = false) {
    const node = document.getElementById('ability-feedback');
    node.querySelector('strong').textContent = title;
    node.querySelector('span').textContent = detail;
    node.classList.toggle('blocked', blocked);
    this.feedbackLeft = 2.2;
  }
  cast({ id, affected, healed, origin, destination, opened }) {
    const detail = opened
      ? '通路已连接 · 新路线已开启'
      : id === 'anchor'
        ? `牵引 ${affected} 个目标 · 打断并暴露核心`
        : id === 'bloom'
          ? `恢复 ${Math.round(healed)} 耐久 · 瘫痪 ${affected} 个目标`
          : id === 'time'
            ? '敌人与弹丸减速 6 秒 · 自身行动不受影响'
            : `折跃 ${Math.round(origin.distanceTo(destination))} m · 冲击 ${affected} 个目标`;
    this.feedback(MODULES[id].name + ' · 已释放', detail);
  }
  frame() {
    const g = this.game,
      now = performance.now(),
      dt = g.playing ? Math.min(0.05, (now - (this.last || now)) / 1000) : 0;
    this.last = now;
    this.feedbackLeft = Math.max(0, this.feedbackLeft - dt);
    this.taskLeft = Math.max(0, this.taskLeft - dt);
    const visible = g.playing && !g.arrival,
      id = g.state.activeModule,
      module = MODULES[id],
      owned = module && g.state.modules.includes(id),
      status = abilityState(g);
    const card = document.getElementById('skill-card');
    card.classList.toggle('hidden', !visible);
    card.classList.toggle('ready', status.ready);
    card.classList.toggle('blocked', !status.ready && status.reason !== 'cooldown');
    card.style.setProperty('--skill-color', owned ? module.color : '#94aaa5');
    document.getElementById('skill-name').textContent = owned ? module.name : '等待身体模块';
    document.getElementById('skill-description').textContent = owned
      ? g.keys.has('KeyX')
        ? ABILITY_INFO[id].preview
        : ABILITY_INFO[id].effect
      : '完成维护舱任务后解锁主动能力';
    document.getElementById('skill-status').textContent = status.text;
    const duration = g.state.chapters[2].helped ? 5 : 6;
    card.querySelector('.skill-charge i').style.transform =
      `scaleX(${owned ? Math.max(0, Math.min(1, 1 - g.cooldowns.ability / duration, g.energy / 30)) : 0})`;
    document.getElementById('skill-active').textContent =
      g.timeSlow > 0 ? `◷ 时差场生效 · ${g.timeSlow.toFixed(1)}s` : '';
    if (
      this.previousCooldown > 0 &&
      g.cooldowns.ability === 0 &&
      status.ready &&
      visible &&
      this.feedbackLeft === 0
    )
      this.feedback(module.name + ' · 再次就绪', '按 F 释放 · 30 能源');
    this.previousCooldown = g.cooldowns.ability;
    const feedback = document.getElementById('ability-feedback');
    feedback.classList.toggle('visible', visible && this.feedbackLeft > 0);
    document.body.classList.toggle('skill-feedback', visible && this.feedbackLeft > 0);
    const task = taskGuidance(g),
      action = document.getElementById('task-action');
    action.querySelector('kbd').textContent = task.key;
    action.querySelector('span').textContent = task.action;
    document.getElementById('task-progress').textContent = task.progress;
    document
      .getElementById('task-update')
      .classList.toggle('visible', visible && this.taskLeft > 0);
    // Modules share one cooldown; only the selected slot displays its countdown.
    document.querySelectorAll('.module-slot').forEach((slot) => {
      const selected = slot.dataset.action === 'module-' + id;
      slot.classList.toggle('cooling', selected && g.cooldowns.ability > 0);
      slot.setAttribute(
        'aria-label',
        slot.disabled
          ? '尚未解锁的模块'
          : slot.textContent.trim() + (selected ? ' · ' + status.text : ''),
      );
    });
  }
}
