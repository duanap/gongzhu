export const DEFAULT_BACKGROUND_MUSIC_TRACK_ID = 'lake-breeze';

export const BACKGROUND_MUSIC_TRACKS = Object.freeze([
  Object.freeze({
    id: 'lake-breeze',
    name: '湖畔微风',
    description: '舒缓水波与轻柔木琴感',
    tempo: 72,
    rootFrequency: 220,
    leadWave: 'sine',
    padWave: 'sine',
    progression: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]],
    pattern: [0, 4, 7, 12, 7, 4, 2, 7]
  }),
  Object.freeze({
    id: 'starlight-walk',
    name: '星光漫步',
    description: '安静夜色与清亮星光',
    tempo: 66,
    rootFrequency: 246.94,
    leadWave: 'triangle',
    padWave: 'sine',
    progression: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]],
    pattern: [0, 7, 10, 15, 12, 7, 3, 10]
  }),
  Object.freeze({
    id: 'afternoon-tea',
    name: '午后茶园',
    description: '明快但不打扰的午后节奏',
    tempo: 80,
    rootFrequency: 261.63,
    leadWave: 'sine',
    padWave: 'triangle',
    progression: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
    pattern: [0, 2, 4, 7, 9, 7, 4, 2]
  }),
  Object.freeze({
    id: 'cloud-kite',
    name: '云上纸鸢',
    description: '轻盈上扬的天空琶音',
    tempo: 74,
    rootFrequency: 196,
    leadWave: 'triangle',
    padWave: 'sine',
    progression: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
    pattern: [0, 7, 12, 16, 14, 9, 7, 4]
  }),
  Object.freeze({
    id: 'after-rain',
    name: '雨后森林',
    description: '温柔雨滴与林间回声',
    tempo: 68,
    rootFrequency: 220,
    leadWave: 'sine',
    padWave: 'triangle',
    progression: [[0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 10, 14]],
    pattern: [0, 3, 7, 10, 12, 10, 7, 3]
  })
]);

const TRACK_BY_ID = new Map(BACKGROUND_MUSIC_TRACKS.map(track => [track.id, track]));

export function getBackgroundMusicTrack(id) {
  return TRACK_BY_ID.get(String(id || '')) || TRACK_BY_ID.get(DEFAULT_BACKGROUND_MUSIC_TRACK_ID);
}
