import * as T from 'three';

export const ATTACKS = [
  ['熔炉切线', '离开橙色轨道 · 攻击后核心散热'],
  ['根网萌发', '避开种子落点 · 共生核心可中断蓄能'],
  ['时间涟漪', '跳过扩散环 · 时差模块能减慢波前'],
  ['交叉折光', '离开交叉光带 · 折跃穿过危险区域'],
];

export function hazardContains(h, x, y, z) {
  if (y > h.height) return false;
  const dx = x - h.x,
    dz = z - h.z;
  if (h.kind === 'ring') return Math.abs(Math.hypot(dx, dz) - h.radius) < 1.2;
  if (h.kind === 'disk') return dx * dx + dz * dz < (h.radius + 0.55) ** 2;
  const along = dx * Math.sin(h.angle) + dz * Math.cos(h.angle);
  const across = dx * Math.cos(h.angle) - dz * Math.sin(h.angle);
  return Math.abs(along) < h.length / 2 + 0.5 && Math.abs(across) < h.width / 2 + 0.5;
}

export class Encounters {
  constructor(game) {
    this.game = game;
    this.hazards = [];
  }
  clear() {
    for (const h of this.hazards) this.game.world.root.remove(h.group);
    this.hazards = [];
  }
  cancel(owner) {
    for (const h of this.hazards) if (h.owner === owner && h.elapsed < h.delay) h.done = true;
  }
  prepare(e, index) {
    const g = this.game,
      p = g.player.position,
      pos = e.mesh.position;
    const angle = Math.atan2(p.x - pos.x, p.z - pos.z),
      delay = 1.25;
    e.windup = delay;
    e.attackName = ATTACKS[index][0];
    g.emit('telegraph', { title: e.attackName, body: ATTACKS[index][1] });
    const common = { owner: e, delay, duration: 0.5, height: 2, damage: 23 };
    if (index === 0) {
      for (const offset of [-7, 0, 7])
        this.add({
          ...common,
          kind: 'line',
          x: pos.x + Math.sin(angle) * 12 + Math.cos(angle) * offset,
          z: pos.z + Math.cos(angle) * 12 - Math.sin(angle) * offset,
          angle,
          width: e.armBroken ? 1.7 : 2.6,
          length: 34,
        });
    } else if (index === 1) {
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI) / 2;
        this.add({
          ...common,
          kind: 'disk',
          x: p.x + (i ? Math.cos(a) * 7 : 0),
          z: p.z + (i ? Math.sin(a) * 7 : 0),
          radius: 2.8,
          delay: delay + i * 0.16,
          duration: 1,
          height: 2.5,
        });
      }
    } else if (index === 2) {
      this.add({
        ...common,
        kind: 'ring',
        x: pos.x,
        z: pos.z,
        radius: 2,
        duration: 2.6,
        height: 1.4,
        damage: 25,
      });
      if (e.hp < e.maxHp * 0.5)
        this.add({
          ...common,
          kind: 'ring',
          x: pos.x,
          z: pos.z,
          radius: 2,
          delay: delay + 0.7,
          duration: 2.6,
          height: 1.4,
        });
    } else {
      for (const a of [0, Math.PI / 2])
        this.add({
          ...common,
          kind: 'line',
          x: p.x,
          z: p.z,
          angle: a + e.attacks * 0.35,
          width: 2.8,
          length: 40,
          duration: 0.6,
        });
    }
  }
  add(data) {
    const w = this.game.world,
      group = new T.Group();
    group.position.set(data.x, 0.09, data.z);
    w.root.add(group);
    const color = '#ffb06c';
    let mesh;
    if (data.kind === 'line') {
      group.rotation.y = data.angle;
      mesh = w.box([1, 1, 1], [0, 0, 0], color, group, 0.7, 0.2);
      mesh.scale.set(data.width, 0.07, data.length);
      for (const side of [-1, 1])
        w.box([0.06, 0.06, data.length], [(side * data.width) / 2, 0.03, 0], color, group, 1.5);
      for (let z = -data.length / 2 + 1; z < data.length / 2; z += 2)
        w.box([data.width * 0.7, 0.03, 0.09], [0, 0.05, z], color, group, 0.6);
    } else {
      mesh = w.mesh('CylinderGeometry', [1, 1, 0.025, 48], color, [0, 0, 0], group, 0.5, 0.2);
      mesh.scale.set(data.radius, 1, data.radius);
      const edge = w.ring(1, 0.035, color, [0, 0.05, 0], group, 1.5);
      edge.rotation.x = Math.PI / 2;
      edge.scale.setScalar(data.radius);
      group.userData.edge = edge;
    }
    this.hazards.push({ ...data, group, mesh, elapsed: 0, hit: false, done: false });
  }
  update(dt) {
    const g = this.game,
      p = g.player.position;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.elapsed += dt;
      if (h.owner.hp <= 0 || h.done || h.elapsed > h.delay + h.duration) {
        g.world.root.remove(h.group);
        this.hazards.splice(i, 1);
        continue;
      }
      const active = h.elapsed >= h.delay;
      if (active && !h.triggered) {
        h.triggered = true;
        g.sound.play('impact');
        if (h.kind === 'disk') g.world.burst(new T.Vector3(h.x, 0, h.z), '#d7eeb2', 8, 1.2);
      }
      if (h.kind === 'ring') {
        h.radius = active ? 2 + (h.elapsed - h.delay) * 12 : 2;
        h.mesh.visible = false;
        h.group.userData.edge.scale.setScalar(h.radius);
        h.group.position.y = active ? 0.55 : 0.1;
      } else {
        h.mesh.scale.y = h.kind === 'disk' ? (active ? 80 : 1) : active ? 1.5 : 0.06;
        h.group.position.y = active ? (h.kind === 'disk' ? 0.6 : 0.45) : 0.09;
        // Boundary lines stay stable; only the interior pulses during countdown.
        h.mesh.visible = active || Math.sin(h.elapsed * 20) > 0.1;
      }
      if (active && !h.hit && hazardContains(h, p.x, p.y, p.z)) {
        g.hurt(h.damage);
        h.hit = true;
      }
    }
  }
}
