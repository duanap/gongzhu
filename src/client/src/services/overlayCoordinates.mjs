function resolveEnvironment(target = {}) {
  const targetWindow = target.window || target.targetWindow || globalThis.window;
  const targetDocument = target.document || target.targetDocument || globalThis.document;
  const shell = target.shell || targetDocument?.querySelector?.('.mobile-shell');
  return { targetWindow, targetDocument, shell };
}

export function isForcedPortraitLayout(target = {}) {
  const { targetWindow, targetDocument, shell } = resolveEnvironment(target);
  if (!shell || !targetDocument?.body?.classList?.contains('force-landscape')) return false;
  return Boolean(targetWindow?.matchMedia?.('(orientation: portrait)')?.matches);
}

export function overlayViewport(target = {}) {
  const { targetWindow, shell } = resolveEnvironment(target);
  return {
    width: Number(shell?.clientWidth || targetWindow?.innerWidth || 0),
    height: Number(shell?.clientHeight || targetWindow?.innerHeight || 0)
  };
}

export function viewportPointToOverlay(point, target = {}) {
  const { targetWindow, shell } = resolveEnvironment(target);
  if (!isForcedPortraitLayout({ ...target, targetWindow, shell })) return { ...point };

  const viewport = overlayViewport({ ...target, targetWindow, shell });
  const physicalCenterX = Number(targetWindow?.innerWidth || 0) / 2;
  const physicalCenterY = Number(targetWindow?.innerHeight || 0) / 2;
  return {
    x: viewport.width / 2 + (Number(point.y) - physicalCenterY),
    y: viewport.height / 2 - (Number(point.x) - physicalCenterX)
  };
}

export function elementCenterInOverlay(element, target = {}) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return null;
  return viewportPointToOverlay({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }, target);
}
