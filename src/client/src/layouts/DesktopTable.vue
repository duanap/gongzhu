<script setup>
import AiLearningPanel from '../components/AiLearningPanel.vue';
import BroadcastOverlay from '../components/BroadcastOverlay.vue';
import DebugPanel from '../components/DebugPanel.vue';
import EventLogPanel from '../components/EventLogPanel.vue';
import GameInfoPanel from '../components/GameInfoPanel.vue';
import HelpPanel from '../components/HelpPanel.vue';
import InteractionFab from '../components/InteractionFab.vue';
import LastTrickPopover from '../components/LastTrickPopover.vue';
import LegacyModal from '../components/LegacyModal.vue';
import OpponentHand from '../components/OpponentHand.vue';
import PlayerHand from '../components/PlayerHand.vue';
import ResultPanel from '../components/ResultPanel.vue';
import RoomPanel from '../components/RoomPanel.vue';
import RoundDetailPanel from '../components/RoundDetailPanel.vue';
import Seat from '../components/Seat.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import SweepOfferModal from '../components/SweepOfferModal.vue';
import TableInteractionEffects from '../components/TableInteractionEffects.vue';
import TableSweepCollectOverlay from '../components/TableSweepCollectOverlay.vue';
import TableCenter from '../components/TableCenter.vue';
import TableCardFlowOverlay from '../components/TableCardFlowOverlay.vue';
import TrickArea from '../components/TrickArea.vue';
import UserDataPanel from '../components/UserDataPanel.vue';
import YourTurnReminder from '../components/YourTurnReminder.vue';
import { computed, ref, watch } from 'vue';
import { useFullscreen } from '../composables/useFullscreen';
import { useDialogFocus } from '../composables/useDialogFocus';
import { APP_VERSION } from '../releaseInfo';
import { clearClientCache } from '../stores/gameState';

const props = defineProps({
  identity: {
    type: Object,
    required: true
  },
  game: {
    type: Object,
    required: true
  },
  status: {
    type: String,
    default: ''
  }
});

defineEmits([
  'login',
  'logout',
  'refresh',
  'create-room',
  'join-room',
  'start-game',
  'fill-bots',
  'leave-room',
  'disband-room',
  'update-nickname',
  'clear-error',
  'pass-cards',
  'play-card',
  'start-next-round',
  'restart-game',
  'sweep-cards',
  'send-interaction',
  'takeover-offline',
  'approve-bot-takeover'
]);

const roomDismissed = ref(false);
const roomPanelForcedOpen = ref(false);
const activePanel = ref('');
const showRoundTableModal = ref(false);
const resultModalOpen = ref(false);
const interactionFabRef = ref(null);
const roomDialogRef = ref(null);
const roundTableDialogRef = ref(null);
const { fullscreenActive, toggleFullscreen } = useFullscreen();

const roomAutoVisible = computed(() => ['offline', 'lobby'].includes(props.game.phase));
const showRoomModal = computed(() => roomPanelForcedOpen.value || (roomAutoVisible.value && !roomDismissed.value));

watch(() => props.game.phase, phase => {
  if (!['offline', 'lobby'].includes(phase)) {
    roomPanelForcedOpen.value = false;
    roomDismissed.value = true;
  }
  resultModalOpen.value = phase === 'gameEnd';
  if (!['roundEnd', 'gameEnd'].includes(phase)) showRoundTableModal.value = false;
});

watch(() => props.game.roomId, roomId => {
  if (!roomId && ['offline', 'lobby'].includes(props.game.phase)) {
    roomDismissed.value = false;
    roomPanelForcedOpen.value = true;
  }
});

watch(
  () => props.game.botTakeoverRequests.map(request => request.requestId).join('|'),
  requestKey => {
    if (requestKey && props.game.isHost) {
      openRoomModal();
    }
  }
);

function openRoomModal() {
  roomPanelForcedOpen.value = true;
  roomDismissed.value = false;
  activePanel.value = '';
}

function closeRoomModal() {
  roomPanelForcedOpen.value = false;
  roomDismissed.value = true;
}

function refreshCache() {
  if (!window.confirm('确定清除本地缓存并刷新页面吗？')) return;
  clearClientCache();
}

function openSettingsModal() {
  roomPanelForcedOpen.value = false;
  roomDismissed.value = true;
  activePanel.value = 'settings';
}

useDialogFocus(roomDialogRef, () => showRoomModal.value, closeRoomModal);
useDialogFocus(roundTableDialogRef, () => showRoundTableModal.value, () => { showRoundTableModal.value = false; });
</script>

<template>
  <main
    class="app-shell desktop-shell legacy-desktop-shell"
    :class="{ 'room-modal-open': showRoomModal }"
  >
    <header class="legacy-topbar">
      <div class="legacy-brand">
        <strong>Hearts by duanap</strong>
        <span>{{ APP_VERSION }}</span>
      </div>
      <div class="legacy-top-actions">
        <button class="top-btn" type="button" :aria-pressed="fullscreenActive" @click="toggleFullscreen">{{ fullscreenActive ? '缩小' : '全屏' }}</button>
        <button class="top-btn" type="button" @click="openRoomModal">{{ game.roomId ? `房间 ${game.roomId}` : '房间' }}</button>
        <button
          v-if="identity.authenticated"
          class="top-btn auth-main-btn"
          type="button"
          @click="$emit('logout')"
        >
          <span>已登录</span>
        </button>
        <button
          v-else
          class="top-btn auth-main-btn"
          type="button"
          @click="$emit('login')"
        >
          <span>QQ登录</span>
        </button>
        <button class="top-btn" type="button" @click="openSettingsModal">设置</button>
      </div>
    </header>

    <section class="legacy-table-scene" :class="{ 'modal-open': showRoomModal, 'round-ended': game.phase === 'roundEnd' }">
      <section class="desktop-game-stage legacy-game-stage" :class="{ dealing: game.phase === 'deal' }">
        <Seat class="seat-north" :player="game.viewPlayers[2]" label="上家" :current="game.phase === 'play' && game.currentViewPlayer === 2" @avatar-click="interactionFabRef?.openTarget(2)" />
        <Seat class="seat-west" :player="game.viewPlayers[1]" label="左家" :current="game.phase === 'play' && game.currentViewPlayer === 1" @avatar-click="interactionFabRef?.openTarget(1)" />
        <Seat class="seat-east" :player="game.viewPlayers[3]" label="右家" :current="game.phase === 'play' && game.currentViewPlayer === 3" @avatar-click="interactionFabRef?.openTarget(3)" />
        <Seat class="seat-south" :player="game.viewPlayers[0]" label="你" active :current="game.phase === 'play' && game.currentViewPlayer === 0" @avatar-click="interactionFabRef?.openTarget(0)" />

        <OpponentHand :count="game.viewPlayers[2]?.handCount" position="north" />
        <OpponentHand :count="game.viewPlayers[1]?.handCount" position="west" />
        <OpponentHand :count="game.viewPlayers[3]?.handCount" position="east" />

        <div class="center-stack">
          <TableCenter
            :game="game"
            @open-room="openRoomModal"
            @open-result="resultModalOpen = true"
            @open-round-table="showRoundTableModal = true"
            @start-next-round="$emit('start-next-round')"
          />
          <TrickArea :trick="game.trickView" :players="game.viewPlayers" :game="game" />
        </div>
        <GameInfoPanel class="desktop-info-panel" :game="game" />
        <BroadcastOverlay :game="game" />
        <YourTurnReminder :game="game" />
        <TableInteractionEffects :game="game" />
        <TableCardFlowOverlay :game="game" />
        <TableSweepCollectOverlay :game="game" />
        <SweepOfferModal :game="game" @sweep-cards="$emit('sweep-cards')" />
        <LastTrickPopover :game="game" />
        <InteractionFab ref="interactionFabRef" :game="game" @send-interaction="$emit('send-interaction', $event)" />
      </section>

      <ResultPanel
        class="desktop-result legacy-result"
        :game="game"
        :open="resultModalOpen"
        @close="resultModalOpen = false"
        @open-round-table="resultModalOpen = false; showRoundTableModal = true"
        @open-versions="resultModalOpen = false; activePanel = 'help-versions'"
        @restart-game="$emit('restart-game')"
      />

      <PlayerHand
        class="desktop-hand legacy-hand"
        :game="game"
        @pass-cards="$emit('pass-cards', $event)"
        @play-card="$emit('play-card', $event)"
      />

      <button
        v-if="showRoomModal"
        class="legacy-room-modal-mask"
        type="button"
        aria-label="关闭联机房间"
        @click="closeRoomModal"
      />
      <section
        v-if="showRoomModal"
        ref="roomDialogRef"
        class="legacy-room-modal"
        role="dialog"
        aria-modal="true"
        aria-label="联机房间"
        tabindex="-1"
      >
        <button class="legacy-modal-close" type="button" aria-label="关闭" data-dialog-initial-focus @click="closeRoomModal">×</button>
        <RoomPanel
          :identity="identity"
          :game="game"
          @login="$emit('login')"
          @logout="$emit('logout')"
          @create-room="$emit('create-room')"
          @join-room="$emit('join-room', $event)"
          @start-game="$emit('start-game')"
          @fill-bots="$emit('fill-bots')"
          @takeover-offline="$emit('takeover-offline')"
          @approve-bot-takeover="(requestId, approved) => $emit('approve-bot-takeover', requestId, approved)"
          @leave-room="$emit('leave-room')"
          @disband-room="$emit('disband-room')"
          @update-nickname="$emit('update-nickname', $event)"
          @clear-error="$emit('clear-error')"
          @close-panel="closeRoomModal"
        />
      </section>
    </section>

    <LegacyModal
      v-if="activePanel === 'settings'"
      title="设置"
      subtitle="按分区调整特效、音效和项目资料。"
      variant="settings"
      :show-bottom-close="false"
      @close="activePanel = ''"
    >
      <SettingsPanel :game="game" show-close @open-panel="activePanel = $event" @close-panel="activePanel = ''" />
    </LegacyModal>

    <LegacyModal v-if="activePanel === 'help-rules'" title="岛屿规则提示" variant="rules" @close="activePanel = ''">
      <HelpPanel initial-tab="rules" />
    </LegacyModal>

    <LegacyModal
      v-if="activePanel === 'help-versions'"
      title="版本更新日志"
      subtitle="可在此查看不同版本的主要更新内容。"
      variant="versions"
      @close="activePanel = ''"
    >
      <HelpPanel initial-tab="versions" />
    </LegacyModal>

    <LegacyModal
      v-if="activePanel === 'log'"
      title="出牌日志"
      subtitle="最新记录在上方，可按事件类型筛选。"
      eyebrow="MATCH HISTORY"
      variant="wide"
      @close="activePanel = ''"
    >
      <EventLogPanel :game="game" />
    </LegacyModal>

    <LegacyModal
      v-if="activePanel === 'ai-learning'"
      title="AI 学习数据"
      subtitle="查看当前样本、策略权重和对手倾向，仅房主可查看完整数据。"
      eyebrow="AI STRATEGY LAB"
      variant="wide"
      @close="activePanel = ''"
    >
      <AiLearningPanel :game="game" />
    </LegacyModal>

    <LegacyModal
      v-if="activePanel === 'stats'"
      title="战绩"
      subtitle="查看个人统计、排行榜和最近对局。"
      variant="wide"
      @close="activePanel = ''"
    >
      <UserDataPanel :identity="identity" :game="game" />
    </LegacyModal>

    <LegacyModal
      v-if="activePanel === 'debug'"
      title="特效播报调试"
      subtitle="点击“播放”可预览所有提示播报，预览会自动飞出并消失。"
      variant="debug"
      @close="activePanel = ''"
    >
      <DebugPanel @open-round-table="activePanel = ''; showRoundTableModal = true" />
    </LegacyModal>

    <section v-if="showRoundTableModal" class="legacy-round-table-modal">
      <button class="result-modal-mask" type="button" aria-label="关闭牌桌" @click="showRoundTableModal = false" />
      <div ref="roundTableDialogRef" class="legacy-round-table-card" role="dialog" aria-modal="true" aria-label="查看牌桌" tabindex="-1">
        <button class="legacy-modal-close" type="button" aria-label="关闭" data-dialog-initial-focus @click="showRoundTableModal = false">×</button>
        <RoundDetailPanel :game="game" round-table-only />
      </div>
    </section>

    <footer class="status-line legacy-status-line">{{ status }}</footer>
  </main>
</template>
