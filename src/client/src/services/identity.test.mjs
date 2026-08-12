import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureGuestId } from './identity.js';

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test('ensureGuestId creates one stable guest identity', () => {
  globalThis.localStorage = new MemoryStorage();
  const first = ensureGuestId();
  const second = ensureGuestId();

  assert.match(first, /^guest-/);
  assert.equal(second, first);
  assert.equal(localStorage.getItem('hearts-by-duanap-guest-id'), first);
});

test('ensureGuestId migrates the legacy guest identity without replacing it', () => {
  globalThis.localStorage = new MemoryStorage([
    ['hearts-online-guest-id', 'guest-legacy-stable-id']
  ]);

  assert.equal(ensureGuestId(), 'guest-legacy-stable-id');
  assert.equal(localStorage.getItem('hearts-by-duanap-guest-id'), 'guest-legacy-stable-id');
});
