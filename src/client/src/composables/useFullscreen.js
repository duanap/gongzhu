import { onBeforeUnmount, onMounted, ref } from 'vue';

export function useFullscreen({ lockLandscape = false, bodyClass = '' } = {}) {
  const fullscreenActive = ref(Boolean(document.fullscreenElement));
  if (bodyClass) document.body.classList.add(bodyClass);

  function syncFullscreenState() {
    fullscreenActive.value = Boolean(document.fullscreenElement);
  }

  async function requestLandscapeLock() {
    if (!lockLandscape) return;
    try {
      await window.screen?.orientation?.lock?.('landscape');
    } catch (error) {
      // CSS remains the supported fallback where the browser cannot lock orientation.
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen().catch(() => {});
      fullscreenActive.value = false;
      return;
    }
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen().catch(() => {});
    }
    fullscreenActive.value = Boolean(document.fullscreenElement);
    await requestLandscapeLock();
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', syncFullscreenState);
    void requestLandscapeLock();
  });

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', syncFullscreenState);
    if (bodyClass) document.body.classList.remove(bodyClass);
    if (lockLandscape) {
      try { window.screen?.orientation?.unlock?.(); } catch (error) { /* unsupported */ }
    }
  });

  return { fullscreenActive, toggleFullscreen };
}
