import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  DENSE_WINDOWED_STATS_RESPONSE,
  mockStatsForUser,
  MULTI_WORK_STATS_RESPONSE,
  POPULATED_STATS_RESPONSE,
  TOKEN_MISMATCH_RESPONSE,
} from "./support/mockGraphql";

// Automated axe scans (@axe-core/playwright, approved as a permanent stack
// exception - see /TECH_STACK.md) against full pages/routes in their key
// states, light mode (system default). Split out of accessibility.spec.ts
// (2026-10-20, CODE_STANDARDS.md's 400-line .ts budget) - see that file for
// the keyboard-nav/focus-order assertions, and accessibility.darkMode.spec.ts
// for this same set of scans forced to dark mode.
test.describe("accessibility - automated axe scans", () => {
  test("the landing page has no detectable a11y violations", async ({ page }) => {
    await page.goto("/");
    // Confirms the real LandingPage (not the pre-existing placeholder route)
    // is what's being scanned - otherwise this would pass vacuously against
    // whatever currently renders at "/".
    await expect(page.getByRole("link", { name: /install/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the install page has no detectable a11y violations", async ({ page }) => {
    await page.goto("/install");

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the install page's revealed code fallback has no detectable a11y violations", async ({
    page,
  }) => {
    await page.goto("/install");
    await page.getByRole("button", { name: /show.*code|copy.*code/i }).click();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the no-token empty dashboard state has no detectable a11y violations", async ({ page }) => {
    await page.goto("/u/testauthor");

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the populated dashboard has no detectable a11y violations", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  // Testing task T11 (docs/plans/chart-synced-data-table.md §10, §2.4):
  // the promoted visible data table must be a genuine sibling of the
  // role="img" figure, not a descendant of it - Planning's own
  // investigation found the PRE-existing sr-only table was likely never
  // reaching screen readers because role="img" descendants are generally
  // hidden from assistive tech (a leaf role). This is the real-DOM/ARIA
  // check that finding was meant to prompt - distinct from (and stronger
  // than) the axe scan above, which only catches WCAG-rule violations, not
  // this specific "AT-unreachable content" structural shape (axe generally
  // cannot detect "content exists but is unreachable due to being nested
  // under a leaf role" - it flags rule violations, and role="img" with
  // interactive/table descendants isn't reliably one of axe's default
  // rules). Also verifies the visible table exposes proper
  // table/columnheader/rowheader roles per §5.3.
  test("the populated dashboard's synced data table exposes table semantics and sits OUTSIDE the role=img figure", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    const figure = page.getByRole("img", { name: /total hits/i });
    await expect(figure).toBeVisible();

    const table = page.getByRole("table", { name: /total hits/i });
    await expect(table).toBeVisible();

    // A descendant locator scoped to the figure must find nothing - if the
    // table were still nested inside role="img" (the pre-existing latent
    // bug), this count would be 1 instead of 0.
    await expect(figure.getByRole("table", { name: /total hits/i })).toHaveCount(0);

    await expect(table.getByRole("columnheader").first()).toBeVisible();
    await expect(table.getByRole("rowheader").first()).toBeVisible();
  });

  // Testing task T7 (docs/plans/date-hierarchy-grouping.md §10, §4/§6):
  // the new 3-tier (Year -> Month -> Day) table header adds genuinely new
  // ACCESSIBLE content (real th[scope=colgroup] year/month cells, per §6's
  // "genuine header content, not decorative" design), distinct from the
  // purely decorative aria-hidden chart overlay.
  //
  // Maintenance fix (2026-10-15): this originally targeted the account-
  // level "Total hits" chart, relying on it getting a default 2025 lead-in
  // from earliestPostYear. Two LOCKED decisions since removed that path
  // entirely: date-range-slider-month-granularity.md D5 stopped the three
  // account-level TrendChart instances from ever receiving a leadIn prop
  // (bb09e29), and D2 originally hid every lead-in by default until the
  // slider was widened below it - but chart-table-polish-batch.md §4 item
  // 4 (OD-2, resolved 2026-10-06, after D2) removed that drop-gate
  // entirely, so a lead-in now renders unconditionally (clipped visually
  // at the window's left edge, never dropped from the data - see
  // WorkComparisonSection.leadIn.test.tsx). The per-work "Hits" chart (Work
  // A, publishedOn 2025-06-01) still has its own real leadIn machinery
  // (per-work-zero-basis-dates.md), so this now targets that instead - no
  // slider interaction needed post-OD-2 - same multi-year, multi-tier case
  // the test always wanted, just reached via the only chart that still has
  // a lead-in at all.
  test("the populated dashboard's 3-tier date header exposes colgroup scope semantics, keeps the day tier's full accessible name, and introduces no new summary-focusable-descendant regression", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /^hits$/i })).toBeVisible();

    const hitsDisclosure = page
      .locator("details")
      .filter({ has: page.getByRole("table", { name: /^hits$/i }) });
    const table = hitsDisclosure.getByRole("table", { name: /^hits$/i });

    // Year tier: a real th[scope=colgroup] grouping cell for the 2025
    // lead-in year (distinct from the unchanged day tier's scope=col).
    await expect(table.locator('th[scope="colgroup"]').first()).toBeVisible();

    // Belt-and-suspenders (§6/D2): the day tier's ACCESSIBLE name stays the
    // lead-in's full date even though its VISIBLE text is now just the bare
    // day-of-month. Confirmed live (not assumed) that a per-work leadIn's
    // day cell uses the raw capturedOn date as its aria-label here, not the
    // worded "Published <date>" caption text shown separately below the
    // chart (see SyncedDataTableHeader.test.tsx for the fallback-label
    // case, which does use the worded form).
    const dayHeader = table.getByRole("columnheader", { name: "2025-06-01" });
    await expect(dayHeader).toBeVisible();
    await expect(dayHeader).toHaveText(/^\d{2}$/);

    // No new WCAG 4.1.2 regression: the year/month grouping <th> cells are
    // non-interactive, so the disclosure's <summary> still has zero
    // focusable descendants (axe's own scan below also covers this, but
    // this asserts the specific structural property directly).
    await expect(
      hitsDisclosure.locator("summary :is(button, a, input, select, textarea, [tabindex])"),
    ).toHaveCount(0);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  // Chart-table-polish-batch (docs/plans/chart-table-polish-batch.md §7's
  // "Regression gate", §8 T8): items 4/5/7 together, on the real mounted
  // dashboard surfaces - a >30-point aggregate history (day-tick
  // suppression + dot thinning) and a per-work comparison chart whose
  // publish-date lead-in renders clipped at the left edge by default (item
  // 4, OD-2 - no slider drag needed, see DENSE_WINDOWED_STATS_RESPONSE's
  // own comment). Regression fence, not red-today: confirmed by running
  // this spec - today's pre-batch rendering (every day-of-month tick shown,
  // one dot per point, the leadIn hidden outright rather than clipped) is
  // already axe-clean, since axe flags WCAG rule violations, not "this
  // specific polish item hasn't landed." Earns its place by catching a
  // contrast/ARIA/landmark regression the denser post-Implementation
  // rendering (more ticks suppressed, dots clipped near the plot edge,
  // etc.) could introduce - the genuinely red-today proof that items 4/5/7
  // themselves exist lives in the component/unit tests above (e.g.
  // TrendChart.dayTickSuppression.test.tsx, MultiSeriesTrendChart.
  // windowClipping.test.tsx, *.dotThinning.test.tsx).
  test("the dense (>30-point), windowed-clip comparison dashboard has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, DENSE_WINDOWED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the token-mismatch error state has no detectable a11y violations", async ({ page }) => {
    await mockStatsForUser(page, TOKEN_MISMATCH_RESPONSE);
    await page.goto("/u/testauthor?token=tok_wrong");
    await expect(page.getByText(/doesn't match|invalid token|not authorized/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  // The populated-comparison-view states called out by the plan's
  // Accessibility section (§11): multi-select active with chips (2+ works
  // selected, slider visible), the open combobox popup (grouped options +
  // the fandom-header bulk-select control), and the 10-work cap
  // (aria-disabled options + role=status announcement). Distinct from the
  // single-default-work populated state already covered above. Each is
  // scanned in both light and dark, per the plan's token-theming
  // requirements (§7/§9) - color/contrast violations can differ by theme.
  test("the comparison view with multiple works selected (chips + slider visible) has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByLabel("Remove Comparison Work 1")).toBeVisible();

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    await page.getByRole("option", { name: "Comparison Work 2" }).click();
    await expect(page.getByLabel("Remove Comparison Work 2")).toBeVisible();
    await expect(page.getByRole("slider", { name: /range start/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the works combobox open (grouped options + fandom-header bulk-select) has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("option", { name: /shared fandom/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the comparison view at the 10-work selection cap has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    await page.getByRole("option", { name: /shared fandom/i }).click();
    await expect(page.getByRole("status")).toContainText(/maximum of 10 works reached/i);
    await expect(page.getByRole("option", { name: "Comparison Work 11" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  // Testing task 14 (docs/plans/chart-axis-comparison-and-table-
  // orientation-batch.md §10, §8): the two new interactive states this
  // batch adds to the populated dashboard - a pinned comparison point
  // (item 3, with its delta chips/PinnedComparisonBar) and a flipped table
  // orientation (item 2) - are new surfaces (pin controls, delta chip
  // color/contrast, the orientation toggle's pressed state, the scope-
  // swapped table) not covered by the existing populated-dashboard scan
  // above. Red today: the pin control's accessible name ("Compare from
  // <date>") doesn't exist yet, so the `getByRole("button", ...)` lookup
  // itself fails before any axe assertion runs.
  test("the populated dashboard with a pinned comparison point and a flipped table has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    // Scoped to the "Total hits" chart's own <details> disclosure (which
    // contains both its table AND its orientation toggle, as siblings) -
    // the populated dashboard renders more than one chart (this one, plus
    // the by-work comparison chart), and both legitimately have a real
    // capture on 2026-01-01 and their own "Dates down" toggle button, so
    // an unscoped page-wide locator resolves to multiple elements.
    const totalHitsDisclosure = page
      .locator("details")
      .filter({ has: page.getByRole("table", { name: /total hits/i }) });

    await totalHitsDisclosure.getByRole("button", { name: /compare from.*2026-01-01/i }).click();
    await expect(page.getByText(/comparing from 2026-01-01/i)).toBeVisible();

    await totalHitsDisclosure.getByRole("button", { name: /dates down/i }).click();
    await expect(totalHitsDisclosure.getByRole("button", { name: /dates down/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
});
