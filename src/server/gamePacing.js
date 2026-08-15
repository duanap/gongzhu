'use strict';

const DEFAULT_PACE = 'standard';

const PACE_PROFILES = Object.freeze({
  fast: Object.freeze({ aiBaseMs: 900, aiJitterMs: 250, trickMs: 1100 }),
  standard: Object.freeze({ aiBaseMs: 1700, aiJitterMs: 450, trickMs: 1720 }),
  relaxed: Object.freeze({ aiBaseMs: 2400, aiJitterMs: 600, trickMs: 2600 })
});

function normalizePace(value) {
  return Object.hasOwn(PACE_PROFILES, value) ? value : DEFAULT_PACE;
}

function pacingFor(value, options = {}) {
  const profile = PACE_PROFILES[normalizePace(value)];
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
  return {
    aiMs: Math.max(1, Math.round((profile.aiBaseMs + random() * profile.aiJitterMs) * scale)),
    trickMs: Math.max(1, Math.round(profile.trickMs * scale))
  };
}

module.exports = { DEFAULT_PACE, PACE_PROFILES, normalizePace, pacingFor };
