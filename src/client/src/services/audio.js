import { readClientSettings } from './preferences';
import { createBackgroundMusicController } from './backgroundMusic.mjs';

let audioContext = null;
let backgroundMusic = null;
let audioRuntimeCleanup = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext = audioContext || new AudioContext();
  return audioContext;
}

function playTone(frequency = 520, duration = 0.08, type = 'sine', gainValue = 0.035) {
  const settings = readClientSettings();
  if (!settings.sound || settings.soundVolume <= 0) return;
  try {
    audioContext = getAudioContext();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, Math.min(1, gainValue * settings.soundVolume * 2)),
      audioContext.currentTime + 0.012
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration + 0.02);
  } catch (error) {
    // 浏览器可能拒绝未由手势触发的音频，游戏流程不应因此中断。
  }
}

export function playGameSound(kind) {
  const settings = readClientSettings();
  if (!settings.sound) return;
  if (kind === 'play') playTone(560, 0.075, 'triangle', 0.035);
  else if (kind === 'pass') {
    playTone(430, 0.07, 'sine', 0.026);
    window.setTimeout(() => playTone(620, 0.08, 'sine', 0.026), 75);
  } else if (kind === 'moon') {
    playTone(523, 0.14, 'sine', 0.04);
    window.setTimeout(() => playTone(659, 0.14, 'sine', 0.04), 150);
    window.setTimeout(() => playTone(784, 0.22, 'sine', 0.04), 310);
  } else if (kind === 'turn') {
    playTone(760, 0.08, 'sine', 0.025);
    window.setTimeout(() => playTone(980, 0.09, 'sine', 0.022), 90);
  } else if (kind === 'error') playTone(220, 0.12, 'sawtooth', 0.02);
  else playTone(640, 0.08, 'sine', 0.025);
}

export function playInteractionSound(kind, phase = 'launch') {
  const settings = readClientSettings();
  if (!settings.sound || !settings.interactionSound) return;
  if (phase === 'impact') {
    if (kind === 'flower') {
      playTone(520, 0.055, 'sine', 0.022);
      window.setTimeout(() => playTone(700, 0.075, 'triangle', 0.018), 45);
    } else if (kind === 'tomato') {
      playTone(115, 0.1, 'sawtooth', 0.028);
      window.setTimeout(() => playTone(82, 0.08, 'triangle', 0.02), 55);
    } else if (kind === 'brick') {
      playTone(92, 0.085, 'square', 0.03);
      window.setTimeout(() => playTone(64, 0.1, 'triangle', 0.022), 52);
    } else if (kind === 'slipper') {
      playTone(185, 0.065, 'triangle', 0.024);
      window.setTimeout(() => playTone(128, 0.075, 'sine', 0.018), 50);
    } else if (kind === 'cabbage') {
      playTone(330, 0.07, 'triangle', 0.02);
      window.setTimeout(() => playTone(245, 0.08, 'sine', 0.017), 58);
    } else {
      playTone(440, 0.06, 'triangle', 0.018);
      window.setTimeout(() => playTone(350, 0.07, 'sine', 0.016), 55);
    }
    return;
  }
  if (kind === 'flower') {
    playTone(660, 0.07, 'sine', 0.024);
    window.setTimeout(() => playTone(880, 0.09, 'sine', 0.022), 70);
  } else if (kind === 'tomato') {
    playTone(180, 0.08, 'triangle', 0.03);
    window.setTimeout(() => playTone(120, 0.08, 'sawtooth', 0.018), 75);
  } else if (kind === 'brick') {
    playTone(150, 0.06, 'square', 0.028);
    window.setTimeout(() => playTone(95, 0.08, 'triangle', 0.02), 70);
  } else if (kind === 'slipper') {
    playTone(260, 0.05, 'triangle', 0.022);
    window.setTimeout(() => playTone(210, 0.05, 'triangle', 0.018), 65);
  } else if (kind === 'cabbage') {
    playTone(480, 0.05, 'sine', 0.018);
    window.setTimeout(() => playTone(390, 0.06, 'sine', 0.016), 75);
  } else if (kind === 'doge') {
    playTone(760, 0.05, 'sine', 0.018);
    window.setTimeout(() => playTone(620, 0.07, 'sine', 0.016), 80);
  } else playTone(720, 0.06, 'sine', 0.018);
}

export function initAudioRuntime() {
  if (typeof window === 'undefined' || audioRuntimeCleanup) return;
  backgroundMusic = createBackgroundMusicController({ getAudioContext });

  const syncMusic = event => backgroundMusic?.sync(event?.detail || readClientSettings());
  const unlockMusic = () => backgroundMusic?.unlock();
  const syncVisibility = () => backgroundMusic?.setVisible(document.visibilityState !== 'hidden');

  window.addEventListener('hearts:settings-changed', syncMusic);
  window.addEventListener('pointerdown', unlockMusic, { passive: true });
  window.addEventListener('keydown', unlockMusic);
  document.addEventListener('visibilitychange', syncVisibility);
  syncMusic();
  syncVisibility();

  audioRuntimeCleanup = () => {
    window.removeEventListener('hearts:settings-changed', syncMusic);
    window.removeEventListener('pointerdown', unlockMusic);
    window.removeEventListener('keydown', unlockMusic);
    document.removeEventListener('visibilitychange', syncVisibility);
    backgroundMusic?.dispose();
    backgroundMusic = null;
    audioRuntimeCleanup = null;
  };
}

export function disposeAudioRuntime() {
  audioRuntimeCleanup?.();
}
