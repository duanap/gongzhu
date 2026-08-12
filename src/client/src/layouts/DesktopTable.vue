<script setup>
import { computed, ref, watch } from 'vue';
import DeclarationPanel from '../components/DeclarationPanel.vue';
import GameInfoPanel from '../components/GameInfoPanel.vue';
import OpponentHand from '../components/OpponentHand.vue';
import PlayerHand from '../components/PlayerHand.vue';
import ResultPanel from '../components/ResultPanel.vue';
import RoomPanel from '../components/RoomPanel.vue';
import RoundSummaryPanel from '../components/RoundSummaryPanel.vue';
import Seat from '../components/Seat.vue';
import TableCenter from '../components/TableCenter.vue';
import TrickArea from '../components/TrickArea.vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import { useFullscreen } from '../composables/useFullscreen';
import { APP_VERSION } from '../releaseInfo';

const props = defineProps({ game: { type: Object, required: true }, status: { type: String, default: '' } });
defineEmits(['create-room', 'join-room', 'fill-bots', 'leave-room', 'disband-room', 'update-nickname', 'clear-error', 'declare-cards', 'play-card', 'start-next-round', 'restart-game']);
const roomDismissed = ref(false);
const roomForcedOpen = ref(false);
const resultOpen = ref(false);
const roomDialogRef = ref(null);
const { fullscreenActive, toggleFullscreen } = useFullscreen();
const roomAutoVisible = computed(() => ['offline', 'lobby'].includes(props.game.phase));
const showRoomModal = computed(() => roomForcedOpen.value || (roomAutoVisible.value && !roomDismissed.value));

watch(() => props.game.phase, phase => {
  if (!['offline', 'lobby'].includes(phase)) { roomForcedOpen.value = false; roomDismissed.value = true; }
  resultOpen.value = phase === 'gameEnd';
});
watch(() => props.game.roomId, roomId => { if (!roomId) { roomDismissed.value = false; roomForcedOpen.value = true; } });
function openRoom() { roomForcedOpen.value = true; roomDismissed.value = false; }
function closeRoom() { roomForcedOpen.value = false; roomDismissed.value = true; }
useDialogFocus(roomDialogRef, () => showRoomModal.value, closeRoom);
</script>

<template>
  <main class="app-shell desktop-shell legacy-desktop-shell" :class="{ 'room-modal-open': showRoomModal }">
    <header class="legacy-topbar">
      <div class="legacy-brand"><strong>拱猪 · Gongzhu by duanap</strong><span>{{ APP_VERSION }}</span></div>
      <div class="legacy-top-actions">
        <button class="top-btn" type="button" :aria-pressed="fullscreenActive" @click="toggleFullscreen">{{ fullscreenActive ? '缩小' : '全屏' }}</button>
        <button class="top-btn" type="button" @click="openRoom">{{ game.roomId ? `房间 ${game.roomId}` : '房间' }}</button>
        <span class="gongzhu-online-state" :class="{ online: game.connected }">{{ game.connected ? '已连接' : '连接中' }}</span>
      </div>
    </header>

    <section class="legacy-table-scene" :class="{ 'modal-open': showRoomModal, 'round-ended': game.phase === 'roundEnd' }">
      <section class="desktop-game-stage legacy-game-stage">
        <Seat class="seat-north" :player="game.viewPlayers[2]" label="上家" :current="game.phase === 'play' && game.currentViewPlayer === 2" />
        <Seat class="seat-west" :player="game.viewPlayers[1]" label="左家" :current="game.phase === 'play' && game.currentViewPlayer === 1" />
        <Seat class="seat-east" :player="game.viewPlayers[3]" label="右家" :current="game.phase === 'play' && game.currentViewPlayer === 3" />
        <Seat class="seat-south" :player="game.viewPlayers[0]" label="你" active :current="game.phase === 'play' && game.currentViewPlayer === 0" />
        <OpponentHand :count="game.viewPlayers[2]?.handCount" position="north" />
        <OpponentHand :count="game.viewPlayers[1]?.handCount" position="west" />
        <OpponentHand :count="game.viewPlayers[3]?.handCount" position="east" />
        <div class="center-stack"><TableCenter :game="game" @open-room="openRoom" @open-result="resultOpen = true" @start-next-round="$emit('start-next-round')" /><TrickArea :trick="game.trickView" :players="game.viewPlayers" /></div>
        <GameInfoPanel class="desktop-info-panel" :game="game" />
        <DeclarationPanel :game="game" />
        <RoundSummaryPanel :game="game" />
      </section>

      <ResultPanel class="desktop-result legacy-result" :game="game" :open="resultOpen" @close="resultOpen = false" @restart-game="$emit('restart-game')" />
      <PlayerHand class="desktop-hand legacy-hand" :game="game" @declare-cards="$emit('declare-cards', $event)" @play-card="$emit('play-card', $event)" />
      <button v-if="showRoomModal" class="legacy-room-modal-mask" type="button" aria-label="关闭联机房间" @click="closeRoom" />
      <section v-if="showRoomModal" ref="roomDialogRef" class="legacy-room-modal" role="dialog" aria-modal="true" aria-label="联机房间" tabindex="-1">
        <button class="legacy-modal-close" type="button" aria-label="关闭" data-dialog-initial-focus @click="closeRoom">×</button>
        <RoomPanel :game="game" @create-room="$emit('create-room')" @join-room="$emit('join-room', $event)" @fill-bots="$emit('fill-bots')" @leave-room="$emit('leave-room')" @disband-room="$emit('disband-room')" @update-nickname="$emit('update-nickname', $event)" @clear-error="$emit('clear-error')" @close-panel="closeRoom" />
      </section>
    </section>
  </main>
</template>
