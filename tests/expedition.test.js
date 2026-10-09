import test from 'node:test';
import assert from 'node:assert/strict';
import { CACHES, TRAINING, claimCache, recordTraining } from '../src/expedition.js';
import { newState, validateSave } from '../src/state.js';
import { Sound, SOUND_PALETTES } from '../src/audio.js';

test('discoveries require the current unlocked chapter and matching progression', () => {
  const state = newState();
  assert.equal(claimCache(state, 1, 'arrival'), null);
  assert.equal(claimCache(state, 0, 'workshop'), null);
  assert.equal(claimCache(state, 0, '__proto__'), null);
  assert.equal(state.salvage, 0);
  state.location = 'hub';
  assert.equal(claimCache(state, 0, 'arrival'), null);
});

test('cache rewards and completion bonus are granted once, including after save reload', () => {
  let state = newState();
  state.chapters[0].stage = 5;
  for (const cache of CACHES[0]) assert.ok(claimCache(state, 0, cache.id));
  assert.equal(state.salvage, 18 + 28 + 40 + 36);
  state = validateSave(JSON.parse(JSON.stringify(state)));
  for (const cache of CACHES[0]) assert.equal(claimCache(state, 0, cache.id), null);
  assert.equal(state.salvage, 122);
  assert.equal(state.chapters[0].caches.length, 3);
});

test('old saves migrate without losing progress; invalid and premature cache IDs are discarded', () => {
  const old = newState();
  old.chapters[0].stage = 1;
  delete old.training;
  delete old.chapters[0].caches;
  const restored = validateSave(old);
  assert.deepEqual(restored.chapters[0].caches, []);
  assert.equal(restored.training.length, TRAINING.length);
  old.chapters[0].caches = ['arrival', 'arrival', 'observatory', '<script>'];
  assert.deepEqual(validateSave(old).chapters[0].caches, ['arrival']);
});

test('training accepts only known actions and persists independent of action order', () => {
  const state = newState();
  assert.equal(recordTraining(state, 'dash'), true);
  assert.equal(recordTraining(state, 'dash'), false);
  assert.equal(recordTraining(state, 'fly'), false);
  recordTraining(state, 'move');
  assert.deepEqual(validateSave(state).training, ['dash', 'move']);
});

test('chapter music changes pitch, pauses cleanly and honours music mute', () => {
  const previous = globalThis.document;
  globalThis.document = { hidden: false };
  try {
    const sound = new Sound({ volume: 30, musicVolume: 35 });
    sound.ctx = { state: 'running', currentTime: 0 };
    const notes = [];
    sound.tone = (...args) => notes.push(args);
    for (let chapter = 0; chapter < 4; chapter++) {
      sound.setChapter(chapter);
      sound.update(2, true);
    }
    assert.deepEqual(
      notes.filter((_, i) => i % 2 === 0).map((note) => note[0]),
      SOUND_PALETTES.map((palette) => palette.root * 4),
    );
    const count = notes.length;
    sound.update(9, false);
    assert.equal(notes.length, count);
    globalThis.document.hidden = true;
    sound.update(9, true);
    assert.equal(notes.length, count);
    globalThis.document.hidden = false;
    sound.settings.musicVolume = 0;
    sound.update(9, true);
    assert.equal(notes.length, count);
  } finally {
    globalThis.document = previous;
  }
});
