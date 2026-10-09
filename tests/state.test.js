import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newState,
  advance,
  completeChapter,
  equip,
  validateSave,
  readSave,
  writeSave,
} from '../src/state.js';

test('campaign requires sequential stages, grants modules and unlocks all four chapters', () => {
  const s = newState();
  assert.equal(advance(s, 1, 1), false);
  assert.equal(advance(s, 0, 3), false);
  for (let i = 0; i < 4; i++) {
    for (let stage = 1; stage <= 6; stage++) assert.equal(advance(s, i, stage), true);
  }
  assert.equal(s.chapters[3].completed, false);
  assert.equal(completeChapter(s, 3, 'invalid'), false);
  assert.equal(completeChapter(s, 3, 'journey'), true);
  assert.equal(s.ending, 'journey');
  assert.equal(s.modules.length, 4);
  assert.equal(s.salvage, 240);
  completeChapter(s, 3, 'share');
  assert.equal(s.salvage, 240);
});
test('equipment honors prices, unlocks and does not charge owned equipment twice', () => {
  const s = newState();
  assert.equal(equip(s, 'chassis', 'guardian'), false);
  s.salvage = 100;
  assert.equal(equip(s, 'chassis', 'guardian'), true);
  assert.equal(s.salvage, 40);
  equip(s, 'chassis', 'scout');
  equip(s, 'chassis', 'guardian');
  assert.equal(s.salvage, 40);
  assert.equal(equip(s, 'skin', 'moss'), false);
  assert.equal(equip(s, 'weapon', 'unknown'), false);
});
test('save round trip preserves meaningful world and companion states', () => {
  const s = newState();
  for (let n = 1; n <= 6; n++) advance(s, 0, n);
  s.companion = true;
  s.chapters[0].tool = true;
  s.location = 'hub';
  s.chapters[0].killed = ['relay-0'];
  const store = new Map();
  const storage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) };
  assert.equal(writeSave(storage, s), true);
  const loaded = readSave(storage);
  assert.equal(loaded.companion, true);
  assert.equal(loaded.chapters[0].tool, true);
  assert.deepEqual(loaded.chapters[0].killed, ['relay-0']);
  assert.equal(loaded.unlocked, 1);
  assert.equal(loaded.activeModule, 'anchor');
});
test('corrupt saves fail safely and impossible fields are constrained', () => {
  assert.equal(readSave({ getItem: () => '{' }), null);
  assert.equal(validateSave({ version: 9 }), null);
  assert.equal(
    writeSave(
      {
        setItem: () => {
          throw Error('quota');
        },
      },
      newState(),
    ),
    false,
  );
  const s = newState();
  s.unlocked = 999;
  s.salvage = -5;
  s.activeModule = 'phase';
  s.location = 80;
  const fixed = validateSave(s);
  assert.equal(fixed.unlocked, 0);
  assert.equal(fixed.location, 0);
  assert.equal(fixed.salvage, 0);
  assert.equal(fixed.activeModule, null);
});

test('free colour choices survive save validation while reward coatings stay gated', () => {
  for (const id of ['ivory', 'coral', 'arctic', 'cobalt', 'citrus', 'orchid']) {
    const s = newState();
    assert.equal(equip(s, 'skin', id), true);
    assert.equal(s.salvage, 0);
    const restored = validateSave(JSON.parse(JSON.stringify(s)));
    assert.equal(restored.equipment.skin, id);
  }
  const old = newState();
  old.equipment.skin = 'removed-skin';
  assert.equal(validateSave(old).equipment.skin, 'ivory');
  assert.equal(equip(old, 'skin', 'moss'), false);
  assert.equal(equip(old, 'skin', 'midnight'), false);
});
