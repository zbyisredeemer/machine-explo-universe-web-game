import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { abilityState, taskGuidance, interactionHint } from '../src/guidance.js';
const game = () => ({
  state: { modules: ['anchor', 'bloom'], activeModule: 'anchor' },
  player: { position: new T.Vector3(0, 0, -62) },
  chapter: { module: 'anchor', moduleName: '重力锚', id: 0 },
  cs: { stage: 3 },
  cooldowns: { ability: 0 },
  energy: 100,
  actors: [],
  objective: () => ({ text: '测试任务', target: { x: 0, z: -62 }, name: '测试目标' }),
});
test('ability HUD and cast guard distinguish missing, wrong, cooldown, energy and ready', () => {
  const g = game();
  assert.equal(abilityState(g).ready, true);
  g.state.activeModule = 'phase';
  assert.equal(abilityState(g).reason, 'missing');
  g.state.activeModule = 'bloom';
  assert.equal(abilityState(g).reason, 'wrong');
  g.state.activeModule = 'anchor';
  g.cooldowns.ability = 0.8;
  assert.equal(abilityState(g).reason, 'cooldown');
  g.cooldowns.ability = 0;
  g.energy = 29.5;
  assert.equal(abilityState(g).reason, 'energy');
  g.energy = 30;
  assert.equal(abilityState(g).ready, true);
});
test('gate guidance uses the matching module key then F, never the generic E prompt', () => {
  const g = game();
  g.state.activeModule = 'bloom';
  const gate = { id: 'gate', label: '重力锚点' };
  assert.equal(taskGuidance(g).key, '1');
  assert.equal(interactionHint(g, gate).key, '1');
  g.state.activeModule = 'anchor';
  assert.equal(interactionHint(g, gate).key, 'F');
  g.energy = 0;
  assert.equal(interactionHint(g, gate).blocked, true);
  g.player.position.z = 0;
  assert.match(taskGuidance(g).detail, /靠近/);
});
test('tasks prioritize live shield beacons, update counts and return to the device after combat', () => {
  const g = game();
  g.cs.stage = 1;
  g.actors = [
    { id: 'relay-0', hp: 30, type: 'cutter', mesh: { position: new T.Vector3(0, 0, -61) } },
    { id: 'relay-2', hp: 20, type: 'beacon', mesh: { position: new T.Vector3(10, 0, -30) } },
  ];
  assert.equal(taskGuidance(g).target, g.actors[1].mesh.position);
  assert.match(taskGuidance(g).progress, /1 \/ 3/);
  g.actors[1].hp = 0;
  assert.equal(taskGuidance(g).target, g.actors[0].mesh.position);
  g.actors[0].hp = 0;
  assert.equal(taskGuidance(g).key, 'E');
  assert.match(taskGuidance(g).detail, /中继/);
});
