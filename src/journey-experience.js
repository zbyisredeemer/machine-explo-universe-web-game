import { TRAINING, recordTraining } from './expedition.js';
import './journey.css';

export class JourneyExperience {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.walked = 0;
    this.lastPosition = null;
    document.getElementById('hud').insertAdjacentHTML(
      'beforeend',
      `
      <aside id="field-training" class="field-training hidden" aria-label="机体训练"><header><small>初次启动 / <span id="training-count"></span></small><button id="dismiss-training" aria-label="跳过操作训练">×</button></header><div><kbd></kbd><strong></strong></div><p></p></aside>
      <div id="expedition-count" class="expedition-count"></div>
      <div id="encounter-result" class="encounter-result" role="status"><small></small><strong></strong><span></span></div>`,
    );
    document.getElementById('dismiss-training').onclick = () => {
      game.state.training = TRAINING.map((lesson) => lesson.id);
      game.save();
      this.frame();
    };
    game.on('training-action', (id) => this.complete(id));
    game.on('fire', () => this.complete('shoot'));
    game.on('scan', () => this.complete('scan'));
    game.on('loaded', () => {
      this.lastPosition = null;
      this.walked = 0;
      this.resultRemaining = 0;
    });
    game.on('cache-found', (result) =>
      this.result(
        '发现旅途中的余量',
        result.cache.name,
        `+${result.reward} 零件${result.complete ? ' · 本章 3 份补给已集齐（含 36 额外零件）' : ` · 本章 ${result.found} / 3`}`,
      ),
    );
    game.on('defeat', ({ boss, reward, cleared, group }) => {
      if (boss)
        this.result('GUARDIAN OFFLINE', '守卫已解除', `+${reward} 零件 · 继续追寻文明的回声`);
      else if (cleared)
        this.result(
          'AREA CLEAR',
          group === 'relay' ? '中继干扰已清除' : '维护舱已解锁',
          `+${reward} 零件 · 靠近设备按 E`,
        );
      else this.ui.toast('回收 +8 零件', '机体耐久恢复 8');
    });
    game.on('frame', () => this.frame());
  }
  complete(id) {
    const g = this.game;
    if (!g.playing || g.state.location !== 0 || g.cs.stage > 0) return;
    if (recordTraining(g.state, id)) {
      g.save();
      if (g.state.training.length === TRAINING.length)
        this.ui.toast('机体校准完成', '准备好了 · 靠近铆钉按 E，开始你的旅程');
    }
  }
  result(label, title, detail) {
    const panel = document.getElementById('encounter-result');
    panel.querySelector('small').textContent = label;
    panel.querySelector('strong').textContent = title;
    panel.querySelector('span').textContent = detail;
    this.resultRemaining = 4.5;
  }
  frame() {
    const g = this.game,
      panel = document.getElementById('field-training');
    const active = g.playing && !g.arrival;
    if (active && this.lastPosition) {
      const distance = g.player.position.distanceTo(this.lastPosition);
      if (distance < 2) this.walked += distance;
      if (this.walked > 4) this.complete('move');
    }
    this.lastPosition = g.player.position.clone();
    const lesson = TRAINING.find((item) => !g.state.training?.includes(item.id));
    const visible = active && g.state.location === 0 && g.cs.stage === 0 && !!lesson;
    panel.classList.toggle('hidden', !visible);
    if (visible) {
      panel.querySelector('kbd').textContent = lesson.key;
      panel.querySelector('strong').textContent = lesson.title;
      panel.querySelector('p').textContent = lesson.text;
      document.getElementById('training-count').textContent =
        `${g.state.training.length} / ${TRAINING.length}`;
    }
    const count = document.getElementById('expedition-count');
    count.classList.toggle('hidden', !active || !g.cs);
    count.textContent = `◇ 旅途补给 ${g.cs?.caches?.length || 0} / 3 · V 扫描`;
    if (active)
      this.resultRemaining = Math.max(
        0,
        (this.resultRemaining || 0) - Math.min(0.1, g.time - (this.lastTime ?? g.time)),
      );
    this.lastTime = g.time;
    document
      .getElementById('encounter-result')
      .classList.toggle('active', active && this.resultRemaining > 0);
  }
}
