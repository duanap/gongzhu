import { getBackgroundMusicTrack } from '../data/backgroundMusicCatalog.mjs';

const DEFAULT_TIMERS = {
  setInterval: (...args) => globalThis.setInterval(...args),
  clearInterval: id => globalThis.clearInterval(id),
  setTimeout: (...args) => globalThis.setTimeout(...args),
  clearTimeout: id => globalThis.clearTimeout(id)
};

function clampVolume(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.55;
}

function frequency(root, semitones) {
  return Number(root) * (2 ** (Number(semitones) / 12));
}

function setGain(param, value, time) {
  param.cancelScheduledValues?.(time);
  param.setValueAtTime(Math.max(0.0001, Number(param.value) || 0.0001), time);
  param.linearRampToValueAtTime?.(Math.max(0.0001, value), time + 0.35);
}

function scheduleVoice(context, bus, {
  start,
  duration,
  frequency: voiceFrequency,
  wave = 'sine',
  level = 0.02
}) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const end = start + duration;
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(voiceFrequency, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), start + Math.min(0.08, duration * 0.18));
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(envelope);
  envelope.connect(bus);
  oscillator.start(start);
  oscillator.stop(end + 0.04);
}

export function createBackgroundMusicController({
  getAudioContext,
  timers = DEFAULT_TIMERS
}) {
  let requested = {
    bgm: false,
    bgmVolume: 0.55,
    bgmTrack: getBackgroundMusicTrack().id
  };
  let unlocked = false;
  let visible = true;
  let disposed = false;
  let intervalId = 0;
  let session = null;
  const retiredBuses = new Set();
  const cleanupTimers = new Set();

  function clearScheduler() {
    if (!intervalId) return;
    timers.clearInterval(intervalId);
    intervalId = 0;
  }

  function retireBus(bus, context, fade = true) {
    if (!bus) return;
    const now = Number(context?.currentTime || 0);
    if (fade) {
      setGain(bus.gain, 0.0001, now);
      retiredBuses.add(bus);
      const cleanupId = timers.setTimeout(() => {
        cleanupTimers.delete(cleanupId);
        retiredBuses.delete(bus);
        try {
          bus.disconnect();
        } catch {
          // 已断开的音频节点无需再次处理。
        }
      }, 450);
      cleanupTimers.add(cleanupId);
      return;
    }
    try {
      bus.disconnect();
    } catch {
      // 已断开的音频节点无需再次处理。
    }
  }

  function stopSession({ fade = true } = {}) {
    clearScheduler();
    if (!session) return;
    retireBus(session.bus, session.context, fade);
    session = null;
  }

  function scheduleStep(activeSession) {
    const { context, bus, track } = activeSession;
    const halfBeat = 30 / track.tempo;
    const patternIndex = activeSession.step % track.pattern.length;
    const barIndex = Math.floor(activeSession.step / track.pattern.length) % track.progression.length;
    const chord = track.progression[barIndex];
    const start = activeSession.nextTime;

    if (patternIndex === 0) {
      chord.forEach((offset, index) => {
        scheduleVoice(context, bus, {
          start,
          duration: halfBeat * track.pattern.length * 0.94,
          frequency: frequency(track.rootFrequency / 2, offset),
          wave: track.padWave,
          level: 0.038 - index * 0.004
        });
      });
    }

    scheduleVoice(context, bus, {
      start,
      duration: halfBeat * 0.82,
      frequency: frequency(track.rootFrequency, track.pattern[patternIndex]),
      wave: track.leadWave,
      level: patternIndex % 2 === 0 ? 0.075 : 0.058
    });

    activeSession.step += 1;
    activeSession.nextTime += halfBeat;
  }

  function scheduleWindow() {
    if (!session) return;
    const horizon = session.context.currentTime + 1.1;
    while (session && session.nextTime < horizon) scheduleStep(session);
  }

  function shouldPlay() {
    return unlocked && visible && requested.bgm && requested.bgmVolume > 0;
  }

  function startSession() {
    if (!shouldPlay() || session || disposed) return;
    let context;
    try {
      context = getAudioContext?.();
      if (!context) return;
      if (context.state === 'suspended') context.resume?.();
      const bus = context.createGain();
      const now = Number(context.currentTime || 0);
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.linearRampToValueAtTime(requested.bgmVolume, now + 0.35);
      bus.connect(context.destination);
      session = {
        context,
        bus,
        track: getBackgroundMusicTrack(requested.bgmTrack),
        step: 0,
        nextTime: now + 0.04
      };
      scheduleWindow();
      intervalId = timers.setInterval(scheduleWindow, 180);
    } catch {
      stopSession({ fade: false });
    }
  }

  function sync(value = {}) {
    if (disposed) return;
    const nextTrack = getBackgroundMusicTrack(value.bgmTrack);
    const next = {
      bgm: Boolean(value.bgm),
      bgmVolume: clampVolume(value.bgmVolume),
      bgmTrack: nextTrack.id
    };
    const trackChanged = requested.bgmTrack !== next.bgmTrack;
    requested = next;

    if (!shouldPlay()) {
      stopSession();
      return;
    }
    if (trackChanged) stopSession();
    if (!session) {
      startSession();
      return;
    }
    setGain(session.bus.gain, requested.bgmVolume, session.context.currentTime);
  }

  function unlock() {
    if (disposed || unlocked) return;
    unlocked = true;
    startSession();
  }

  function setVisible(nextVisible) {
    if (disposed) return;
    visible = Boolean(nextVisible);
    if (!visible) stopSession();
    else startSession();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopSession({ fade: false });
    cleanupTimers.forEach(id => timers.clearTimeout(id));
    cleanupTimers.clear();
    retiredBuses.forEach(bus => {
      try {
        bus.disconnect();
      } catch {
        // 已断开的音频节点无需再次处理。
      }
    });
    retiredBuses.clear();
  }

  return Object.freeze({
    sync,
    unlock,
    setVisible,
    dispose
  });
}
