export const EFFECT_TIMINGS = Object.freeze({
  specialEvent: 2350,
  specialEventEmphasis: 2800,
  specialEventGap: 120,
  moon: 3800,
  passFlight: 1780,
  collectFlight: 760,
  collectFlightMin: 620,
  collectFlightMax: 900,
  collectDistanceBase: 560,
  collectDistanceFactor: 0.28,
  interactionBubble: 2150,
  collectCleanupBuffer: 120,
  notice: 2600,
  noticeError: 4200,
  noticeGap: 180
});

export function specialEventMilliseconds(level) {
  return ['epic', 'legendary'].includes(level)
    ? EFFECT_TIMINGS.specialEventEmphasis
    : EFFECT_TIMINGS.specialEvent;
}

export function collectFlightMilliseconds(distance, speed = 1) {
  const raw = EFFECT_TIMINGS.collectDistanceBase + Math.max(0, Number(distance || 0)) * EFFECT_TIMINGS.collectDistanceFactor;
  const clamped = Math.max(EFFECT_TIMINGS.collectFlightMin, Math.min(EFFECT_TIMINGS.collectFlightMax, raw));
  return scaledEffectMilliseconds(clamped, speed);
}

export function scaledEffectMilliseconds(milliseconds, speed = 1) {
  return Math.round(Number(milliseconds || 0) * Number(speed || 1));
}

export function cssSeconds(milliseconds, speed = 1) {
  return `${scaledEffectMilliseconds(milliseconds, speed) / 1000}s`;
}
