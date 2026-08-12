<script setup>
import { computed } from 'vue';
import Card from './Card.vue';

const props = defineProps({
  game: {
    type: Object,
    required: true
  },
  roundTableOnly: {
    type: Boolean,
    default: false
  }
});

const hasRoundTable = computed(() => Boolean(props.game.roundTableView?.players?.length));
const hasDetails = computed(() => props.roundTableOnly
  ? hasRoundTable.value
  : Boolean(
      props.game.receivedCards.length ||
      props.game.passFlowView?.flows?.length ||
      props.game.lastTrickView ||
      hasRoundTable.value
    ));

function relationLabel(index) {
  return ['本家 / 自己', '上家', '对家', '下家'][index] || '玩家';
}

function suitName(suit) {
  return { C: '梅花', D: '方片', S: '黑桃', H: '红桃' }[suit] || suit || '-';
}

function shortRelation(index) {
  return ['自己', '上家', '对家', '下家'][index] || '玩家';
}

function playerIndexByName(name) {
  return (props.game.roundTableView?.players || []).findIndex(player => player.name === name);
}

function receivedSourceIndex(row) {
  const received = new Set((row.receivedCards || []).map(card => card.id));
  if (!received.size) return -1;
  return (props.game.roundTableView?.players || []).findIndex(player => {
    const passed = (player.passedCards || []).map(card => card.id);
    return passed.length === received.size && passed.every(id => received.has(id));
  });
}

function playerWithRelation(name, index) {
  if (!name || index < 0) return name || '玩家';
  return `${name}（${shortRelation(index)}）`;
}
</script>

<template>
  <section v-if="hasDetails" class="round-detail-panel" :class="{ 'round-table-only': roundTableOnly }">
    <div v-if="!roundTableOnly && game.receivedCards.length" class="detail-section">
      <header>
        <strong>收到传牌</strong>
        <span>来自 {{ game.receivedFrom || '未知' }}</span>
      </header>
      <div class="mini-card-row">
        <Card v-for="card in game.receivedCards" :key="card.id" :card="card" compact />
      </div>
    </div>

    <div v-if="!roundTableOnly && game.lastTrickView" class="detail-section">
      <header>
        <strong>上一墩</strong>
        <span>收墩：{{ game.viewPlayers[game.lastTrickView.winnerPlayer]?.name || '玩家' }}</span>
      </header>
      <div class="trick-meta-grid">
        <span>领出：{{ game.viewPlayers[game.lastTrickView.leaderPlayer]?.name || '玩家' }}</span>
        <span>分数：{{ game.lastTrickView.points || 0 }}</span>
        <span>花色：{{ suitName(game.lastTrickView.cards?.[0]?.card?.suit) }}</span>
        <span>牌数：{{ game.lastTrickView.cards?.length || 0 }}</span>
      </div>
      <div class="last-trick-grid">
        <div
          v-for="play in game.lastTrickView.cards"
          :key="`${play.player}-${play.card?.id}`"
          class="last-trick-item"
          :class="{ winner: play.player === game.lastTrickView.winnerPlayer }"
        >
          <Card v-if="play.card" :card="play.card" compact />
          <span>{{ game.viewPlayers[play.player]?.name || '玩家' }}</span>
        </div>
      </div>
    </div>

    <div v-if="!roundTableOnly && game.passFlowView?.flows?.length" class="detail-section">
      <header>
        <strong>传牌流向</strong>
        <span>{{ game.passName || '不传牌' }}</span>
      </header>
      <div class="compact-list">
        <div v-for="(flow, index) in game.passFlowView.flows" :key="`${flow.from}-${flow.to}-${index}`" class="compact-row">
          <span>{{ game.viewPlayers[flow.from]?.name || '玩家' }} -> {{ game.viewPlayers[flow.to]?.name || '玩家' }}</span>
          <small>{{ flow.count || 3 }} 张</small>
        </div>
      </div>
    </div>

    <div v-if="game.roundTableView?.players?.length" class="detail-section round-table-review">
      <header class="round-review-heading">
        <strong>第 {{ game.roundTableView.roundNo || game.roundNo }} 局牌桌</strong>
      </header>
      <div class="round-player-grid">
        <section
          v-for="(row, index) in game.roundTableView.players"
          :key="row.id || row.index || index"
          class="round-player-panel"
          :class="{ 'is-you': index === 0 }"
        >
          <header class="round-player-header">
            <div class="round-player-identity">
              <div class="round-player-avatar">{{ row.avatar || '?' }}</div>
              <div>
                <div class="round-player-name">{{ row.name || (index === 0 ? '你' : '玩家') }}</div>
                <div class="round-player-meta">{{ relationLabel(index) }}</div>
              </div>
            </div>
            <div class="round-score-pair">
              <span>本局 <b>{{ row.round || 0 }}</b></span>
              <span>总分 <b>{{ row.total || 0 }}</b></span>
            </div>
          </header>

          <div class="round-hand-block">
            <div class="round-card-strip">
              <Card
                v-for="card in row.cards || []"
                :key="card.id"
                :card="card"
                compact
                summary
              />
              <span v-if="!row.cards?.length" class="round-pass-muted">暂无记录</span>
            </div>
          </div>

          <div class="round-transfer-line">
            <strong>传给{{ playerWithRelation(row.passedTo, playerIndexByName(row.passedTo)) }}：</strong>
            <div class="round-card-strip pass-cards">
              <Card v-for="card in row.passedCards || []" :key="card.id" :card="card" compact summary />
              <span v-if="!row.passedCards?.length" class="round-pass-muted">本局不传牌</span>
            </div>
            <span class="round-transfer-divider">|</span>
            <strong>收到{{ playerWithRelation(game.roundTableView.players[receivedSourceIndex(row)]?.name, receivedSourceIndex(row)) }}：</strong>
            <div class="round-card-strip received-cards">
              <Card v-for="card in row.receivedCards || []" :key="card.id" :card="card" compact summary />
              <span v-if="!row.receivedCards?.length" class="round-pass-muted">本局不传牌</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>
