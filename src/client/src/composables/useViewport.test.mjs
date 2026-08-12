import assert from 'node:assert/strict';
import test from 'node:test';
import { createRenderer, defineComponent, nextTick } from 'vue';
import {
  detectMobileLayout,
  readViewportDimensions,
  useViewport
} from './useViewport.js';

function createEventTarget() {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) || []) listener({ type });
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    }
  };
}

function createBrowser({
  width,
  height,
  screenWidth,
  screenHeight,
  coarsePointer,
  noHover
}) {
  const windowEvents = createEventTarget();
  const documentEvents = createEventTarget();
  const targetWindow = {
    ...windowEvents,
    innerWidth: width,
    innerHeight: height,
    screen: {
      width: screenWidth,
      height: screenHeight
    },
    document: documentEvents,
    matchMedia(query) {
      if (query === '(pointer: coarse)') return { matches: coarsePointer };
      if (query === '(hover: none)') return { matches: noHover };
      return { matches: false };
    }
  };

  return { targetWindow, targetDocument: documentEvents };
}

const renderer = createRenderer({
  patchProp() {},
  insert() {},
  remove() {},
  createElement() {
    return {};
  },
  createText(text) {
    return { text };
  },
  createComment(text) {
    return { text };
  },
  setText(node, text) {
    node.text = text;
  },
  setElementText(node, text) {
    node.text = text;
  },
  parentNode() {
    return null;
  },
  nextSibling() {
    return null;
  },
  querySelector() {
    return null;
  },
  setScopeId() {},
  cloneNode(node) {
    return { ...node };
  },
  insertStaticContent() {
    return [{}, {}];
  }
});

async function mountViewport(targetWindow, targetDocument) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let viewport;

  if (targetWindow) globalThis.window = targetWindow;
  else delete globalThis.window;
  if (targetDocument) globalThis.document = targetDocument;
  else delete globalThis.document;

  const app = renderer.createApp(defineComponent({
    setup() {
      viewport = useViewport();
      return () => null;
    }
  }));
  app.mount({});
  await nextTick();

  return {
    viewport,
    async unmount() {
      app.unmount();
      await nextTick();
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  };
}

test('detectMobileLayout requires touch-like input and a mobile-sized screen', () => {
  const narrowDesktop = createBrowser({
    width: 700,
    height: 500,
    screenWidth: 1920,
    screenHeight: 1080,
    coarsePointer: false,
    noHover: false
  }).targetWindow;
  const mobile = createBrowser({
    width: 390,
    height: 844,
    screenWidth: 390,
    screenHeight: 844,
    coarsePointer: true,
    noHover: true
  }).targetWindow;
  const largeTouchDisplay = createBrowser({
    width: 900,
    height: 540,
    screenWidth: 1920,
    screenHeight: 1080,
    coarsePointer: true,
    noHover: true
  }).targetWindow;

  assert.equal(detectMobileLayout(narrowDesktop), false);
  assert.equal(detectMobileLayout(mobile), true);
  assert.equal(detectMobileLayout(largeTouchDisplay), false);
});

test('detectMobileLayout falls back to the initial viewport when screen dimensions are unavailable', () => {
  const { targetWindow } = createBrowser({
    width: 844,
    height: 390,
    screenWidth: 0,
    screenHeight: 0,
    coarsePointer: true,
    noHover: true
  });

  assert.equal(detectMobileLayout(targetWindow), true);
  assert.deepEqual(readViewportDimensions(targetWindow), { width: 844, height: 390 });
});

test('desktop layout stays desktop while resize and fullscreen only update dimensions', async () => {
  const { targetWindow, targetDocument } = createBrowser({
    width: 1366,
    height: 768,
    screenWidth: 1920,
    screenHeight: 1080,
    coarsePointer: false,
    noHover: false
  });
  const mounted = await mountViewport(targetWindow, targetDocument);

  assert.equal(mounted.viewport.isMobile.value, false);
  assert.equal(targetWindow.listenerCount('resize'), 1);
  assert.equal(targetDocument.listenerCount('fullscreenchange'), 1);

  targetWindow.innerWidth = 700;
  targetWindow.innerHeight = 500;
  targetWindow.dispatch('resize');
  await nextTick();

  assert.equal(mounted.viewport.isMobile.value, false);
  assert.equal(mounted.viewport.viewportWidth.value, 700);
  assert.equal(mounted.viewport.viewportHeight.value, 500);

  targetWindow.innerWidth = 1920;
  targetWindow.innerHeight = 1080;
  targetDocument.dispatch('fullscreenchange');
  await nextTick();

  assert.equal(mounted.viewport.isMobile.value, false);
  assert.equal(mounted.viewport.viewportWidth.value, 1920);
  assert.equal(mounted.viewport.viewportHeight.value, 1080);

  await mounted.unmount();
  assert.equal(targetWindow.listenerCount('resize'), 0);
  assert.equal(targetDocument.listenerCount('fullscreenchange'), 0);
});

test('mobile layout stays mobile across portrait, landscape and fullscreen dimensions', async () => {
  const { targetWindow, targetDocument } = createBrowser({
    width: 390,
    height: 844,
    screenWidth: 390,
    screenHeight: 844,
    coarsePointer: true,
    noHover: true
  });
  const mounted = await mountViewport(targetWindow, targetDocument);

  assert.equal(mounted.viewport.isMobile.value, true);

  targetWindow.innerWidth = 844;
  targetWindow.innerHeight = 390;
  targetWindow.dispatch('resize');
  targetDocument.dispatch('fullscreenchange');
  await nextTick();

  assert.equal(mounted.viewport.isMobile.value, true);
  assert.equal(mounted.viewport.viewportWidth.value, 844);
  assert.equal(mounted.viewport.viewportHeight.value, 390);

  await mounted.unmount();
});

test('useViewport is safe when browser globals are unavailable', async () => {
  const mounted = await mountViewport(null, null);

  assert.equal(mounted.viewport.isMobile.value, false);
  assert.equal(mounted.viewport.viewportWidth.value, 0);
  assert.equal(mounted.viewport.viewportHeight.value, 0);

  await mounted.unmount();
});
