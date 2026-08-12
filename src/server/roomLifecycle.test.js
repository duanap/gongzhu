'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { roomExpiryReason } = require('./roomLifecycle');

test('an empty room expires after its grace period', () => {
  assert.equal(roomExpiryReason({ now: 20_000, emptySince: 9_999, updatedAt: 18_000, emptyTtlMs: 10_000, idleTtlMs: 60_000 }), 'empty');
});

test('an occupied but idle room expires at the idle limit', () => {
  assert.equal(roomExpiryReason({ now: 70_000, emptySince: 0, updatedAt: 9_999, emptyTtlMs: 10_000, idleTtlMs: 60_000 }), 'idle');
});

test('active rooms remain available', () => {
  assert.equal(roomExpiryReason({ now: 20_000, emptySince: 0, updatedAt: 15_000, emptyTtlMs: 10_000, idleTtlMs: 60_000 }), '');
});
