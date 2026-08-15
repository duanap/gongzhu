const GAME_PACE_KEY = 'gongzhu-by-duanap-game-pace';
const GAME_PACES = new Set(['fast', 'standard', 'relaxed']);

export function normalizeGamePace(value) {
  return GAME_PACES.has(value) ? value : 'standard';
}

export function readGamePace() {
  return normalizeGamePace(localStorage.getItem(GAME_PACE_KEY));
}

export function writeGamePace(value) {
  const pace = normalizeGamePace(value);
  localStorage.setItem(GAME_PACE_KEY, pace);
  return pace;
}
