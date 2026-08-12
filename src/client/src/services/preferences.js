import { EFFECT_TIMINGS, cssSeconds, scaledEffectMilliseconds } from './effectTimings.mjs';
import {
  DEFAULT_BACKGROUND_MUSIC_TRACK_ID,
  getBackgroundMusicTrack
} from '../data/backgroundMusicCatalog.mjs';

export const SETTINGS_STORAGE_KEY = 'hearts-vue-settings';

export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  soundVolume: 1,
  effects: true,
  effectSpeed: 1,
  interactionEffects: true,
  interactionSound: true,
  allowTomato: true,
  bgm: false,
  bgmVolume: 0.55,
  bgmTrack: DEFAULT_BACKGROUND_MUSIC_TRACK_ID,
  theme: 'table'
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function normalizeClientSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    sound: value.sound !== false,
    soundVolume: clamp(value.soundVolume, 0, 1, 1),
    effects: value.effects !== false,
    effectSpeed: clamp(value.effectSpeed, 0.7, 1.4, 1),
    interactionEffects: value.interactionEffects !== false,
    interactionSound: value.interactionSound !== false,
    allowTomato: value.allowTomato !== false,
    bgm: Boolean(value.bgm),
    bgmVolume: clamp(value.bgmVolume, 0, 1, 0.55),
    bgmTrack: getBackgroundMusicTrack(value.bgmTrack).id,
    theme: ['table', 'night', 'classic'].includes(value.theme) ? value.theme : 'table'
  };
}

export function readClientSettings() {
  try {
    return normalizeClientSettings(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}'));
  } catch (error) {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    return normalizeClientSettings();
  }
}

export function applyClientSettings(value, { persist = true } = {}) {
  const settings = normalizeClientSettings(value);
  document.body.classList.toggle('theme-night', settings.theme === 'night');
  document.body.classList.toggle('theme-classic', settings.theme === 'classic');
  document.body.classList.toggle('effects-off', !settings.effects);
  document.body.classList.toggle('interactions-off', !settings.interactionEffects);

  const root = document.documentElement.style;
  root.setProperty('--special-event-duration', cssSeconds(EFFECT_TIMINGS.specialEvent, settings.effectSpeed));
  root.setProperty('--moon-effect-duration', cssSeconds(EFFECT_TIMINGS.moon, settings.effectSpeed));
  root.setProperty('--pass-flight-duration', cssSeconds(EFFECT_TIMINGS.passFlight, settings.effectSpeed));
  root.setProperty('--collect-flight-duration', cssSeconds(EFFECT_TIMINGS.collectFlight, settings.effectSpeed));
  root.setProperty('--interaction-bubble-duration', cssSeconds(EFFECT_TIMINGS.interactionBubble, settings.effectSpeed));

  if (persist) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('hearts:settings-changed', { detail: settings }));
  return settings;
}

export function effectDelay(milliseconds) {
  return scaledEffectMilliseconds(milliseconds, readClientSettings().effectSpeed);
}
