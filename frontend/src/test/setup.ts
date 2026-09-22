import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement window.matchMedia at all - components that read
// prefers-color-scheme (e.g. the chart color hook, see
// src/lib/useChartColors.ts) would otherwise throw as soon as they're
// rendered in any test. This default stub reports "light mode, no
// listeners ever fire" - tests that need to exercise a dark-mode/preference
// change replace window.matchMedia themselves (see useChartColors.test.ts).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom doesn't implement the Pointer Events capture methods at all (no
// hasPointerCapture/setPointerCapture/releasePointerCapture on Element) -
// any component using real pointer-drag gestures (e.g. MUI's Slider, see
// DateRangeSlider.test.tsx's drag-vs-onChangeCommitted regression tests)
// throws as soon as a synthetic pointerup event reaches it. Stubbed as
// permissive no-ops (matching jsdom's own convention of stubbing rather
// than fully implementing environment APIs it doesn't support) rather than
// per-test, since any future pointer/drag-based component test would hit
// the same gap.
// jsdom implements window.scrollTo as a stub that logs a "Not implemented"
// virtual-console error on every call rather than silently no-op'ing (unlike
// matchMedia above, which it omits entirely) - noisy once any component
// calls it unconditionally on an interaction (see BookmarkFeed.tsx's
// pagination scroll-to-top, item 5). Tests that need to assert scrollTo was
// actually called replace it with their own vi.spyOn (see
// BookmarkFeed.pagination.test.tsx) - this default just keeps other,
// unrelated tests' output quiet.
window.scrollTo = () => {};

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
