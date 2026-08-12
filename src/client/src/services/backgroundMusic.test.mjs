import assert from 'node:assert/strict';
import test from 'node:test';

import { createBackgroundMusicController } from './backgroundMusic.mjs';

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  cancelScheduledValues(time) {
    this.events.push(['cancel', time]);
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push(['set', value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push(['exponential', value, time]);
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push(['linear', value, time]);
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 12;
    this.state = 'running';
    this.destination = {};
    this.starts = [];
    this.gains = [];
  }

  createOscillator() {
    const frequency = new FakeAudioParam();
    const context = this;
    return {
      type: 'sine',
      frequency,
      connect() {},
      start(time) {
        context.starts.push({ time, frequency: frequency.value, type: this.type });
      },
      stop() {}
    };
  }

  createGain() {
    const gain = new FakeAudioParam(0.0001);
    this.gains.push(gain);
    return {
      gain,
      connect() {},
      disconnect() {}
    };
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

function createFakeTimers() {
  let nextId = 1;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    setInterval(callback) {
      const id = nextId++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback) {
      const id = nextId++;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    tickIntervals() {
      [...intervals.values()].forEach(callback => callback());
    },
    flushTimeouts() {
      const callbacks = [...timeouts.values()];
      timeouts.clear();
      callbacks.forEach(callback => callback());
    },
    intervalCount() {
      return intervals.size;
    }
  };
}

test('background music waits for a user gesture and stays stopped when disabled', () => {
  const context = new FakeAudioContext();
  const timers = createFakeTimers();
  let contextRequests = 0;
  const music = createBackgroundMusicController({
    getAudioContext() {
      contextRequests += 1;
      return context;
    },
    timers
  });

  music.sync({ bgm: false, bgmVolume: 0.35, bgmTrack: 'lake-breeze' });
  music.unlock();

  assert.equal(contextRequests, 0);
  assert.equal(context.starts.length, 0);
  assert.equal(timers.intervalCount(), 0);
});

test('background music starts, switches tracks, changes volume and cleans up', () => {
  const context = new FakeAudioContext();
  const timers = createFakeTimers();
  const music = createBackgroundMusicController({
    getAudioContext: () => context,
    timers
  });

  music.sync({ bgm: true, bgmVolume: 0.35, bgmTrack: 'lake-breeze' });
  assert.equal(context.starts.length, 0);

  music.unlock();
  assert.ok(context.starts.length > 0);
  assert.ok(context.gains.some(param => param.events.some(event => (
    event[0] === 'exponential' && event[1] >= 0.058
  ))));
  assert.equal(timers.intervalCount(), 1);
  const lakeFrequencies = context.starts.map(event => event.frequency);

  music.sync({ bgm: true, bgmVolume: 0.6, bgmTrack: 'lake-breeze' });
  assert.ok(context.gains.some(param => param.events.some(event => event[0] === 'linear' && event[1] === 0.6)));
  assert.equal(timers.intervalCount(), 1);

  const startsBeforeSwitch = context.starts.length;
  music.sync({ bgm: true, bgmVolume: 0.6, bgmTrack: 'cloud-kite' });
  assert.ok(context.starts.length > startsBeforeSwitch);
  assert.notDeepEqual(
    context.starts.slice(startsBeforeSwitch).map(event => event.frequency),
    lakeFrequencies
  );
  assert.equal(timers.intervalCount(), 1);

  music.setVisible(false);
  assert.equal(timers.intervalCount(), 0);

  music.setVisible(true);
  assert.equal(timers.intervalCount(), 1);

  music.dispose();
  timers.flushTimeouts();
  assert.equal(timers.intervalCount(), 0);
});
