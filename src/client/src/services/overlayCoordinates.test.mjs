import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isForcedPortraitLayout,
  overlayViewport,
  viewportPointToOverlay
} from './overlayCoordinates.mjs';

function portraitEnvironment() {
  const shell = { clientWidth: 844, clientHeight: 390 };
  const document = {
    body: { classList: { contains: value => value === 'force-landscape' } },
    querySelector: selector => selector === '.mobile-shell' ? shell : null
  };
  const window = {
    innerWidth: 390,
    innerHeight: 844,
    matchMedia: query => ({ matches: query === '(orientation: portrait)' })
  };
  return { shell, document, window };
}

test('portrait overlay coordinates invert the forced 90 degree landscape transform', () => {
  const environment = portraitEnvironment();
  assert.equal(isForcedPortraitLayout(environment), true);
  assert.deepEqual(overlayViewport(environment), { width: 844, height: 390 });
  assert.deepEqual(
    viewportPointToOverlay({ x: 340, y: 100 }, environment),
    { x: 100, y: 50 }
  );
});

test('physical landscape coordinates pass through unchanged', () => {
  const environment = portraitEnvironment();
  environment.window.matchMedia = () => ({ matches: false });
  assert.equal(isForcedPortraitLayout(environment), false);
  assert.deepEqual(
    viewportPointToOverlay({ x: 240, y: 120 }, environment),
    { x: 240, y: 120 }
  );
});
