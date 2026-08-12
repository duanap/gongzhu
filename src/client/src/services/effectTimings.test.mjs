import assert from 'node:assert/strict';
import {
  EFFECT_TIMINGS,
  collectFlightMilliseconds,
  cssSeconds,
  scaledEffectMilliseconds,
  specialEventMilliseconds
} from './effectTimings.mjs';

assert.strictEqual(collectFlightMilliseconds(0, 1), 620);
assert.strictEqual(collectFlightMilliseconds(5000, 1), 900);
assert.strictEqual(collectFlightMilliseconds(5000, 1.2), 1080);
assert.strictEqual(specialEventMilliseconds('minor'), 2350);
assert.strictEqual(specialEventMilliseconds('epic'), 2800);
assert.strictEqual(specialEventMilliseconds('legendary'), 2800);
assert.strictEqual(cssSeconds(EFFECT_TIMINGS.passFlight, 1.4), '2.492s');

console.log('Effect timing tests passed');
