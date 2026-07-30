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
