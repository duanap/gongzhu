<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Card from './Card.vue';
import { effectDelay, readClientSettings } from '../services/preferences';
import { EFFECT_TIMINGS, collectFlightMilliseconds } from '../services/effectTimings.mjs';
import { viewportPointToOverlay } from '../services/overlayCoordinates.mjs';

const props = defineProps({
  game: {
    type: Object,
    required: true
  },
  teleportTarget: {
    type: String,
    default: 'body'
  }
});

const passCards = ref([]);
const collectCards = ref([]);
const receiveMessage = ref('');
let passTimer = null;
let collectTimer = null;
let receiveTimer = null;

function centerOf(selector, fallbackViewIndex) {
  const element = document.querySelector(selector) || document.querySelector(`.seat-${['south', 'west', 'north', 'east'][fallbackViewIndex]}`);
  const rect = element?.getBoundingClientRect();
  if (!rect) return null;
  return viewportPointToOverlay({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
}

function pileCenter(viewIndex) {
  const selectors = [
    '.hand-panel .card-row',
    '.opponent-hand-west',
    '.opponent-hand-north',
    '.opponent-hand-east'
  ];
  const element = document.querySelector(selectors[viewIndex]);
  const rects = Array.from(element?.children || [])
    .map(child => child.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0);
  if (!rects.length) return centerOf(selectors[viewIndex], viewIndex);
  const left = Math.min(...rects.map(rect => rect.left));
  const right = Math.max(...rects.map(rect => rect.right));
  const top = Math.min(...rects.map(rect => rect.top));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  return viewportPointToOverlay({ x: (left + right) / 2, y: (top + bottom) / 2 });
}

function cardName(card) {
  const rank = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[card?.rank] || card?.rank || '';
  const suit = { C: '梅花', D: '方片', S: '黑桃', H: '红桃' }[card?.suit] || card?.suit || '';
  return `${suit}${rank}`;
}

watch(
  () => {
    const flow = props.game.passFlowView;
    return flow?.seq ? `${props.game.roomId}:${flow.seq}:${flow.roundNo}:${flow.passMode}` : '';
  },
  async key => {
    if (!key || props.game.phase !== 'play') return;
    await nextTick();
    const flows = Array.isArray(props.game.passFlowView?.flows) ? props.game.passFlowView.flows : [];
    const cards = [];
    flows.forEach((flow, flowIndex) => {
      const start = pileCenter(flow.from);
      const end = pileCenter(flow.to);
      if (!start || !end) return;
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      for (let index = 0; index < Math.max(1, Math.min(3, Number(flow.count || 3))); index++) {
        cards.push({
          key: `${key}:${flowIndex}:${index}`,
          style: {
            left: `${Math.round(start.x)}px`,
            top: `${Math.round(start.y)}px`,
            '--pass-to-x': `${Math.round(end.x - start.x)}px`,
            '--pass-to-y': `${Math.round(end.y - start.y)}px`,
            '--pass-arc-y': `${-Math.round(Math.max(10, Math.min(34, distance * .055))) + index * 4}px`,
            '--pass-fly-delay': `${flowIndex * 145 + index * 104}ms`,
            '--pass-fly-rot': `${(index - 1) * 9}deg`
          }
        });
      }
    });
    passCards.value = cards;
    window.clearTimeout(passTimer);
    passTimer = window.setTimeout(() => { passCards.value = []; }, effectDelay(3400));
  }
);

watch(
  () => `${props.game.roomId}:${props.game.roundNo}:${(props.game.receivedCards || []).map(card => card.id).join('|')}`,
  key => {
    if (!props.game.receivedCards?.length || !key) return;
    receiveMessage.value = `你从${props.game.receivedFrom || '其他玩家'}收到：${props.game.receivedCards.map(cardName).join('、')}`;
    window.clearTimeout(receiveTimer);
    receiveTimer = window.setTimeout(() => { receiveMessage.value = ''; }, 5200);
  }
);

watch(
  () => props.game.collectingTrick,
  async collecting => {
    if (!collecting || props.game.trickView.length < 4 || props.game.trickWinnerView == null) return;
    await nextTick();
    const winner = Number(props.game.trickWinnerView);
    const winnerElement = document.querySelector(`.trick-panel .trick-play.trick-player-${winner} .game-card`);
    const winnerRect = winnerElement?.getBoundingClientRect();
    if (!winnerRect) return;

    const winnerCenter = viewportPointToOverlay({
      x: winnerRect.left + winnerRect.width / 2,
      y: winnerRect.top + winnerRect.height / 2
    });
    const target = winner === 0
      ? pileCenter(0)
      : centerOf(`.seat-${['south', 'west', 'north', 'east'][winner]} .seat-avatar`, winner);
    if (!target) return;
    const losers = props.game.trickView.map(play => play.player).filter(player => player !== winner);
    const effectSpeed = readClientSettings().effectSpeed;
    let maxDuration = 0;
    collectCards.value = props.game.trickView.flatMap(play => {
      const original = document.querySelector(`.trick-panel .trick-play.trick-player-${play.player} .game-card`);
      const rect = original?.getBoundingClientRect();
      if (!rect || !play.card) return [];
      const loserIndex = Math.max(0, losers.indexOf(play.player));
      const isWinner = play.player === winner;
      const stackX = isWinner ? 0 : [-7, 0, 7][loserIndex % 3];
      const stackY = isWinner ? 0 : 8 + loserIndex * 5;
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      const gatherX = Math.round(winnerCenter.x - startX + stackX);
      const gatherY = Math.round(winnerCenter.y - startY + stackY);
      const finalX = Math.round(target.x - startX + stackX);
      const finalY = Math.round(target.y - startY + stackY);
      const travel = Math.hypot(finalX - gatherX, finalY - gatherY);
      const duration = collectFlightMilliseconds(travel, effectSpeed);
      maxDuration = Math.max(maxDuration, duration);
      return [{
        key: `${props.game.roundNo}:${props.game.trickNo}:${play.player}:${play.card.id}`,
        card: play.card,
        player: play.player,
        winner,
        style: {
          left: `${Math.round(startX)}px`,
          top: `${Math.round(startY)}px`,
          '--collect-gather-x': `${gatherX}px`,
          '--collect-gather-y': `${gatherY}px`,
          '--collect-to-x': `${finalX}px`,
          '--collect-to-y': `${finalY}px`,
          '--collect-z': isWinner ? '44' : String(40 - loserIndex),
          '--collect-stack-rot': isWinner ? '0deg' : `${[-6, 2, 7][loserIndex % 3]}deg`,
          '--collect-end-rot': isWinner ? '0deg' : `${[-9, 3, 9][loserIndex % 3]}deg`,
          '--collect-flight-duration': `${duration}ms`
        }
      }];
    });

    window.clearTimeout(collectTimer);
    collectTimer = window.setTimeout(
      () => { collectCards.value = []; },
      maxDuration + EFFECT_TIMINGS.collectCleanupBuffer
    );
  }
);

onBeforeUnmount(() => {
  window.clearTimeout(passTimer);
  window.clearTimeout(collectTimer);
  window.clearTimeout(receiveTimer);
});
</script>

<template>
  <Teleport :to="teleportTarget">
    <div class="pass-flight-layer-vue" aria-hidden="true">
      <span v-for="item in passCards" :key="item.key" class="pass-flight-card-vue" :style="item.style" />
    </div>
    <div v-if="receiveMessage" class="receive-toast-vue" role="status">{{ receiveMessage }}</div>
    <div class="collect-flight-layer-vue" aria-hidden="true">
      <div
        v-for="item in collectCards"
        :key="item.key"
        class="collect-flight-card-vue"
        :data-player="item.player"
        :data-winner="item.winner"
        :style="item.style"
      >
        <Card :card="item.card" compact />
      </div>
    </div>
  </Teleport>
</template>
