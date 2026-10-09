import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardContains } from '../src/encounters.js';
import { newState, validateSave } from '../src/state.js';

test('rotated beam collision follows the displayed lane and allows jumping', () => {
  const lane = { kind: 'line', x: 10, z: 20, angle: Math.PI / 2, width: 2, length: 20, height: 2 };
  assert.equal(hazardContains(lane, 18, 0, 20), true);
  assert.equal(hazardContains(lane, 10, 0, 25), false);
  assert.equal(hazardContains(lane, 18, 2.1, 20), false);
});
test('expanding waves leave a safe interior and seed impact uses a circle', () => {
  const wave = { kind: 'ring', x: 0, z: 0, radius: 10, height: 1.4 };
  assert.equal(hazardContains(wave, 10, 0, 0), true);
  assert.equal(hazardContains(wave, 0, 0, 0), false);
  assert.equal(hazardContains(wave, 10, 1.5, 0), false);
  assert.equal(hazardContains({ ...wave, kind: 'disk', radius: 2 }, 2, 0, 2), false);
});
test('old checkpoints migrate and story consequences survive save validation', () => {
  const state = newState();
  state.chapters[0].stage = 3;
  state.chapters[0].helped = true;
  assert.equal(validateSave(state).chapters[0].helped, true);
  delete state.chapters[0].helped;
  assert.equal(validateSave(state).chapters[0].helped, false);
  state.chapters[2].helped = true;
  assert.equal(validateSave(state).chapters[2].helped, false);
});
