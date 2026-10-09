import * as T from 'three';
import { CACHES, claimCache } from './expedition.js';

export const SIDE_STORIES = [
  {
    name: '仍在等待的小信使',
    x: 21,
    z: -6,
    need: 'anchor',
    before: '微弱的呼叫来自一台卡住的小信使。取得重力锚后，也许能把它拉出来。',
    lines: [
      ['小信使', '我把最后一封信送到了。可收件人一直没有醒。'],
      ['你', '那就先和我一起等。'],
    ],
    after: '小信使已安置在飞船上。每次归航，它会修复你的身体；修复包容量增加 1。',
  },
  {
    name: '一盏不会熄灭的灯',
    x: -23,
    z: -34,
    need: 'bloom',
    before: '枯萎的灯蕊还残留着微弱生命信号。共生核心可以唤醒它。',
    lines: [
      ['苔', '这盏灯只在有人回家的时候开花。我们已经等了很久。'],
      ['你', '我会带一点光回去，也把这里的灯留下。'],
    ],
    after: '灯蕊重新开花。共生核心的修复量永久增加 10。',
  },
  {
    name: '迟到的合影',
    x: 23,
    z: -20,
    need: 'time',
    before: '照片停留在快门按下之前。需要时差引擎，才能等到这一瞬间发生。',
    lines: [
      ['迟', '他们在这里站了一百年，只想拍一张没有人闭眼的合影。'],
      ['你', '不用着急。我可以等。'],
    ],
    after: '快门终于落下。你学会保留余裕，模块冷却缩短 1 秒。',
  },
  {
    name: '没有收件人的回声',
    x: -23,
    z: -28,
    need: 'phase',
    before: '一段私人频率被藏在相位层里。折跃感知可以听到完整的声音。',
    lines: [
      ['回声', '如果有人听见，请替我告诉后来者：你可以不完成自己的任务。'],
      ['你', '我听见了。我会把这句话留在窗边。'],
    ],
    after: '回声已带回飞船。冲刺消耗永久降低 4 点。',
  },
];

export class Exploration {
  constructor(game) {
    this.game = game;
    this.scanTime = 0;
    this.scanCooldown = 0;
  }
  load() {
    const g = this.game,
      w = g.world;
    this.scanTime = 0;
    this.scanCooldown = 0;
    this.object = null;
    this.caches = [];
    if (!g.chapter) {
      if (g.state.chapters[0].helped) {
        const drone = w.robot('#b8c6aa', 0.45);
        drone.position.set(5, 0.4, 5);
        w.root.add(drone);
        w.animated.push({ mesh: drone, type: 'float', offset: 2 });
        w.marker('messenger', '小信使', 5, 5, '#e8c68d');
      }
      return;
    }
    for (const cache of CACHES[g.chapter.id]) {
      w.marker('cache-' + cache.id, cache.name, cache.x, cache.z, '#ffd38b');
      const box = new T.Group();
      box.position.set(cache.x, 0, cache.z);
      w.root.add(box);
      w.box([1.9, 0.25, 1.4], [0, 0.12, 0], '#15283b', box);
      w.box([1.65, 0.85, 1.15], [0, 0.65, 0], '#34455b', box);
      w.box([1.72, 0.17, 1.22], [0, 1.17, 0], '#92b3c4', box);
      for (const side of [-1, 1])
        w.box([0.12, 0.75, 1.2], [side * 0.58, 0.72, 0], '#ffd38b', box, 0.7);
      const core = w.mesh('OctahedronGeometry', [0.22, 0], '#ffe2a4', [0, 1.6, 0], box, 1.5);
      w.animated.push({ mesh: core, type: 'float', offset: cache.x });
      this.caches.push({ cache, box });
    }
    const story = SIDE_STORIES[g.chapter.id];
    w.marker('side', story.name, story.x, story.z, g.chapter.color);
    const group = new T.Group();
    group.position.set(story.x, 0, story.z);
    w.root.add(group);
    this.object = group;
    w.mesh('CylinderGeometry', [2.3, 2.5, 0.3, 24], '#344a4b', [0, 0.12, 0], group);
    if (g.chapter.id === 0) {
      const drone = w.robot('#b8c6aa', 0.55);
      drone.position.set(0, 0.2, 0);
      group.add(drone);
      for (const s of [-1, 1]) w.box([0.5, 2.3, 2], [s * 1.2, 1.1, 0], '#826c56', group);
    } else {
      const core = w.mesh('IcosahedronGeometry', [0.7, 1], g.chapter.color, [0, 1.8, 0], group, 1);
      w.animated.push({ mesh: core, type: 'float', offset: 0 });
      for (let i = 0; i < 3; i++) {
        const ring = w.ring(1 + i * 0.25, 0.04, g.chapter.color, [0, 1.8, 0], group, 0.7);
        ring.rotation.set(i * 0.6, i, 0);
      }
    }
    this.refresh();
  }
  refresh() {
    const g = this.game;
    if (!g.cs) return;
    for (const { cache, box } of this.caches) {
      const visible = g.cs.stage >= cache.stage && !g.cs.caches?.includes(cache.id);
      box.visible = visible;
      const marker = g.world.markers.find((m) => m.id === 'cache-' + cache.id);
      if (marker) marker.group.visible = visible;
    }
    const m = g.world.markers.find((x) => x.id === 'side');
    if (m) m.group.visible = !g.cs.helped;
    if (this.object) this.object.visible = !g.cs.helped;
  }
  collect(id) {
    const g = this.game;
    const result = claimCache(g.state, g.chapter.id, id);
    if (!result) return;
    this.refresh();
    g.save();
    g.sound.play('discovery');
    const p = new T.Vector3(result.cache.x, 0.8, result.cache.z);
    g.world.burst(p, '#ffd38b', g.settings.quality === 'low' ? 6 : 12, 1);
    g.emit('cache-found', result);
    g.dialog([
      [
        result.cache.name,
        result.cache.text +
          `（已回收 ${result.reward} 零件${result.complete ? '，含本章集齐奖励' : ''}）`,
      ],
    ]);
  }
  interact() {
    const g = this.game,
      story = SIDE_STORIES[g.chapter.id];
    if (g.cs.helped) return;
    if (!g.state.modules.includes(story.need)) {
      g.dialog([['环境记录', story.before]]);
      return;
    }
    g.dialog(story.lines, () => {
      g.cs.helped = true;
      g.state.salvage += 20;
      this.refresh();
      g.save();
      g.world.wave(new T.Vector3(story.x, 0, story.z), g.chapter.color, 8);
      if (g.chapter.id === 0) g.heals = Math.max(g.heals, 4);
      g.toast('留下了一点改变', story.after);
      g.emit('objective');
    });
  }
  scan() {
    const g = this.game;
    if (this.scanCooldown > 0) return;
    this.scanTime = 4;
    this.scanCooldown = 7;
    g.world.wave(g.player.position, '#a4f5e7', 36);
    g.sound.play('lock');
    g.emit('scan');
    const points = g.world.markers.filter(
      (m) =>
        m.group.visible && Math.hypot(m.x - g.player.position.x, m.z - g.player.position.z) < 42,
    );
    g.toast(
      '环境回声',
      points.length
        ? points.map((m) => m.label).join(' · ')
        : '这个方向没有新的信号，试着向遗迹深处走走',
    );
  }
  update(dt) {
    this.scanTime = Math.max(0, this.scanTime - dt);
    this.scanCooldown = Math.max(0, this.scanCooldown - dt);
  }
}
