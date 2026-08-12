<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { fetchLeaderboard, fetchRecentMatches, fetchUserStats } from '../services/identity';

const props = defineProps({
  identity: {
    type: Object,
    required: true
  },
  game: {
    type: Object,
    required: true
  }
});

const loading = ref(false);
const error = ref('');
const statsData = ref({ profile: null, matches: [] });
const leaderboard = ref([]);
const recentMatches = ref([]);

const profile = computed(() => statsData.value.profile);
const stats = computed(() => profile.value?.stats || {
  gamesPlayed: 0,
  gamesWon: 0,
  totalScore: 0,
  bestScore: null,
  moonShots: 0,
  averageScore: 0
});

function percent(value, total) {
  if (!total) return '0%';
  return `${Math.round((Number(value || 0) / Number(total || 1)) * 100)}%`;
}

function playerLine(match) {
  return (match.participants || [])
    .map(player => `${player.winner ? '*' : ''}${player.name}: ${player.score}`)
    .join(' / ');
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const [mine, board, recent] = await Promise.all([
      fetchUserStats(),
      fetchLeaderboard(10),
      fetchRecentMatches(8)
    ]);
    statsData.value = mine;
    leaderboard.value = board.leaderboard || [];
    recentMatches.value = recent.matches || [];
  } catch (err) {
    error.value = err.message || '加载数据失败';
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
watch(() => props.identity.authenticated, refresh);
watch(() => props.game.phase, phase => {
  if (phase === 'gameEnd') refresh();
});
</script>

<template>
  <section class="tool-panel user-data-panel">
    <header>
      <strong>战绩</strong>
      <button class="text-button small" type="button" :disabled="loading" @click="refresh">
        {{ loading ? '加载中' : '刷新' }}
      </button>
    </header>

    <div class="stats-grid">
      <div class="stat-tile">
        <span>局数</span>
        <strong>{{ stats.gamesPlayed || 0 }}</strong>
      </div>
      <div class="stat-tile">
        <span>胜率</span>
        <strong>{{ percent(stats.gamesWon, stats.gamesPlayed) }}</strong>
      </div>
      <div class="stat-tile">
        <span>均分</span>
        <strong>{{ stats.averageScore || 0 }}</strong>
      </div>
      <div class="stat-tile">
        <span>最佳</span>
        <strong>{{ stats.bestScore ?? '-' }}</strong>
      </div>
      <div class="stat-tile">
        <span>累计分</span>
        <strong>{{ stats.totalScore || 0 }}</strong>
      </div>
      <div class="stat-tile">
        <span>射月</span>
        <strong>{{ stats.moonShots || 0 }}</strong>
      </div>
    </div>

    <div class="data-columns">
      <div class="data-section">
        <header>
          <strong>排行榜</strong>
          <span>{{ leaderboard.length }}</span>
        </header>
        <div v-if="leaderboard.length" class="compact-list">
          <div v-for="(row, index) in leaderboard" :key="row.userId" class="compact-row">
            <span>{{ index + 1 }}. {{ row.nickname || '未命名玩家' }}</span>
            <small>{{ row.stats.gamesWon }} 胜 / 均分 {{ row.stats.averageScore }}</small>
          </div>
        </div>
        <p v-else class="empty-note">暂无排行数据。</p>
      </div>

      <div class="data-section recent-matches-section">
        <header>
          <strong>最近对局</strong>
          <span>{{ recentMatches.length }}</span>
        </header>
        <div v-if="recentMatches.length" class="compact-list recent-matches-grid">
          <div v-for="match in recentMatches" :key="match.matchId" class="compact-row match-row">
            <span>房间 {{ match.roomId || '-' }} · 第 {{ match.roundNo || '-' }} 局</span>
            <small>{{ playerLine(match) }}</small>
          </div>
        </div>
        <p v-else class="empty-note">暂无最近对局。</p>
      </div>
    </div>

    <p v-if="error" class="panel-message error">{{ error }}</p>
  </section>
</template>
