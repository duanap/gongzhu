'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PACE, normalizePace, pacingFor } = require('./gamePacing');

test('unknown pace falls back to the Hearts-like standard profile', () => {
  assert.equal(normalizePace('turbo'), DEFAULT_PACE);
  assert.deepEqual(pacingFor('standard', { random: () => 0 }), { aiMs: 1700, trickMs: 1720 });
  assert.deepEqual(pacingFor('standard', { random: () => 1 }), { aiMs: 2150, trickMs: 1720 });
});

test('pace scale keeps automated tests fast without changing production defaults', () => {
  assert.deepEqual(pacingFor('relaxed', { random: () => 0.5, scale: 0.1 }), { aiMs: 270, trickMs: 260 });
});
