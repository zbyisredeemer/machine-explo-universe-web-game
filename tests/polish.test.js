import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, readSave, writeSave, validateSave, SAVE_KEY, BACKUP_KEY } from '../src/state.js';
import { damp, turnToward, targetScore, projectedMarker } from '../src/mechanics.js';
const store = () => {
  const data = new Map();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};
test('a truncated primary recovers the last valid checkpoint without destroying backup', () => {
  const s = store(),
    first = newState();
  writeSave(s, first);
  const second = structuredClone(first);
  second.chapters[0].stage = 1;
  writeSave(s, second);
  s.setItem(SAVE_KEY, '{"version":1,');
  assert.equal(readSave(s).chapters[0].stage, 0);
  writeSave(s, second);
  assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).chapters[0].stage, 0);
});
test('identical saves do not rotate away the recovery checkpoint', () => {
  const s = store(),
    a = newState();
  writeSave(s, a);
  a.salvage = 25;
  writeSave(s, a);
  writeSave(s, a);
  assert.equal(JSON.parse(s.getItem(BACKUP_KEY)).salvage, 0);
});
test('malformed checkpoint fields are repaired and impossible progression is removed', () => {
  const raw = newState();
  raw.chapters[0].completed = true;
  raw.chapters[1].stage = 6;
  raw.chapters[1].completed = true;
  raw.chapters[0].killed = { filter: 'bad' };
  const fixed = validateSave(raw);
  assert.equal(fixed.unlocked, 0);
  assert.equal(fixed.chapters[1].completed, false);
  assert.deepEqual(fixed.chapters[0].killed, []);
  raw.chapters[0].stage = 4;
  raw.chapters[0].killed = ['boss', 'something'];
  assert.equal(validateSave(raw).chapters[0].stage, 5);
});
test('motion damping is stable across frame rates and angular wrap uses the short path', () => {
  let a = 0,
    b = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 10, 12, 1 / 60);
  for (let i = 0; i < 30; i++) b = damp(b, 10, 12, 1 / 30);
  assert.ok(Math.abs(a - b) < 1e-8);
  const angle = turnToward(Math.PI - 0.02, -Math.PI + 0.02, 10, 0.1);
  assert.ok(Math.abs(angle - Math.PI) < 0.04);
});
test('aim rejects distant targets behind the camera and edge markers remain visible', () => {
  assert.equal(targetScore(30, -1, true), Infinity);
  assert.ok(Number.isFinite(targetScore(4, -1, true)));
  assert.equal(targetScore(10, 0.5, false), Infinity);
  for (const p of [
    { x: 5, y: 3, z: 0.8 },
    { x: -6, y: -2, z: 2 },
  ]) {
    const m = projectedMarker(p, 1280, 800);
    assert.ok(m.x >= 70 && m.x <= 1210 && m.y >= 170 && m.y <= 630);
  }
});
