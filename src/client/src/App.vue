<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { createGameSocket } from './services/socket';
import { createGameState, setNickname } from './stores/gameState';

const game = createGameState();
const socket = createGameSocket(game);
const nickname = ref(game.nickname);
const joinCode = ref('');
const declarationChoice = ref([]);
const now = ref(Date.now());
let clock = null;

const suitSymbol = { C: '♣', D: '♦', S: '♠', H: '♥' };
const suitName = { C: '梅花', D: '方片', S: '黑桃', H: '红桃' };
const rankName = rank => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[rank] || rank);
const specialName = { S12: '猪', D11: '羊', H14: '红', C10: '变' };
const declarable = computed(() => game.hand.filter(card => specialName[card.id]));
const declarationSeconds = computed(() => Math.max(0, Math.ceil((game.declarationDeadline - now.value) / 1000)));
const submitted = computed(() => Boolean(game.declarationSubmitted[game.yourIndex]));
const currentName = computed(() => game.players[game.currentPlayer]?.name || '');
const sortedPlayers = computed(() => [...game.players].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)));
const winnerNames = computed(() => game.winnerIndexes.map(index => game.players[index]?.name).filter(Boolean).join('、'));

function saveName() {
  setNickname(game, nickname.value);
}

function createRoom() {
  saveName();
  socket.createRoom();
}

function joinRoom() {
  if (!/^\d{4}$/.test(joinCode.value)) {
    game.lastError = '请输入 4 位房间号。';
    return;
  }
  saveName();
  socket.joinRoom(joinCode.value);
}

function toggleDeclaration(cardId) {
  declarationChoice.value = declarationChoice.value.includes(cardId)
    ? declarationChoice.value.filter(id => id !== cardId)
    : [...declarationChoice.value, cardId];
}

function submitDeclaration() {
  socket.declareCards(declarationChoice.value);
}

function cardLabel(card) {
  return `${suitName[card.suit]}${rankName(card.rank)}`;
}

onMounted(() => {
  socket.connect();
  clock = window.setInterval(() => { now.value = Date.now(); }, 250);
});

onBeforeUnmount(() => {
  window.clearInterval(clock);
  socket.close();
});
</script>

<template>
  <main class="app-shell">
    <header class="brand-bar">
      <div>
        <span class="eyebrow">GONGZHU · ONLINE</span>
        <h1>拱猪</h1>
        <p>Gongzhu by duanap</p>
      </div>
      <div class="connection" :class="{ online: game.connected }">{{ game.connected ? '已连接' : '连接中' }}</div>
    </header>

    <section v-if="!game.roomId" class="entry-card">
      <div class="hero-mark">♠<span>♥</span>♣<span>♦</span></div>
      <h2>四人在线拱猪</h2>
      <p>亮猪、亮羊、亮红、亮变。累计分跌到 -1000 后，最高分者获胜。</p>
      <label>昵称<input v-model="nickname" maxlength="20" autocomplete="nickname"></label>
      <div class="entry-actions">
        <button class="primary" @click="createRoom">创建房间</button>
        <div class="join-row"><input v-model="joinCode" maxlength="4" inputmode="numeric" placeholder="4 位房间号"><button @click="joinRoom">加入</button></div>
      </div>
    </section>

    <template v-else>
      <section class="room-strip">
        <div><small>房间</small><strong>{{ game.roomId }}</strong></div>
        <div><small>规则</small><strong>{{ game.ruleSet }}</strong></div>
        <div><small>第几副</small><strong>{{ game.roundNo || '等待' }}</strong></div>
        <button v-if="game.phase === 'lobby' && game.isHost" class="primary" @click="socket.fillBotsAndStart">AI 补位并开始</button>
        <button class="ghost" @click="game.isHost ? socket.disbandRoom() : socket.leaveRoom()">{{ game.isHost ? '解散' : '退出' }}</button>
      </section>

      <section class="score-grid">
        <article v-for="(player, index) in game.players" :key="player.id" :class="{ active: index === game.currentPlayer, self: index === game.yourIndex }">
          <div><strong>{{ player.name }}</strong><small>{{ player.isBot ? 'AI' : (player.connected ? '在线' : '离线') }}</small></div>
          <b>{{ player.total }}</b>
          <span>本副 {{ player.round >= 0 ? '+' : '' }}{{ player.round }} · {{ player.handCount }} 张</span>
        </article>
      </section>

      <section v-if="game.phase === 'lobby'" class="stage-card waiting">
        <h2>等待牌友</h2><p>凑齐四人自动开始；房主也可以用 AI 补齐空位。</p>
      </section>

      <section v-if="game.phase === 'declare'" class="stage-card declare-card">
        <div class="stage-title"><div><small>秘密亮牌</small><h2>选择要亮的牌</h2></div><b :class="{ urgent: declarationSeconds <= 5 }">{{ declarationSeconds }}s</b></div>
        <p>选择只由你自己看到；四人全部提交后同时公开。可以一张不亮。</p>
        <div class="declaration-status">
          <span v-for="(player, index) in game.players" :key="player.id" :class="{ done: game.declarationSubmitted[index] }">{{ player.name }} {{ game.declarationSubmitted[index] ? '✓' : '…' }}</span>
        </div>
        <div class="declarable-list">
          <button v-for="card in declarable" :key="card.id" :class="['playing-card', card.suit, { selected: declarationChoice.includes(card.id) }]" :disabled="submitted" @click="toggleDeclaration(card.id)">
            <strong>{{ rankName(card.rank) }}{{ suitSymbol[card.suit] }}</strong><em>{{ specialName[card.id] }}</em>
          </button>
          <span v-if="!declarable.length" class="empty-choice">你没有可亮的牌</span>
        </div>
        <button class="primary wide" :disabled="submitted" @click="submitDeclaration">{{ submitted ? '已提交，等待其他玩家' : (declarationChoice.length ? `确认亮 ${declarationChoice.length} 张` : '不亮') }}</button>
      </section>

      <section v-if="game.phase === 'play'" class="table-stage">
        <div class="table-message"><small>第 {{ game.trickNo + 1 }} 墩</small><strong>{{ game.currentPlayer === game.yourIndex ? '轮到你出牌' : `等待 ${currentName} 出牌` }}</strong></div>
        <div class="declarations" v-if="game.declarations.length"><span v-for="item in game.declarations" :key="`${item.player}-${item.cardId}`">{{ game.players[item.player]?.name }} 亮{{ specialName[item.cardId] }}</span></div>
        <div class="trick-zone">
          <div v-for="play in game.trick" :key="play.player" :class="['trick-play', `seat-${play.player}`]">
            <small>{{ game.players[play.player]?.name }}</small>
            <div :class="['playing-card', play.card.suit]"><strong>{{ rankName(play.card.rank) }}{{ suitSymbol[play.card.suit] }}</strong></div>
          </div>
          <span v-if="!game.trick.length">等待首出</span>
        </div>
      </section>

      <section v-if="['play', 'declare'].includes(game.phase)" class="hand-panel">
        <div class="hand-title"><strong>你的手牌</strong><span>{{ game.hand.length }} 张</span></div>
        <div class="hand-cards">
          <button v-for="card in game.hand" :key="card.id" :aria-label="cardLabel(card)" :class="['playing-card', card.suit, { legal: game.legalCardIds.includes(card.id), special: specialName[card.id] }]" :disabled="game.phase !== 'play' || !game.legalCardIds.includes(card.id)" @click="socket.playCard(card.id)">
            <strong>{{ rankName(card.rank) }}{{ suitSymbol[card.suit] }}</strong><em v-if="specialName[card.id]">{{ specialName[card.id] }}</em>
          </button>
        </div>
      </section>

      <section v-if="['roundEnd', 'gameEnd'].includes(game.phase)" class="stage-card results">
        <div class="stage-title"><div><small>{{ game.phase === 'gameEnd' ? '整场结束' : '本副结算' }}</small><h2>{{ game.phase === 'gameEnd' ? `${winnerNames} 获胜` : (game.overtime ? '最高分并列，进入加赛' : '计分完成') }}</h2></div></div>
        <article v-for="player in sortedPlayers" :key="player.id">
          <div><strong>{{ player.name }}</strong><small v-if="player.scoreBreakdown">红 {{ player.scoreBreakdown.components.hearts }} · 猪 {{ player.scoreBreakdown.components.pig }} · 羊 {{ player.scoreBreakdown.components.sheep }} · ×{{ player.scoreBreakdown.components.transformer }}</small></div>
          <span>本副 {{ player.round >= 0 ? '+' : '' }}{{ player.round }}</span><b>{{ player.total }}</b>
        </article>
        <button v-if="game.isHost && game.phase === 'roundEnd'" class="primary wide" @click="socket.startNextRound">{{ game.overtime ? '开始加赛' : '开始下一副' }}</button>
        <button v-if="game.isHost && game.phase === 'gameEnd'" class="primary wide" @click="socket.restartGame">再来一场</button>
      </section>
    </template>

    <aside v-if="game.lastError || game.notice" class="toast" @click="game.lastError = ''; game.notice = ''">{{ game.lastError || game.notice }}</aside>
  </main>
</template>
