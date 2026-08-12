<script setup>
import { ref, watch } from 'vue';
import { clearClientCache } from '../stores/gameState';
import { playGameSound, playInteractionSound } from '../services/audio';
import { APP_VERSION } from '../releaseInfo';
import { BACKGROUND_MUSIC_TRACKS } from '../data/backgroundMusicCatalog.mjs';
import {
  applyClientSettings,
  DEFAULT_SETTINGS,
  readClientSettings
} from '../services/preferences';

defineProps({
  game: {
    type: Object,
    default: () => ({ log: [] })
  },
  showClose: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits(['open-panel', 'close-panel']);

const settings = ref({ ...DEFAULT_SETTINGS });

function loadSettings() {
  settings.value = readClientSettings();
}

function applySettings(value) {
  applyClientSettings(value);
}

function clearLocalCache() {
  if (!window.confirm('确定清除本地缓存并刷新页面吗？这会清空本机保存的房间号、玩家标识和横屏设置。')) return;
  clearClientCache();
}

function toggle(key) {
  settings.value[key] = !settings.value[key];
  applyClientSettings(settings.value);
  if (key === 'sound' && settings.value.sound) playGameSound('pass');
  if (key === 'interactionSound' && settings.value.interactionSound) playInteractionSound('emoji');
}

function previewVolume() {
  if (settings.value.sound && settings.value.soundVolume > 0) playGameSound('play');
}

function openPanel(panel) {
  emit('open-panel', panel);
}

loadSettings();
watch(settings, applySettings, { deep: true, immediate: true });
</script>

<template>
  <section class="tool-panel settings-panel">
    <header>
      <strong>设置</strong>
      <span>{{ APP_VERSION }} · 本地</span>
    </header>

    <div class="settings-sections-vue">
      <section class="settings-section-vue settings-section-wide-vue">
        <h3>牌局特效</h3>
        <div class="settings-row-vue">
          <div>
            <strong>特效开关</strong>
            <small>高光事件、射中月亮等动画提示。</small>
          </div>
          <button
            class="settings-switch-vue"
            :class="{ on: settings.effects }"
            type="button"
            :aria-pressed="settings.effects"
            @click="toggle('effects')"
          >
            {{ settings.effects ? '开启' : '关闭' }}
          </button>
        </div>

        <label class="settings-row-vue">
          <div>
            <strong>播放速度</strong>
            <small>控制牌局高光与月亮特效的整体节奏。</small>
          </div>
          <select v-model.number="settings.effectSpeed" class="settings-select-vue">
            <option :value="0.85">偏快</option>
            <option :value="1">标准</option>
            <option :value="1.2">偏慢</option>
          </select>
        </label>

      </section>

      <section class="settings-section-vue settings-section-side-vue">
        <h3>音效</h3>
        <div class="settings-row-vue">
          <div>
            <strong>音效开关</strong>
            <small>出牌、传牌、错误提示和高光播报。</small>
          </div>
          <button
            class="settings-switch-vue"
            :class="{ on: settings.sound }"
            type="button"
            :aria-pressed="settings.sound"
            @click="toggle('sound')"
          >
            {{ settings.sound ? '开启' : '关闭' }}
          </button>
        </div>

        <label class="settings-row-vue">
          <div>
            <strong>音量大小</strong>
            <small>{{ Math.round(settings.soundVolume * 100) }}%</small>
          </div>
          <input v-model.number="settings.soundVolume" class="settings-range-vue" aria-label="音效音量" type="range" min="0" max="1" step="0.01" @change="previewVolume" />
        </label>
      </section>

      <section class="settings-section-vue settings-section-wide-vue">
        <h3>牌桌互动</h3>
        <div class="settings-row-vue">
          <div>
            <strong>互动特效</strong>
            <small>表情、送花和番茄飞行动画。</small>
          </div>
          <button
            class="settings-switch-vue"
            :class="{ on: settings.interactionEffects }"
            type="button"
            :aria-pressed="settings.interactionEffects"
            @click="toggle('interactionEffects')"
          >
            {{ settings.interactionEffects ? '开启' : '关闭' }}
          </button>
        </div>

        <div class="settings-row-vue">
          <div>
            <strong>互动音效</strong>
            <small>互动反馈音效。</small>
          </div>
          <button
            class="settings-switch-vue"
            :class="{ on: settings.interactionSound }"
            type="button"
            :aria-pressed="settings.interactionSound"
            @click="toggle('interactionSound')"
          >
            {{ settings.interactionSound ? '开启' : '关闭' }}
          </button>
        </div>

        <div class="settings-row-vue">
          <div>
            <strong>允许番茄</strong>
            <small>控制番茄类互动。</small>
          </div>
          <button
            class="settings-switch-vue"
            :class="{ on: settings.allowTomato }"
            type="button"
            :aria-pressed="settings.allowTomato"
            @click="toggle('allowTomato')"
          >
            {{ settings.allowTomato ? '开启' : '关闭' }}
          </button>
        </div>
      </section>

      <section class="settings-section-vue settings-section-side-vue">
        <h3>背景音乐</h3>
        <div class="settings-row-vue">
          <div>
            <strong>背景音乐开关</strong>
            <small>原创程序化轻音乐，默认关闭。</small>
          </div>
          <button
            class="settings-switch-vue"
            :class="{ on: settings.bgm }"
            type="button"
            :aria-pressed="settings.bgm"
            @click="toggle('bgm')"
          >
            {{ settings.bgm ? '开启' : '关闭' }}
          </button>
        </div>

        <label class="settings-row-vue">
          <div>
            <strong>背景音乐音量</strong>
            <small>{{ Math.round(settings.bgmVolume * 100) }}%</small>
          </div>
          <input v-model.number="settings.bgmVolume" class="settings-range-vue" aria-label="背景音乐音量" type="range" min="0" max="1" step="0.01" />
        </label>

        <label class="settings-row-vue">
          <div>
            <strong>音乐曲目</strong>
            <small>{{ BACKGROUND_MUSIC_TRACKS.find(track => track.id === settings.bgmTrack)?.description }}</small>
          </div>
          <select v-model="settings.bgmTrack" class="settings-select-vue" aria-label="背景音乐曲目">
            <option v-for="track in BACKGROUND_MUSIC_TRACKS" :key="track.id" :value="track.id">
              {{ track.name }}
            </option>
          </select>
        </label>
      </section>

      <section class="settings-section-vue settings-section-wide-vue">
        <h3>工具与资料</h3>
        <div class="settings-actions-grid-vue">
          <button class="text-button" type="button" @click="openPanel('help-rules')">规则</button>
          <button class="text-button" type="button" @click="openPanel('log')">
            {{ game.log?.length ? `日志 ${game.log.length}` : '日志' }}
          </button>
          <button class="text-button" type="button" @click="openPanel('ai-learning')">AI 学习</button>
          <button class="text-button" type="button" @click="openPanel('help-versions')">版本日志</button>
          <button class="text-button" type="button" @click="openPanel('stats')">战绩</button>
          <button class="text-button" type="button" @click="openPanel('debug')">调试</button>
        </div>
        <button class="text-button danger settings-cache-action-vue" type="button" @click="clearLocalCache">刷新缓存</button>
      </section>

      <section class="settings-section-vue settings-section-side-vue">
        <h3>项目信息</h3>
        <div class="settings-info-vue">
          <span><strong>版本号：</strong>{{ APP_VERSION }}</span>
          <span><strong>开发者 QQ：</strong>182827046</span>
          <span><strong>QQ 群：</strong>50475937</span>
        </div>
      </section>

    </div>

    <button
      v-if="showClose"
      class="text-button legacy-modal-bottom-close settings-bottom-close-vue"
      type="button"
      @click="$emit('close-panel')"
    >
      关闭
    </button>
  </section>
</template>
