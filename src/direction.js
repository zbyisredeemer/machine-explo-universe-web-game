import * as T from 'three';
import { SIDE_STORIES } from './exploration.js';
import './direction.css';

export class Direction {
  constructor(game) {
    this.game = game;
    document
      .getElementById('hud')
      .insertAdjacentHTML(
        'beforeend',
        `<div id="arrival-bars"><div class="arrival-caption"><small>ESTABLISHING CONTACT</small><strong></strong><button id="skip-arrival">跳过镜头 <kbd>Space</kbd></button></div></div><div id="attack-warning" role="status"><small>INCOMING</small><strong></strong><span></span></div><div id="scan-overlay"></div><div class="scan-control"><kbd>V</kbd><span id="scan-status">扫描环境</span></div><div id="signal-labels"></div><div id="side-objective"><small>身边的故事</small><strong></strong><span></span></div>`,
      );
    document.getElementById('skip-arrival').onclick = () => {
      game.arrival = null;
    };
    game.on('telegraph', ({ title, body }) => {
      const el = document.getElementById('attack-warning');
      el.querySelector('strong').textContent = title;
      el.querySelector('span').textContent = body;
      this.warningUntil = game.time + 1.8;
    });
    game.on('loaded', () => {
      this.warningUntil = 0;
    });
    game.on('frame', () => this.frame());
  }
  frame() {
    const g = this.game,
      arrival = document.getElementById('arrival-bars');
    arrival.classList.toggle('active', !!g.arrival && g.playing);
    document.body.classList.toggle('arrival-active', !!g.arrival && g.playing);
    if (g.arrival)
      arrival.querySelector('strong').textContent = g.arrival.boss
        ? g.chapter.boss
        : g.chapter.name;
    document
      .getElementById('attack-warning')
      .classList.toggle('active', g.playing && this.warningUntil > g.time && !g.arrival);
    const scan = g.exploration.scanTime > 0 && g.playing;
    document
      .getElementById('scan-overlay')
      .classList.toggle('active', scan && !g.settings.reducedMotion);
    document.getElementById('scan-status').textContent =
      g.exploration.scanCooldown > 0
        ? `扫描 ${Math.ceil(g.exploration.scanCooldown)}s`
        : '扫描环境';
    const labels = [];
    if (scan)
      for (const m of g.world.markers) {
        if (!m.group.visible) continue;
        const distance = Math.hypot(m.x - g.player.position.x, m.z - g.player.position.z);
        if (distance > 42) continue;
        const screen = new T.Vector3(m.x, 4, m.z).project(g.world.camera);
        if (screen.z > 1 || Math.abs(screen.x) > 0.95 || Math.abs(screen.y) > 0.9) continue;
        labels.push(
          `<div class="signal-label" style="left:${(screen.x + 1) * 50}%;top:${(1 - screen.y) * 50}%"><b>◇ ${m.label}</b><small>${Math.round(distance)} m / ${m.id === 'side' ? '私人信号' : '环境回声'}</small></div>`,
        );
      }
    document.getElementById('signal-labels').innerHTML = labels.join('');
    const side = document.getElementById('side-objective');
    const story = g.chapter && SIDE_STORIES[g.chapter.id],
      near = story && Math.hypot(story.x - g.player.position.x, story.z - g.player.position.z) < 24;
    side.classList.toggle('active', !!near && !g.cs?.helped && g.playing && !g.arrival);
    if (story) {
      side.querySelector('strong').textContent = story.name;
      side.querySelector('span').textContent = g.state.modules.includes(story.need)
        ? '身体已经能回应它 · 靠近按 E'
        : '一段等待回应的私人信号 · V 扫描';
    }
  }
}
