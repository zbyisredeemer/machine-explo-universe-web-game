import * as T from 'three';
import { targetScore } from './mechanics.js';

const UP = new T.Vector3(0, 1, 0);
export const aimCenter = (enemy) =>
  enemy.mesh.position.clone().addScaledVector(UP, enemy.boss ? 3 : 1.5);
const radius = (enemy) => (enemy.boss ? 2.8 : 1.05);

// Both the camera preview and the muzzle use this first-hit query. Assistance
// changes the intended direction, never the visibility or damage rules.
export function traceShot(origin, direction, range, enemies, obstacles = []) {
  const ray = new T.Ray(origin, direction.clone().normalize());
  let point = ray.at(range, new T.Vector3()),
    distance = range,
    target = null,
    blocked = false;
  const caster = new T.Raycaster(origin, ray.direction, 0, range);
  const wall = caster.intersectObjects(obstacles, false).find((hit) => hit.object.visible);
  if (wall) {
    point.copy(wall.point);
    distance = wall.distance;
    blocked = true;
  }
  for (const enemy of enemies) {
    const sphere = new T.Sphere(aimCenter(enemy), radius(enemy));
    // At point-blank range the origin may already be inside a body. The first
    // contact is zero, not the exit surface beyond this short aim segment.
    const hit = sphere.containsPoint(origin)
      ? origin.clone()
      : ray.intersectSphere(sphere, new T.Vector3());
    if (hit && hit.distanceTo(origin) < distance) {
      point.copy(hit);
      distance = hit.distanceTo(origin);
      target = enemy;
      blocked = false;
    }
  }
  return { point, target, blocked, distance };
}

export class Aim {
  constructor(game) {
    this.game = game;
    this.pointer = new T.Vector2();
    this.reset();
  }
  reset() {
    this.pointer.set(0, 0);
    this.mouse = false;
    this.solution = null;
    this.kick = 0;
  }
  setPointer(event) {
    const rect = this.game.world.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    );
    this.mouse = true;
  }
  enemies() {
    const g = this.game;
    return g.actors.filter((e) => e.hp > 0 && (!e.boss || g.cs?.stage >= 4));
  }
  trace(origin, direction, range = 65) {
    return traceShot(origin, direction, range, this.enemies(), this.game.world.shotObstacles);
  }
  visible(enemy, origin) {
    const delta = aimCenter(enemy).sub(origin);
    return this.trace(origin, delta, delta.length() + 0.01).target === enemy;
  }
  select(range = 48) {
    const g = this.game,
      camera = g.world.camera,
      origin = g.player.position.clone().addScaledVector(UP, 1.7);
    const forward = new T.Vector3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw));
    const canvas = g.world.renderer.domElement,
      rect = canvas.getBoundingClientRect();
    let best = null,
      score = Infinity;
    for (const enemy of this.enemies()) {
      const delta = aimCenter(enemy).sub(origin),
        distance = delta.length();
      if (distance > range) continue;
      let value;
      if (this.mouse) {
        const screen = aimCenter(enemy).project(camera);
        if (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1)
          continue;
        value = Math.hypot(
          ((screen.x - this.pointer.x) * rect.width) / 2,
          ((screen.y - this.pointer.y) * rect.height) / 2,
        );
        // A small screen-space cone: nearby enemies outside the cursor cannot steal a shot.
        if (value > Math.min(rect.width, rect.height) * 0.065) continue;
      } else {
        delta.y = 0;
        value = targetScore(distance, delta.normalize().dot(forward), g.settings.aimAssist);
      }
      if (value < score && this.visible(enemy, origin)) {
        best = enemy;
        score = value;
      }
    }
    return best;
  }
  resolve() {
    const g = this.game,
      camera = g.world.camera;
    camera.updateMatrixWorld(true);
    const locked = g.lockedTarget?.hp > 0 ? g.lockedTarget : null;
    const selected = locked || (g.settings.aimAssist ? this.select(46) : null);
    const ray = new T.Raycaster();
    ray.setFromCamera(this.mouse ? this.pointer : new T.Vector2(), camera);
    let intended = selected
      ? aimCenter(selected)
      : this.trace(ray.ray.origin, ray.ray.direction, 90).point;
    // Resolve the muzzle segment as well: a camera can see around cover while
    // the barrel is still behind it.
    g.player.updateMatrixWorld(true);
    const from = g.player.userData.rig.muzzle.getWorldPosition(new T.Vector3());
    const delta = intended.clone().sub(from);
    const result = this.trace(from, delta, Math.min(65, delta.length() + 0.02));
    return { ...result, from, intended, assisted: !!selected, locked: !!locked };
  }
  update(dt) {
    this.kick *= Math.exp(-22 * dt);
    this.solution = this.resolve();
  }
}
