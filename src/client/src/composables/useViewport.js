import { onBeforeUnmount, onMounted, ref } from 'vue';

const MOBILE_SHORT_SIDE_MAX = 1024;

function browserWindow() {
  return typeof window === 'undefined' ? null : window;
}

function matchesMedia(targetWindow, query) {
  try {
    return Boolean(targetWindow?.matchMedia?.(query)?.matches);
  } catch (error) {
    return false;
  }
}

export function readViewportDimensions(targetWindow = browserWindow()) {
  const viewport = targetWindow?.visualViewport;
  const width = Number(viewport?.width ?? targetWindow?.innerWidth) || 0;
  const height = Number(viewport?.height ?? targetWindow?.innerHeight) || 0;

  return {
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height))
  };
}

export function detectMobileLayout(targetWindow = browserWindow()) {
  if (!targetWindow) return false;

  const coarsePointer = matchesMedia(targetWindow, '(pointer: coarse)');
  const noHover = matchesMedia(targetWindow, '(hover: none)');
  if (!coarsePointer || !noHover) return false;

  const viewport = readViewportDimensions(targetWindow);
  const screenWidth = Number(targetWindow.screen?.width) || 0;
  const screenHeight = Number(targetWindow.screen?.height) || 0;
  const width = screenWidth > 0 && screenHeight > 0 ? screenWidth : viewport.width;
  const height = screenWidth > 0 && screenHeight > 0 ? screenHeight : viewport.height;

  return width > 0 && height > 0 && Math.min(width, height) <= MOBILE_SHORT_SIDE_MAX;
}

export function useViewport() {
  let targetWindow = browserWindow();
  let targetDocument = targetWindow?.document || (typeof document === 'undefined' ? null : document);
  let layoutInitialized = Boolean(targetWindow);
  const initialViewport = readViewportDimensions(targetWindow);
  const isMobile = ref(detectMobileLayout(targetWindow));
  const viewportWidth = ref(initialViewport.width);
  const viewportHeight = ref(initialViewport.height);

  function updateViewportDimensions() {
    const viewport = readViewportDimensions(targetWindow);
    viewportWidth.value = viewport.width;
    viewportHeight.value = viewport.height;
  }

  onMounted(() => {
    targetWindow ||= browserWindow();
    targetDocument ||= targetWindow?.document || (typeof document === 'undefined' ? null : document);
    if (!layoutInitialized) {
      isMobile.value = detectMobileLayout(targetWindow);
      layoutInitialized = true;
    }
    updateViewportDimensions();
    targetWindow?.addEventListener?.('resize', updateViewportDimensions);
    targetWindow?.visualViewport?.addEventListener?.('resize', updateViewportDimensions);
    targetDocument?.addEventListener?.('fullscreenchange', updateViewportDimensions);
  });

  onBeforeUnmount(() => {
    targetWindow?.removeEventListener?.('resize', updateViewportDimensions);
    targetWindow?.visualViewport?.removeEventListener?.('resize', updateViewportDimensions);
    targetDocument?.removeEventListener?.('fullscreenchange', updateViewportDimensions);
  });

  return { isMobile, viewportWidth, viewportHeight };
}
