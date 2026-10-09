import * as T from 'three';
import { MODULES } from './data.js';
import { ABILITY_INFO, abilityState } from './guidance.js';

const UP = new T.Vector3(0, 1, 0);
export class AbilityEffects {
  constructor(game) {
    this.game = game;
    this.effects = [];
    this.preview = null;
  }
  clear() {
    for (const effect of this.effects) this.remove(effect);
    this.effects = [];
    if (this.preview) this.remove(this.preview);
    this.preview = null;
  }
  remove(effect) {
    effect.group.removeFromParent();
    for (const material of effect.materials) material.dispose();
  }
  create(id, origin, duration) {
    const group = new T.Group();
    group.position.copy(origin);
    this.game.world.root.add(group);
    return { id, group, materials: [], parts: [], elapsed: 0, duration };
  }
  mesh(effect, type, args, color, opacity = 0.8) {
    const material = new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
    });
    const mesh = new T.Mesh(this.game.world.geo(type, args), material);
    effect.group.add(mesh);
    effect.materials.push(material);
    material.userData.opacity = opacity;
    return mesh;
  }
  ring(effect, radius, height = 0, opacity = 0.65) {
    const mesh = this.mesh(
      effect,
      'RingGeometry',
      [0.985, 1, 64],
      MODULES[effect.id].color,
      opacity,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = height;
    mesh.scale.setScalar(radius);
    return mesh;
  }
  cast({ id, origin, destination, targets = [] }) {
    if (id === 'time')
      this.effects = this.effects.filter((effect) => {
        if (effect.id !== 'time') return true;
        this.remove(effect);
        return false;
      });
    if (this.effects.length >= 8) this.remove(this.effects.shift());
    const reduced = this.game.settings.reducedMotion,
      low = this.game.settings.quality === 'low';
    const e = this.create(
      id,
      origin,
      id === 'time' ? 6 : reduced ? 0.45 : id === 'phase' ? 0.75 : 1.1,
    );
    e.reduced = reduced;
    e.destination = destination.clone();
    const radius = ABILITY_INFO[id].range;
    if (id === 'phase') {
      e.group.position.set(0, 0, 0);
      const dir = destination.clone().sub(origin);
      dir.y = 0;
      if (!dir.lengthSq()) dir.set(0, 0, -1);
      dir.normalize();
      for (const point of [origin, destination]) {
        const portal = this.ring(e, 1.5, 0, 0.8);
        portal.position.copy(point).addScaledVector(UP, 1.5);
        portal.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir);
        e.parts.push({ mesh: portal, kind: 'portal' });
      }
      const impact = this.ring(e, 12, 0.12, 0.55);
      impact.position.set(destination.x, 0.12, destination.z);
      e.parts.push({ mesh: impact, kind: 'expand', radius: 12 });
      if (!reduced)
        for (let i = 0; i < (low ? 5 : 12); i++) {
          const mesh = this.mesh(e, 'OctahedronGeometry', [0.12, 0], MODULES[id].color);
          mesh.position
            .copy(origin)
            .lerp(destination, i / (low ? 4 : 11))
            .addScaledVector(UP, 0.8 + (i % 3) * 0.5);
          e.parts.push({ mesh, kind: 'shard', index: i });
        }
    } else {
      e.group.position.y = origin.y + 0.12;
      const outer = this.ring(e, radius, 0, 0.55);
      e.parts.push({ mesh: outer, kind: id === 'anchor' ? 'contract' : 'expand', radius });
      if (id === 'anchor') {
        for (const point of targets.slice(0, low ? 4 : 9)) {
          const start = point.clone().sub(e.group.position).addScaledVector(UP, 1.3),
            end = new T.Vector3(0, 1.5, 0);
          const beam = this.mesh(
            e,
            'CylinderGeometry',
            [0.025, 0.025, 1, 6],
            MODULES[id].color,
            0.65,
          );
          const delta = end.clone().sub(start);
          beam.scale.y = delta.length();
          beam.position.copy(start).add(end).multiplyScalar(0.5);
          beam.quaternion.setFromUnitVectors(UP, delta.normalize());
          if (!reduced) {
            const mote = this.mesh(e, 'OctahedronGeometry', [0.16, 0], '#e5fff2');
            e.parts.push({ mesh: mote, kind: 'pull', start, end });
          }
        }
        for (let i = 0; i < (reduced ? 1 : 3); i++) {
          const ring = this.ring(e, 1.4 + i * 0.35, 1 + i * 0.32);
          e.parts.push({ mesh: ring, kind: 'orbit', index: i });
        }
      } else if (id === 'bloom') {
        for (let i = 0; i < (reduced ? 1 : 3); i++) {
          const ring = this.ring(e, 1.1 + i * 0.35, 0.3 + i * 0.6, 0.5);
          e.parts.push({ mesh: ring, kind: 'rise', index: i });
        }
        if (!reduced)
          for (let i = 0; i < (low ? 8 : 18); i++) {
            const mesh = this.mesh(
              e,
              'OctahedronGeometry',
              [0.08, 0],
              i % 2 ? '#e2ffc4' : MODULES[id].color,
            );
            e.parts.push({ mesh, kind: 'bloom', index: i });
          }
      } else {
        // The small clock follows the caster for the full global slow duration.
        outer.scale.setScalar(3);
        e.parts = [];
        for (let i = 0; i < 12; i++) {
          const mesh = this.mesh(e, 'BoxGeometry', [0.06, 0.06, 0.35], MODULES[id].color, 0.7);
          const a = (i * Math.PI) / 6;
          mesh.position.set(Math.sin(a) * 2.8, 0.02, Math.cos(a) * 2.8);
          mesh.rotation.y = a;
        }
        const orbit = this.ring(e, 1.7, 1.4, 0.35);
        orbit.rotation.x = 0.5;
        e.parts.push({ mesh: orbit, kind: 'clock' });
      }
    }
    this.effects.push(e);
  }
  update(dt) {
    const g = this.game;
    this.updatePreview();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.elapsed += dt;
      if (e.elapsed >= e.duration) {
        this.remove(e);
        this.effects.splice(i, 1);
        continue;
      }
      const t = e.elapsed / e.duration,
        fade = e.id === 'time' ? Math.min(1, (e.duration - e.elapsed) * 2) : 1 - t;
      for (const material of e.materials) material.opacity = material.userData.opacity * fade;
      if (e.id === 'time') {
        e.group.position.copy(g.player.position);
        e.group.position.y += 0.12;
      }
      if (e.reduced || g.settings.reducedMotion) continue;
      for (const p of e.parts) {
        if (p.kind === 'expand')
          p.mesh.scale.setScalar(p.radius * (0.12 + 0.88 * Math.min(1, t * 2)));
        if (p.kind === 'contract') p.mesh.scale.setScalar(Math.max(0.8, p.radius * (1 - t)));
        if (p.kind === 'pull') p.mesh.position.copy(p.start).lerp(p.end, Math.min(1, t * 1.5));
        if (p.kind === 'orbit') p.mesh.rotation.set(0.4 + p.index * 0.6, e.elapsed * 3, p.index);
        if (p.kind === 'rise') {
          p.mesh.position.y = 0.3 + p.index * 0.5 + t * 2;
          p.mesh.scale.setScalar(1.1 + p.index * 0.35 + t);
        }
        if (p.kind === 'bloom') {
          const a = p.index * 2.4 + t * 3,
            r = 1.2 + (p.index % 3) * 0.45;
          p.mesh.position.set(
            Math.sin(a) * r,
            0.2 + (p.index % 5) * 0.28 + t * 2.5,
            Math.cos(a) * r,
          );
        }
        if (p.kind === 'clock') p.mesh.rotation.z += dt * 0.8;
        if (p.kind === 'portal') p.mesh.scale.setScalar(1.5 + Math.sin(t * Math.PI) * 0.5);
        if (p.kind === 'shard') {
          p.mesh.rotation.y += dt * 3;
          p.mesh.position.y += dt * 0.6;
        }
      }
    }
  }
  updatePreview() {
    const g = this.game,
      id = g.state.activeModule;
    const show =
      g.playing &&
      !g.arrival &&
      g.keys.has('KeyX') &&
      g.state.modules.includes(id) &&
      !!MODULES[id];
    if (!show) {
      if (this.preview) this.preview.group.visible = false;
      return;
    }
    if (this.preview?.id !== id) {
      if (this.preview) this.remove(this.preview);
      this.preview = this.create(id, new T.Vector3(), Infinity);
      this.preview.ring = this.ring(this.preview, ABILITY_INFO[id].range, 0, 0.5);
    }
    const e = this.preview;
    e.group.visible = true;
    const point = id === 'phase' ? g.phaseDestination() : g.player.position;
    e.group.position.set(point.x, 0.14, point.z);
    e.ring.material.color.set(abilityState(g).ready ? MODULES[id].color : '#efab80');
  }
}
