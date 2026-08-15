<script setup>
import { computed, ref, watch } from 'vue';
import EventLogPanel from '../components/EventLogPanel.vue';
import GameInfoPanel from '../components/GameInfoPanel.vue';
import OpponentHand from '../components/OpponentHand.vue';
import PlayerHand from '../components/PlayerHand.vue';
import ResultPanel from '../components/ResultPanel.vue';
import RoomPanel from '../components/RoomPanel.vue';
import RoundSummaryPanel from '../components/RoundSummaryPanel.vue';
import RulesPanel from '../components/RulesPanel.vue';
import Seat from '../components/Seat.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import TableCenter from '../components/TableCenter.vue';
import TrickArea from '../components/TrickArea.vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import { useFullscreen } from '../composables/useFullscreen';
import { APP_VERSION } from '../releaseInfo';

const props = defineProps({ game: { type: Object, required: true }, status: { type: String, default: '' } });
defineEmits(['create-room', 'join-room', 'fill-bots', 'leave-room', 'disband-room', 'update-nickname', 'clear-error', 'declare-cards', 'play-card', 'set-pace', 'start-next-round', 'restart-game']);
const activePanel = ref('');
const resultOpen = ref(false);
const dialogRef = ref(null);
const { fullscreenActive, toggleFullscreen } = useFullscreen({ lockLandscape: true, bodyClass: 'force-landscape' });
const panelTitle = computed(() => ({ room: props.game.roomId ? `房间 ${props.game.roomId}` : '联机房间', rules: '拱猪规则', settings: '设置', log: '出牌日志', round: '本副结算' }[activePanel.value] || '工具'));
const panelSubtitle = computed(() => ({ room: '创建房间或加入牌友的房间。', rules: 'gongzhu-v1 · 亮猪、亮羊、亮红、亮变', settings: '调整牌桌显示并打开常用工具。', log: '最新事件显示在最上方。', round: '查看本副原始分与累计分。' }[activePanel.value] || ''));

watch(() => props.game.phase, phase => {
  activePanel.value = ['offline', 'lobby'].includes(phase) ? 'room' : (activePanel.value === 'room' ? '' : activePanel.value);
  resultOpen.value = phase === 'gameEnd';
}, { immediate: true });
watch(() => props.game.roomId, roomId => { if (!roomId) activePanel.value = 'room'; });
useDialogFocus(dialogRef, () => activePanel.value, () => { activePanel.value = ''; });
</script>

<template>
  <main class="app-shell mobile-shell" :class="{ 'mobile-result-open': resultOpen, 'room-modal-open': activePanel === 'room' }">
    <header class="app-bar">
      <div><strong>拱猪 · Gongzhu</strong><span>{{ APP_VERSION }}</span></div>
      <div class="app-bar-actions"><button class="icon-link fullscreen-button" type="button" @click="toggleFullscreen">{{ fullscreenActive ? '缩小' : '全屏' }}</button><button class="icon-link room-button" :class="{ 'has-room': game.roomId }" type="button" @click="activePanel = activePanel === 'room' ? '' : 'room'">{{ game.roomId ? `房间 ${game.roomId}` : '房间' }}</button><button class="qq-login-button compact" type="button" @click="activePanel = 'rules'">规则</button><button class="icon-link" type="button" @click="activePanel = 'settings'">设置</button></div>
    </header>
    <section class="mobile-game-stage">
      <Seat class="seat-north" :player="game.viewPlayers[2]" label="上家" :current="game.phase === 'play' && game.currentViewPlayer === 2" />
      <div class="mobile-side-seats"><Seat class="seat-west" :player="game.viewPlayers[1]" label="左家" :current="game.phase === 'play' && game.currentViewPlayer === 1" /><Seat class="seat-east" :player="game.viewPlayers[3]" label="右家" :current="game.phase === 'play' && game.currentViewPlayer === 3" /></div>
      <OpponentHand :count="game.viewPlayers[2]?.handCount" position="north" /><OpponentHand :count="game.viewPlayers[1]?.handCount" position="west" /><OpponentHand :count="game.viewPlayers[3]?.handCount" position="east" />
      <TableCenter :game="game" @open-room="activePanel = 'room'" @open-result="resultOpen = true" @open-round-summary="activePanel = 'round'" @start-next-round="$emit('start-next-round')" />
      <TrickArea :trick="game.trickView" :players="game.viewPlayers" :settling="game.settlingTrick" :winner-player="game.trickWinnerViewPlayer" />
      <GameInfoPanel class="mobile-score-panel" :game="game" />
      <Seat class="seat-south" :player="game.viewPlayers[0]" label="你" active :current="game.phase === 'play' && game.currentViewPlayer === 0" />
    </section>
    <ResultPanel :game="game" :open="resultOpen" @close="resultOpen = false" @restart-game="$emit('restart-game')" />
    <PlayerHand :game="game" @declare-cards="$emit('declare-cards', $event)" @play-card="$emit('play-card', $event)" />
    <div v-if="activePanel" class="mobile-tool-backdrop" aria-hidden="true" @click="activePanel = ''" />
    <section v-if="activePanel" ref="dialogRef" class="mobile-tool-sheet" :class="[`panel-${activePanel}`, { 'room-modal': activePanel === 'room', 'settings-modal': activePanel === 'settings', 'tools-modal': activePanel !== 'room' }]" role="dialog" aria-modal="true" :aria-label="panelTitle" tabindex="-1">
      <header><div class="mobile-modal-title-copy"><strong>{{ panelTitle }}</strong><small>{{ panelSubtitle }}</small></div><button class="legacy-modal-close" type="button" aria-label="关闭" data-dialog-initial-focus @click="activePanel = ''">×</button></header>
      <div class="mobile-sheet-body">
        <RoomPanel v-if="activePanel === 'room'" :game="game" @create-room="$emit('create-room')" @join-room="$emit('join-room', $event)" @fill-bots="$emit('fill-bots')" @leave-room="$emit('leave-room')" @disband-room="$emit('disband-room')" @update-nickname="$emit('update-nickname', $event)" @clear-error="$emit('clear-error')" @close-panel="activePanel = ''" />
        <RulesPanel v-if="activePanel === 'rules'" />
        <SettingsPanel v-if="activePanel === 'settings'" :game="game" @open-panel="activePanel = $event" @set-pace="$emit('set-pace', $event)" />
        <EventLogPanel v-if="activePanel === 'log'" :game="game" />
        <RoundSummaryPanel v-if="activePanel === 'round'" :game="game" />
      </div>
    </section>
    <footer class="status-line">{{ status }}</footer>
  </main>
</template>
