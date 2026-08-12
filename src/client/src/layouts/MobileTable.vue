<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AiLearningPanel from '../components/AiLearningPanel.vue';
import BroadcastOverlay from '../components/BroadcastOverlay.vue';
import DebugPanel from '../components/DebugPanel.vue';
import EventLogPanel from '../components/EventLogPanel.vue';
import GameInfoPanel from '../components/GameInfoPanel.vue';
import HelpPanel from '../components/HelpPanel.vue';
import InteractionFab from '../components/InteractionFab.vue';
import LastTrickPopover from '../components/LastTrickPopover.vue';
import OpponentHand from '../components/OpponentHand.vue';
import PlayerHand from '../components/PlayerHand.vue';
import ResultPanel from '../components/ResultPanel.vue';
import RoomPanel from '../components/RoomPanel.vue';
import RoundDetailPanel from '../components/RoundDetailPanel.vue';
import Seat from '../components/Seat.vue';
import SettingsPanel from '../components/SettingsPanel.vue';
import SweepOfferModal from '../components/SweepOfferModal.vue';
import TableCenter from '../components/TableCenter.vue';
import TableCardFlowOverlay from '../components/TableCardFlowOverlay.vue';
import TableInteractionEffects from '../components/TableInteractionEffects.vue';
import TableSweepCollectOverlay from '../components/TableSweepCollectOverlay.vue';
import TrickArea from '../components/TrickArea.vue';
import UserDataPanel from '../components/UserDataPanel.vue';
import YourTurnReminder from '../components/YourTurnReminder.vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import { APP_VERSION } from '../releaseInfo';

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

const activePanel = ref('');
const fullscreenActive = ref(Boolean(document.fullscreenElement));
const overlayReady = ref(false);
const roomShouldLead = computed(() => ['offline', 'lobby'].includes(props.game.phase));
const resultModalOpen = ref(false);
const interactionFabRef = ref(null);
const mobileDialogRef = ref(null);
const roomButtonText = computed(() => props.game.roomId ? `房间 ${props.game.roomId}` : '房间');
const panelTitle = computed(() => ({
  'round-table': '本局牌桌',
  log: '出牌日志',
  'ai-learning': 'AI 学习数据',
  stats: '战绩',
  room: props.game.roomId ? `房间 ${props.game.roomId}` : '联机房间',
  settings: '设置',
  'help-rules': '岛屿规则提示',
  'help-versions': '版本更新日志',
  debug: '特效播报调试'
}[activePanel.value] || '工具'));
const panelSubtitle = computed(() => ({
  room: '请选择创建房间或加入房间。',
  settings: '按分区调整特效、音效和项目资料。',
  'help-rules': '',
  'help-versions': '可在此查看不同版本的主要更新内容。',
  debug: '点击“播放”可预览所有提示播报，预览会自动飞出并消失。',
  'ai-learning': '查看当前样本、策略权重和对手倾向，仅房主可查看完整数据。',
  'round-table': '按座位查看本局牌面、传牌记录和本局分数。',
  log: '最新记录在上方，可按事件类型筛选。',
  stats: '查看个人统计、排行榜和最近对局。'
}[activePanel.value] || ''));

document.body.classList.add('force-landscape');

function syncFullscreenState() {
  fullscreenActive.value = Boolean(document.fullscreenElement);
}

async function requestLandscapeLock() {
  try {
    await window.screen?.orientation?.lock?.('landscape');
  } catch (error) {
    // The CSS shell remains the supported fallback when browser locking is unavailable.
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreenState);
  overlayReady.value = true;
  void requestLandscapeLock();
});

onBeforeUnmount(() => {
  overlayReady.value = false;
  document.removeEventListener('fullscreenchange', syncFullscreenState);
  document.body.classList.remove('force-landscape');
  try {
    window.screen?.orientation?.unlock?.();
  } catch (error) {
    // Ignore unsupported orientation cleanup.
  }
});

watch(() => props.game.phase, phase => {
  if (['offline', 'lobby'].includes(phase)) {
    activePanel.value = 'room';
  } else if (activePanel.value === 'room') {
    activePanel.value = '';
  }
  resultModalOpen.value = phase === 'gameEnd';
}, { immediate: true });

watch(() => props.game.roomId, roomId => {
  if (!roomId && ['offline', 'lobby'].includes(props.game.phase)) activePanel.value = 'room';
});

watch(
  () => props.game.botTakeoverRequests.map(request => request.requestId).join('|'),
  requestKey => {
    if (requestKey && props.game.isHost) activePanel.value = 'room';
  }
);

watch(activePanel, async () => {
  await nextTick();
  document.querySelector('.mobile-sheet-body')?.scrollTo({ top: 0 });
});

function togglePanel(panel) {
  activePanel.value = activePanel.value === panel ? '' : panel;
}

useDialogFocus(mobileDialogRef, () => activePanel.value, () => { activePanel.value = ''; });

async function copyRoomId() {
  if (!props.game.roomId) return;
  await navigator.clipboard?.writeText?.(String(props.game.roomId)).catch(() => {});
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen?.();
    fullscreenActive.value = false;
    return;
  }
  await document.documentElement.requestFullscreen?.();
  fullscreenActive.value = Boolean(document.fullscreenElement);
  await requestLandscapeLock();
}

</script>

<template>
  <main
    class="app-shell mobile-shell"
    :class="{ 'mobile-result-open': resultModalOpen, 'room-modal-open': activePanel === 'room' }"
  >
    <div id="mobile-overlay-root" class="mobile-overlay-root" />
    <header class="app-bar">
      <div>
        <strong>Hearts by duanap</strong>
        <span>{{ APP_VERSION }}</span>
      </div>
      <div class="app-bar-actions">
        <button class="icon-link fullscreen-button" type="button" :aria-pressed="fullscreenActive" @click="toggleFullscreen">
          {{ fullscreenActive ? '缩小' : '全屏' }}
        </button>
        <button class="icon-link room-button" :class="{ 'has-room': game.roomId }" type="button" @click="togglePanel('room')">
          {{ roomButtonText }}
        </button>
        <button
          v-if="!identity.authenticated"
          class="qq-login-button compact"
          type="button"
          @click="$emit('login')"
        >
          <span>QQ登录</span>
        </button>
        <button
          v-else
          class="qq-login-button compact"
          type="button"
          @click="$emit('logout')"
        >
          <span>已登录</span>
        </button>
        <button class="icon-link" type="button" @click="togglePanel('settings')">设置</button>
      </div>
    </header>

    <section class="mobile-game-stage" :class="{ dealing: game.phase === 'deal' }">
      <Seat class="seat-north" :player="game.viewPlayers[2]" label="上家" :current="game.phase === 'play' && game.currentViewPlayer === 2" @avatar-click="interactionFabRef?.openTarget(2)" />
      <div class="mobile-side-seats">
        <Seat class="seat-west" :player="game.viewPlayers[1]" label="左家" :current="game.phase === 'play' && game.currentViewPlayer === 1" @avatar-click="interactionFabRef?.openTarget(1)" />
        <Seat class="seat-east" :player="game.viewPlayers[3]" label="右家" :current="game.phase === 'play' && game.currentViewPlayer === 3" @avatar-click="interactionFabRef?.openTarget(3)" />
      </div>
      <OpponentHand :count="game.viewPlayers[2]?.handCount" position="north" />
      <OpponentHand :count="game.viewPlayers[1]?.handCount" position="west" />
      <OpponentHand :count="game.viewPlayers[3]?.handCount" position="east" />
      <TableCenter
        :game="game"
        @open-room="activePanel = 'room'"
        @open-result="resultModalOpen = true"
        @open-round-table="activePanel = 'round-table'"
        @start-next-round="$emit('start-next-round')"
      />
      <TrickArea :trick="game.trickView" :players="game.viewPlayers" :game="game" />
      <GameInfoPanel class="mobile-score-panel" :game="game" />
      <BroadcastOverlay :game="game" />
      <YourTurnReminder :game="game" />
      <TableInteractionEffects v-if="overlayReady" :game="game" teleport-target="#mobile-overlay-root" />
      <TableCardFlowOverlay v-if="overlayReady" :game="game" teleport-target="#mobile-overlay-root" />
      <TableSweepCollectOverlay :game="game" />
      <SweepOfferModal :game="game" @sweep-cards="$emit('sweep-cards')" />
      <LastTrickPopover v-if="overlayReady" :game="game" teleport-target="#mobile-overlay-root" />
      <InteractionFab v-if="overlayReady" ref="interactionFabRef" :game="game" teleport-target="#mobile-overlay-root" @send-interaction="$emit('send-interaction', $event)" />
      <Seat class="seat-south" :player="game.viewPlayers[0]" label="你" active :current="game.phase === 'play' && game.currentViewPlayer === 0" @avatar-click="interactionFabRef?.openTarget(0)" />
    </section>

    <ResultPanel
      :game="game"
      :open="resultModalOpen"
      @close="resultModalOpen = false"
      @restart-game="$emit('restart-game')"
      @open-round-table="resultModalOpen = false; activePanel = 'round-table'"
      @open-versions="resultModalOpen = false; activePanel = 'help-versions'"
    />
    <PlayerHand
      :game="game"
      @pass-cards="$emit('pass-cards', $event)"
      @play-card="$emit('play-card', $event)"
    />

    <div
      v-if="activePanel"
      class="mobile-tool-backdrop"
      aria-hidden="true"
      @click="activePanel = ''"
    />

    <section
      v-if="activePanel"
      ref="mobileDialogRef"
      id="mobile-tools"
      class="mobile-tool-sheet"
      :class="[{
        compact: !roomShouldLead,
        'room-modal': activePanel === 'room',
        'settings-modal': activePanel === 'settings',
        'debug-modal': activePanel === 'debug',
        'tools-modal': activePanel === 'round-table' || activePanel === 'log' || activePanel === 'ai-learning' || activePanel === 'stats' || activePanel === 'help-rules' || activePanel === 'help-versions' || activePanel === 'debug',
        'round-table-modal': activePanel === 'round-table'
      }, `panel-${activePanel}`]"
      role="dialog"
      aria-modal="true"
      :aria-label="panelTitle"
      tabindex="-1"
    >
      <header>
        <div class="mobile-modal-title-copy">
          <div class="mobile-modal-title-line">
            <strong>{{ panelTitle }}</strong>
            <button
              v-if="activePanel === 'room' && game.roomId"
              class="text-button small title-copy-btn"
              type="button"
              @click="copyRoomId"
            >复制</button>
          </div>
          <small v-if="panelSubtitle">{{ panelSubtitle }}</small>
        </div>
        <button class="legacy-modal-close" type="button" aria-label="关闭" data-dialog-initial-focus @click="activePanel = ''">×</button>
      </header>

      <div class="mobile-sheet-body">
        <RoundDetailPanel v-if="activePanel === 'round-table'" :game="game" round-table-only />
        <EventLogPanel v-if="activePanel === 'log'" :game="game" />
        <AiLearningPanel v-if="activePanel === 'ai-learning'" :game="game" />
        <DebugPanel
          v-if="activePanel === 'debug'"
          @open-round-table="activePanel = 'round-table'"
        />
        <UserDataPanel v-if="activePanel === 'stats'" :identity="identity" :game="game" />
        <RoomPanel
          v-if="activePanel === 'room'"
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
          @close-panel="activePanel = ''"
        />
        <template v-if="activePanel === 'settings'">
          <SettingsPanel :game="game" @open-panel="activePanel = $event" @close-panel="activePanel = ''" />
        </template>
        <HelpPanel v-if="activePanel === 'help-rules'" initial-tab="rules" />
        <HelpPanel v-if="activePanel === 'help-versions'" initial-tab="versions" />
      </div>
    </section>

    <footer class="status-line">{{ status }}</footer>
  </main>
</template>
