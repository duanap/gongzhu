<script setup>
import {
  INTERACTION_EMOJIS,
  INTERACTION_TOOLS,
  SPECIAL_EVENT_SAMPLES,
  SPECIAL_LEVEL_NAMES
} from '../data/interactionCatalog';

const emit = defineEmits(['open-round-table']);

function playBroadcast(sample) {
  window.dispatchEvent(new CustomEvent('hearts:debug-broadcast', {
    detail: { ...sample, seq: Date.now() }
  }));
}

function playInteraction(sample) {
  window.dispatchEvent(new CustomEvent('hearts:debug-interaction', {
    detail: {
      ...sample,
      seq: Date.now(),
      from: '刘备',
      to: '诸葛亮',
      fromIndex: 0,
      toIndex: 2,
      broadcastOnly: sample.kind === 'emoji'
    }
  }));
}
</script>

<template>
  <section class="tool-panel debug-panel-vue legacy-debug-content">
    <div class="debug-list-vue">
      <h3>特效播报</h3>
      <article v-for="sample in SPECIAL_EVENT_SAMPLES" :key="sample.type" class="debug-item-vue">
        <div>
          <strong><b class="debug-level-pill" :class="sample.level">{{ SPECIAL_LEVEL_NAMES[sample.level] }}</b>{{ sample.title }}</strong>
          <small>{{ sample.subtitle }}</small>
        </div>
        <button type="button" @click="playBroadcast(sample)">播放</button>
      </article>

      <h3>互动调试</h3>
      <article
        v-for="(sample, index) in [...INTERACTION_EMOJIS, ...INTERACTION_TOOLS]"
        :key="`${sample.kind}-${sample.label}-${index}`"
        class="debug-item-vue"
      >
        <div>
          <strong>{{ sample.icon }} {{ sample.label }}</strong>
          <small>预览目标：刘备 / 飞行终点跟随真实座位</small>
        </div>
        <button type="button" @click="playInteraction(sample)">播放</button>
      </article>

      <h3>功能调试</h3>
      <article class="debug-item-vue">
        <div>
          <strong>查看牌桌</strong>
          <small>预览每局结束后的全屏牌桌回看，手机端按真实横屏布局。</small>
        </div>
        <button type="button" @click="emit('open-round-table')">播放</button>
      </article>
    </div>
  </section>
</template>
