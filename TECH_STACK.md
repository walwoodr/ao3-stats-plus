# Tech Stack Spec (ao3-stats-plus)

This project follows the global default stack in
`/Users/walwoodr/.claude/TECH_STACK.md`. This file does not repeat that
spec - it only lists project-specific exceptions that have been explicitly
approved, per the "before adding any out-of-stack dependency" policy in the
global `CLAUDE.md`.

## Approved exceptions

### Recharts

- **What**: charting library, used for the trend/ratio graphs on the
  author dashboard (`TrendChart`, `RatioChart` under
  `frontend/src/components/charts/`).
- **Why**: the global stack names Tailwind + MUI-for-complex-widgets but no
  charting library. The in-stack fallback would have been hand-rolled SVG
  charts; Recharts was approved during Planning instead, given the amount of
  chart-specific behavior this project needs (irregular time scales, sparse/
  single-point series, accessible data-table alternatives).
- **Approved**: by the user, during Planning.

### @axe-core/playwright

- **What**: automated accessibility scanning (`AxeBuilder`), integrated into
  the Playwright e2e suite (`frontend/tests/accessibility.spec.ts`) to check
  full-page/route-level a11y (landmarks, contrast, ARIA, etc.) against the
  landing/install/dashboard pages in their key states.
- **Why**: the global stack's Testing section (Vitest, Playwright) doesn't
  name an automated a11y scanner. Storybook's `addon-a11y` (already present
  from Bootstrap) covers component-level automated scans, but full-page e2e
  states (e.g. the populated dashboard, the mismatched-token error state)
  aren't exercised by individual component stories - `@axe-core/playwright`
  fills that gap. The two are complementary, not redundant: component-level
  vs. full-page/route-level automated scanning.
- **Approved**: by the user, 2026-07-22 (Testing stage).

Anything not listed above is still governed by the global
`~/.claude/TECH_STACK.md` and its "ask before adding" policy.
