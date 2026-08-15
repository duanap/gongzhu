<script setup>
import { ref, watch } from 'vue';
import { normalizeGamePace, readGamePace, writeGamePace } from '../services/preferences';

const props = defineProps({ game: { type: Object, default: () => ({}) } });
const emit = defineEmits(['open-panel', 'set-pace']);
const reduceMotion = ref(localStorage.getItem('gongzhu-by-duanap-reduce-motion') === '1');
const tableTone = ref(localStorage.getItem('gongzhu-by-duanap-table-tone') || 'garden');
const pace = ref(props.game.roomId ? normalizeGamePace(props.game.pace) : readGamePace());

function applySettings() {
  document.body.classList.toggle('gongzhu-reduce-motion', reduceMotion.value);
  document.body.dataset.tableTone = tableTone.value;
  localStorage.setItem('gongzhu-by-duanap-reduce-motion', reduceMotion.value ? '1' : '0');
  localStorage.setItem('gongzhu-by-duanap-table-tone', tableTone.value);
}

watch([reduceMotion, tableTone], applySettings, { immediate: true });
watch(() => props.game.pace, value => {
  if (props.game.roomId) pace.value = normalizeGamePace(value);
});

function choosePace(value) {
  pace.value = writeGamePace(value);
  if (props.game.roomId && props.game.isHost) emit('set-pace', pace.value);
}

function clearCache() {
  if (!window.confirm('确定清除本机保存的房间和界面设置并刷新吗？')) return;
  Object.keys(localStorage).filter(key => key.startsWith('gongzhu-by-duanap-')).forEach(key => localStorage.removeItem(key));
  window.location.reload();
}
</script>

<template>
  <section class="gongzhu-settings-panel">
    <article>
      <div><strong>牌局节奏</strong><span>{{ game.roomId ? (game.isHost ? '整桌同步，约 1.7–2.15 秒出牌、1.72 秒收墩。' : '由房主控制，当前设置对整桌生效。') : '创建房间时采用；标准节奏参考 Hearts。' }}</span></div>
      <div class="gongzhu-segmented" role="group" aria-label="牌局节奏">
        <button v-for="option in [{ value: 'fast', label: '偏快' }, { value: 'standard', label: '标准' }, { value: 'relaxed', label: '偏慢' }]" :key="option.value" type="button" :class="{ active: pace === option.value }" :disabled="game.roomId && !game.isHost" @click="choosePace(option.value)">{{ option.label }}</button>
      </div>
    </article>
    <article>
      <div><strong>牌桌色调</strong><span>保持 Hearts 的花园牌桌，可切换为夜色版本。</span></div>
      <div class="gongzhu-segmented"><button type="button" :class="{ active: tableTone === 'garden' }" @click="tableTone = 'garden'">花园</button><button type="button" :class="{ active: tableTone === 'night' }" @click="tableTone = 'night'">夜色</button></div>
    </article>
    <article>
      <div><strong>减少动态效果</strong><span>减少发牌、选牌和弹层过渡。</span></div>
      <button class="gongzhu-switch" type="button" :aria-pressed="reduceMotion" @click="reduceMotion = !reduceMotion"><span /></button>
    </article>
    <div class="gongzhu-tool-grid">
      <button class="text-button" type="button" @click="emit('open-panel', 'rules')">规则说明</button>
      <button class="text-button" type="button" @click="emit('open-panel', 'log')">出牌日志</button>
      <button class="text-button danger" type="button" @click="clearCache">清除本地缓存</button>
    </div>
  </section>
</template>
