<script setup>
import { ref, watch } from 'vue';

const emit = defineEmits(['open-panel']);
const reduceMotion = ref(localStorage.getItem('gongzhu-by-duanap-reduce-motion') === '1');
const tableTone = ref(localStorage.getItem('gongzhu-by-duanap-table-tone') || 'garden');

function applySettings() {
  document.body.classList.toggle('gongzhu-reduce-motion', reduceMotion.value);
  document.body.dataset.tableTone = tableTone.value;
  localStorage.setItem('gongzhu-by-duanap-reduce-motion', reduceMotion.value ? '1' : '0');
  localStorage.setItem('gongzhu-by-duanap-table-tone', tableTone.value);
}

watch([reduceMotion, tableTone], applySettings, { immediate: true });

function clearCache() {
  if (!window.confirm('确定清除本机保存的房间和界面设置并刷新吗？')) return;
  Object.keys(localStorage).filter(key => key.startsWith('gongzhu-by-duanap-')).forEach(key => localStorage.removeItem(key));
  window.location.reload();
}
</script>

<template>
  <section class="gongzhu-settings-panel">
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
