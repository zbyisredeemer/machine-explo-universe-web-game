import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';
import { newState, readSaveResult, writeSave, SAVE_KEY, BACKUP_KEY } from '../src/state.js';

function fixture() {
  const data = new Map();
  let denied = null;
  const adapter = createStorage(() => ({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (denied === '*' || denied === key) throw new Error('quota');
      data.set(key, value);
    },
  }));
  return {
    data,
    adapter,
    deny: (key) => {
      denied = key;
    },
  };
}

test('failed writes are session-only, identical retries stay failed and recover when storage is restored', () => {
  const f = fixture(),
    state = newState();
  f.deny('*');
  assert.equal(writeSave(f.adapter, state), false);
  assert.equal(readSaveResult(f.adapter).state.equipment.skin, 'ivory');
  assert.equal(writeSave(f.adapter, state), false);
  assert.equal(f.adapter.available, false);
  assert.equal(f.data.has(SAVE_KEY), false);
  f.deny(null);
  assert.equal(writeSave(f.adapter, state), true);
  assert.equal(f.adapter.available, true);
  assert.equal(JSON.parse(f.data.get(SAVE_KEY)).version, 1);
});

test('backup quota failure cannot replace the previous durable checkpoint', () => {
  const f = fixture(),
    state = newState();
  writeSave(f.adapter, state);
  const before = f.data.get(SAVE_KEY);
  state.salvage = 10;
  f.deny(BACKUP_KEY);
  assert.equal(writeSave(f.adapter, state), false);
  assert.equal(f.data.get(SAVE_KEY), before);
  f.deny(null);
  assert.equal(writeSave(f.adapter, state), true);
  assert.equal(f.data.get(BACKUP_KEY), before);
});

test('corrupt primary recovery is distinguishable from no save and both-invalid saves', () => {
  const f = fixture();
  assert.equal(readSaveResult(f.adapter).status, 'empty');
  f.data.set(SAVE_KEY, '{broken');
  assert.equal(readSaveResult(f.adapter).status, 'invalid');
  f.data.set(BACKUP_KEY, JSON.stringify(newState()));
  assert.equal(readSaveResult(f.adapter).status, 'recovered');
});

test('denied storage getter does not block play or masquerade as durable storage', () => {
  const adapter = createStorage(() => {
    throw new Error('SecurityError');
  });
  assert.equal(readSaveResult(adapter).state, null);
  assert.equal(adapter.available, false);
  assert.equal(writeSave(adapter, newState()), false);
  assert.ok(readSaveResult(adapter).state);
});
