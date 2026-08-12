<script setup>
import { computed, ref } from 'vue';
import {
  buildLogEntries,
  LOG_FILTERS,
  summarizeLogEntries
} from '../services/logEntries.mjs';

const props = defineProps({
  game: {
    type: Object,
    required: true
  }
});

const activeFilter = ref('全部');
const sourceLog = computed(() => Array.isArray(props.game.log) ? props.game.log : []);
const entries = computed(() => buildLogEntries(sourceLog.value, activeFilter.value));
const summary = computed(() => summarizeLogEntries(entries.value, sourceLog.value.length, activeFilter.value));

function startsRound(index) {
  return index === 0 || entries.value[index - 1]?.round !== entries.value[index]?.round;
}
</script>

<template>
  <section class="tool-panel log-detail-panel">
    <p class="log-summary-vue" role="status">{{ summary }}</p>

    <nav class="log-filter-bar-vue" aria-label="日志类型筛选">
      <button
        v-for="filter in LOG_FILTERS"
        :key="filter"
        type="button"
        :class="{ active: activeFilter === filter }"
        :aria-pressed="activeFilter === filter"
        @click="activeFilter = filter"
      >
        {{ filter }}
      </button>
    </nav>

    <div v-if="!entries.length" class="log-empty-state-vue">
      <strong>{{ sourceLog.length ? '当前筛选暂无记录' : '牌局尚未产生记录' }}</strong>
      <span>{{ sourceLog.length ? '切换上方类型查看其他事件。' : '创建房间并开始牌局后，事件会按时间顺序显示在这里。' }}</span>
    </div>

    <div v-else class="detail-log-list log-timeline-vue">
      <template v-for="(entry, index) in entries" :key="`${entry.round}-${entry.order}-${entry.text}`">
        <div v-if="startsRound(index)" class="log-round-divider-vue">第 {{ entry.round }} 局</div>
        <article class="detail-log-row log-event-vue">
          <span class="log-type-vue" :class="entry.typeClass">{{ entry.type }}</span>
          <p>{{ entry.displayText }}</p>
          <small>#{{ entry.order }}</small>
        </article>
      </template>
    </div>
  </section>
</template>
