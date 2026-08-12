import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKGROUND_MUSIC_TRACKS,
  DEFAULT_BACKGROUND_MUSIC_TRACK_ID
} from '../data/backgroundMusicCatalog.mjs';
import { normalizeClientSettings } from './preferences.js';

test('background music catalog exposes five original selectable tracks', () => {
  assert.deepEqual(
    BACKGROUND_MUSIC_TRACKS.map(track => [track.id, track.name]),
    [
      ['lake-breeze', '湖畔微风'],
      ['starlight-walk', '星光漫步'],
      ['afternoon-tea', '午后茶园'],
      ['cloud-kite', '云上纸鸢'],
      ['after-rain', '雨后森林']
    ]
  );
  assert.equal(new Set(BACKGROUND_MUSIC_TRACKS.map(track => track.id)).size, 5);
});

test('client settings keep background music off by default and normalize its track', () => {
  const defaults = normalizeClientSettings();
  assert.equal(defaults.bgm, false);
  assert.equal(defaults.bgmVolume, 0.55);
  assert.equal(defaults.bgmTrack, DEFAULT_BACKGROUND_MUSIC_TRACK_ID);

  assert.equal(normalizeClientSettings({ bgmTrack: 'cloud-kite' }).bgmTrack, 'cloud-kite');
  assert.equal(normalizeClientSettings({ bgmTrack: 'unknown-track' }).bgmTrack, DEFAULT_BACKGROUND_MUSIC_TRACK_ID);
  assert.equal(normalizeClientSettings({ bgmVolume: 2 }).bgmVolume, 1);
  assert.equal(normalizeClientSettings({ bgmVolume: -1 }).bgmVolume, 0);
});
