<script setup>
import { computed } from 'vue';
import {
  formatLearningNumber,
  learningEventDistribution,
  learningEventLabel,
  learningEventMeta,
  learningWeightRows,
  SUIT_LABELS
} from '../services/aiLearningPresentation.mjs';

const props = defineProps({
  game: {
    type: Object,
    required: true
  }
});

const summary = computed(() => props.game.aiLearningSummary);
const opponents = computed(() => Array.isArray(summary.value?.opponents) ? summary.value.opponents : []);
const recentEvents = computed(() => Array.isArray(summary.value?.recentEvents) ? summary.value.recentEvents : []);
const weights = computed(() => learningWeightRows(summary.value?.weights));
const samplesToTune = computed(() => {
  const minimum = Math.max(1, Number(summary.value?.minSamplesToTune || 1));
  return Math.max(0, minimum - Number(summary.value?.samplesSinceTune || 0));
});
const eventDistribution = computed(() => learningEventDistribution(summary.value?.eventCounts));
</script>

<template>
  <section class="tool-panel ai-learning-panel" :class="{ 'is-empty': !summary }">
    <div v-if="!summary" class="ai-learning-empty">
      <div class="ai-learning-empty-mark">AI</div>
      <strong>仅房主可见</strong>
      <div>进入房间并成为房主后，可在这里查看完整学习数据。</div>
    </div>

    <template v-else>
      <div class="ai-learning-stats">
        <div class="ai-learning-stat"><span>总样本</span><strong>{{ Number(summary.totalSamples || 0) }}</strong></div>
        <div class="ai-learning-stat"><span>距下次调权</span><strong>{{ samplesToTune }}</strong></div>
        <div class="ai-learning-stat"><span>事件分布</span><strong>{{ eventDistribution }}</strong></div>
      </div>

      <div class="ai-learning-weights">
        <div v-for="row in weights" :key="row.key" class="ai-learning-weight" :data-ai-weight="row.key">
          <span>{{ row.label }}</span>
          <b>{{ row.value.toFixed(2) }} · {{ row.trend }}</b>
        </div>
      </div>

      <div class="interaction-debug-title">对手倾向</div>
      <div class="ai-learning-list">
        <div v-for="row in opponents" :key="row.name" class="ai-learning-row">
          <div>
            <strong>{{ row.name || '玩家' }}</strong>
            <small>样本 {{ Number(row.totalSamples || 0) }} · 平均吃分 {{ formatLearningNumber(row.avgTakenPoints) }} · 平均传出分 {{ formatLearningNumber(row.avgPassedPoints) }} · 常短门 {{ SUIT_LABELS[row.favoriteVoidSuit] || '暂无' }}</small>
          </div>
          <span class="ai-learning-pill">射月 {{ Math.round(Number(row.shootMoonRate || 0) * 100) }}%</span>
        </div>
        <div v-if="!opponents.length" class="ai-learning-row">
          <div><strong>暂无对手倾向</strong><small>完成传牌、收墩或局末结算后会开始统计。</small></div>
        </div>
      </div>

      <div class="interaction-debug-title">近期样本</div>
      <div class="ai-learning-list">
        <div v-for="(event, index) in recentEvents" :key="`${event.type}-${event.at || index}`" class="ai-learning-row">
          <div>
            <strong>{{ learningEventLabel(event.type) }}</strong>
            <small>{{ learningEventMeta(event) }}</small>
          </div>
          <span class="ai-learning-pill">{{ Number(event.points || 0) }} 分</span>
        </div>
        <div v-if="!recentEvents.length" class="ai-learning-row">
          <div><strong>暂无近期样本</strong><small>开始一局后这里会显示最新学习事件。</small></div>
        </div>
      </div>
    </template>
  </section>
</template>
