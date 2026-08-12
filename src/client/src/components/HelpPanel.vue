<script setup>
import { ref, watch } from 'vue';
import { VERSION_LOGS } from '../releaseInfo';

const props = defineProps({
  initialTab: {
    type: String,
    default: 'rules'
  }
});

const activeTab = ref('rules');

watch(() => props.initialTab, tab => {
  activeTab.value = tab === 'versions' ? 'versions' : 'rules';
}, { immediate: true });

const rules = [
  '红桃每张 1 分，黑桃 Q 13 分。',
  '第一墩必须由梅花 2 开始。',
  '能跟花色必须跟，不能跟才可以垫牌。',
  '红桃未破前不能主动出红桃，除非手里全是红桃。',
  '第一墩不能垫红桃或黑桃 Q，除非手里没有安全牌。',
  '甩牌：当前手牌仅剩同一花色、上一墩由自己领出并收墩，且另外三家均未跟该花色时，可选择一次性甩完余牌并收下所有剩余分数。',
  '一人拿满 26 分为打满贯，其他三家各加 26 分。',
  '任意玩家总分达到 100 分后结束游戏，低分获胜。'
];

</script>

<template>
  <section class="tool-panel help-panel">
    <ul v-if="activeTab === 'rules'" class="rules-list-vue">
      <li v-for="rule in rules" :key="rule">{{ rule }}</li>
    </ul>

    <div v-else class="version-log-list-vue">
      <article v-for="(log, index) in VERSION_LOGS" :key="`${log.version}-${index}`" class="version-log-item-vue">
        <h3>{{ log.version }} <span v-if="index === 0" class="version-current-badge-vue">当前</span></h3>
        <ul>
          <li v-for="item in log.items" :key="item">{{ item }}</li>
        </ul>
      </article>
    </div>
  </section>
</template>
