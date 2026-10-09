import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { solveLeg } from '../src/robot-motion.js';
test('leg IK preserves both links, reaches a planted ankle and keeps its sole level', () => {
  const hip = new T.Vector3(0.235, 1.35, 0),
    target = new T.Vector3(0.235, 0.165, -0.4),
    pose = solveLeg(hip, target);
  assert.ok(Math.abs(pose.knee.distanceTo(hip) - 0.65) < 1e-8);
  assert.ok(Math.abs(pose.ankle.distanceTo(pose.knee) - 0.65) < 1e-8);
  assert.ok(pose.ankle.distanceTo(target) < 1e-8);
  const footRotation = pose.upper.clone().multiply(pose.lower).multiply(pose.foot);
  assert.ok(
    new T.Vector3(0, 1, 0).applyQuaternion(footRotation).distanceTo(new T.Vector3(0, 1, 0)) < 1e-8,
  );
});
test('unreachable foot targets clamp to valid geometry without NaN', () => {
  for (const target of [new T.Vector3(0, -10, 0), new T.Vector3(0, 0, 0)]) {
    const pose = solveLeg(new T.Vector3(), target);
    assert.ok(pose.ankle.length() <= 1.3);
    assert.ok(pose.upper.toArray().every(Number.isFinite));
  }
});
