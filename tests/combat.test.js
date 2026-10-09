import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { traceShot } from '../src/aim.js';
import { moveVelocity } from '../src/mechanics.js';

const enemy = (x, z) => ({ hp: 100, mesh: { position: new T.Vector3(x, 0, z) } });
test('shots hit the first body along the ray, not a nearby off-axis enemy', () => {
  const front = enemy(0, -12),
    back = enemy(0, -22),
    side = enemy(4, -5);
  const hit = traceShot(new T.Vector3(0, 1.5, 0), new T.Vector3(0, 0, -1), 65, [side, back, front]);
  assert.equal(hit.target, front);
  assert.ok(hit.point.z > -12);
  assert.equal(
    traceShot(new T.Vector3(0, 1.5, 0), new T.Vector3(0, 0, -1), 65, [side]).target,
    null,
  );
});
test('solid cover stops a shot before a target, including muzzle parallax', () => {
  const wall = new T.Mesh(new T.BoxGeometry(2, 4, 1), new T.MeshBasicMaterial());
  wall.position.set(0, 2, -6);
  wall.updateMatrixWorld(true);
  const target = enemy(0, -12),
    hit = traceShot(new T.Vector3(0, 1.5, 0), new T.Vector3(0, 0, -1), 65, [target], [wall]);
  assert.equal(hit.target, null);
  assert.equal(hit.blocked, true);
  assert.equal(hit.point.z, -5.5);
  const camera = new T.Vector3(5, 3, 0),
    direction = new T.Vector3(0, 1.5, -12).sub(camera);
  assert.equal(traceShot(camera, direction, 65, [target], [wall]).target, target);
  wall.geometry.dispose();
  wall.material.dispose();
});
test('shots respect range and cannot hit behind the barrel', () => {
  const origin = new T.Vector3(0, 1.5, 0),
    direction = new T.Vector3(0, 0, -1);
  assert.equal(traceShot(origin, direction, 10, [enemy(0, -15), enemy(0, 4)]).target, null);
});
test('point-blank queries register contact when their origin is inside a target', () => {
  const target = enemy(0.25, -0.1),
    origin = new T.Vector3(0, 1.7, 0);
  const result = traceShot(origin, new T.Vector3(0.25, -0.2, -0.1), 0.35, [target]);
  assert.equal(result.target, target);
  assert.equal(result.distance, 0);
  assert.deepEqual(result.point, origin);
});
test('running distance is consistent at 30/60/144 Hz; braking and reversing respond within 50 ms', () => {
  const distances = [30, 60, 144].map((fps) => {
    const velocity = new T.Vector3(),
      p = new T.Vector3();
    for (let i = 0; i < fps; i++)
      p.add(moveVelocity(velocity, new T.Vector3(0, 0, -1), 12, 1 / fps));
    return p.z;
  });
  assert.ok(Math.max(...distances) - Math.min(...distances) < 1e-9);
  const velocity = new T.Vector3(12, 0, 0);
  moveVelocity(velocity, new T.Vector3(-1, 0, 0), 12, 0.05);
  assert.ok(velocity.x < -10);
  const travel = moveVelocity(velocity, new T.Vector3(), 12, 0.05);
  assert.ok(velocity.length() < 0.6);
  assert.ok(travel.length() < 0.2);
});
