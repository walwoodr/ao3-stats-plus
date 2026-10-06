import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  DENSE_WINDOWED_STATS_RESPONSE,
  mockStatsForUser,
  MULTI_WORK_STATS_RESPONSE,
  POPULATED_STATS_RESPONSE,
  TOKEN_MISMATCH_RESPONSE,
} from "./support/mockGraphql";

// Explicit keyboard-nav/focus-order/ARIA assertions per the plan, plus
// automated axe scans (@axe-core/playwright, approved as a permanent stack
// exception - see /TECH_STACK.md) against full pages/routes in their key
// states. Storybook's addon-a11y (already configured from Bootstrap) covers
// automated component-level scans on the chart stories - these two are
// complementary, not a replacement for one another.
test.describe("accessibility - keyboard nav, focus order, ARIA", () => {
  test("landing page exposes header/nav/main landmarks", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("the nav's Install link is reachable via Tab and activates on Enter", async ({ page }) => {
    await page.goto("/");

    const installLink = page.getByRole("link", { name: /install/i });
    await installLink.focus();
    await expect(installLink).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/install$/);
  });

  test("navigating routes moves focus to the main landmark", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /install/i }).click();

    const main = page.getByRole("main");
    await expect(main).toBeFocused();
  });

  test("the InstallPage keyboard fallback toggle is reachable and operable without a mouse", async ({
    page,
  }) => {
    await page.goto("/install");

    const toggle = page.getByRole("button", { name: /show.*code|copy.*code/i });
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText(/javascript:/i)).toBeVisible();
  });

  test("the manual token-entry form has a programmatic label and keyboard tab order", async ({
    page,
    browserName,
  }) => {
    // WebKit's default keyboard-navigation mode only tabs to text inputs/
    // selects/links, not <button> elements (mirrors real Safari's default
    // "Full Keyboard Access: Text boxes and lists only" setting) - Tab from
    // the token input never reaches the submit button in WebKit
    // specifically, even though the DOM/tab order is correct (proven by
    // this same assertion passing on Chromium/Firefox). Known Playwright/
    // WebKit environment limitation, not an app bug - see TECH_DEBT.md.
    test.skip(browserName === "webkit", "WebKit only tabs to inputs/links by default, not buttons");

    await page.goto("/u/testauthor");

    const input = page.getByLabel(/read token/i);
    await expect(input).toBeVisible();

    await input.focus();
    await page.keyboard.type("tok_a11y_check");
    await page.keyboard.press("Tab");

    const submitButton = page.getByRole("button", { name: /use this token|submit/i });
    await expect(submitButton).toBeFocused();
  });

  // Full keyboard walkthrough of the Autocomplete combobox picker
  // (docs/plans/work-comparison-picker-redesign.md, refined by
  // docs/plans/work-comparison-picker-refinements.md §1): open the
  // combobox, select a work by keyboard-operated option click, select an
  // entire fandom via the fandom-header row (now a genuine `role="option"`
  // INSIDE the listbox, not a `role="button"` bar sibling - reaching the
  // 10-work cap), then operate both DateRangeSlider thumbs via arrow keys.
  // The header's specific arrow-key + Enter reachability (§1.1's load-
  // bearing verified finding) gets its own isolated test in
  // accessibility.pickerRefinements.spec.ts, where a freshly-opened popup
  // makes the roving-highlight starting position deterministic; this test
  // stays focused on the end-to-end selection/cap/slider flow.
  test("keyboard walkthrough: select works via the combobox, select-all to the cap via the fandom header, and operate both slider thumbs", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByLabel("Remove Comparison Work 1")).toBeVisible();

    const combobox = page.getByRole("combobox", { name: /works to compare/i });
    await combobox.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("option", { name: "Comparison Work 2" }).click();
    await expect(page.getByLabel("Remove Comparison Work 2")).toBeVisible();

    await page.getByRole("option", { name: /shared fandom/i }).click();
    await expect(page.getByRole("status")).toContainText(/maximum of 10 works reached/i);
    await expect(page.getByRole("option", { name: "Comparison Work 11" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    const startThumb = page.getByRole("slider", { name: /range start \(year\)/i });
    await startThumb.focus();
    await expect(startThumb).toBeFocused();
    const startBefore = await startThumb.getAttribute("aria-valuenow");
    await page.keyboard.press("ArrowRight");
    await expect(startThumb).not.toHaveAttribute("aria-valuenow", startBefore ?? "");

    const endThumb = page.getByRole("slider", { name: /range end \(year\)/i });
    await endThumb.focus();
    await expect(endThumb).toBeFocused();
    const endBefore = await endThumb.getAttribute("aria-valuenow");
    await page.keyboard.press("ArrowLeft");
    await expect(endThumb).not.toHaveAttribute("aria-valuenow", endBefore ?? "");
  });

  test("the works combobox chip delete control is named 'Remove {title}' and removes the work on click", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    const removeChip = page.getByLabel("Remove Comparison Work 1");
    await expect(removeChip).toBeVisible();
    await removeChip.click();

    await expect(page.getByLabel("Remove Comparison Work 1")).not.toBeVisible();
  });
});

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
  // purely decorative aria-hidden chart overlay. Red today: the "Total
  // hits" chart's table (POPULATED_STATS_RESPONSE gives it a 2025 lead-in
  // alongside 2026 real captures, per DashboardPage's earliestPostYear
  // logic - a genuine two-year, multi-tier case) still renders today's
  // single-row thead, so no th[scope=colgroup] exists yet and the day
  // header's visible text is still the full ISO/worded label, not the
  // bare day-of-month this test also checks for.
  test("the populated dashboard's 3-tier date header exposes colgroup scope semantics, keeps the day tier's full accessible name, and introduces no new summary-focusable-descendant regression", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    const totalHitsDisclosure = page
      .locator("details")
      .filter({ has: page.getByRole("table", { name: /total hits/i }) });
    const table = totalHitsDisclosure.getByRole("table", { name: /total hits/i });

    // Year tier: a real th[scope=colgroup] grouping cell for the 2025
    // lead-in year (distinct from the unchanged day tier's scope=col).
    await expect(table.locator('th[scope="colgroup"]').first()).toBeVisible();

    // Belt-and-suspenders (§6/D2): the day tier's ACCESSIBLE name stays the
    // full worded lead-in label even though its VISIBLE text is now just
    // the bare day-of-month.
    const dayHeader = table.getByRole("columnheader", { name: /before 2025.*estimated baseline/i });
    await expect(dayHeader).toBeVisible();
    await expect(dayHeader).toHaveText(/^\d{2}$/);

    // No new WCAG 4.1.2 regression: the year/month grouping <th> cells are
    // non-interactive, so the disclosure's <summary> still has zero
    // focusable descendants (axe's own scan below also covers this, but
    // this asserts the specific structural property directly).
    await expect(
      totalHitsDisclosure.locator("summary :is(button, a, input, select, textarea, [tabindex])"),
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
    await expect(page.getByRole("slider", { name: /range start \(year\)/i })).toBeVisible();

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

test.describe("accessibility - automated axe scans (dark mode)", () => {
  // Same three combobox states as the light-mode block above, forced to
  // `prefers-color-scheme: dark` via Playwright's `colorScheme` context
  // option - the app's own token theming (§7/§9, useChartColors) branches
  // on this media feature, so contrast/focus-ring violations can differ by
  // theme and aren't guaranteed by the light-mode scans alone.
  test.use({ colorScheme: "dark" });

  // Testing task T11: the populated dashboard's new visible synced table
  // (and its bg-accent/10 active-column tint, once hovered) is a new
  // surface whose contrast/focus-ring treatment can differ by theme (§8) -
  // not covered by the light-mode scan above. Regression fence, not a
  // red-today assertion: today's pre-feature dashboard already has no
  // dark-mode axe violations, so this passes before Implementation too -
  // its job is to catch a dark-mode contrast regression the new table/tint
  // could introduce, not to prove the feature exists (T11's structural
  // "table sits outside role=img" test above is the genuinely red-today
  // check for that).
  test("the populated dashboard has no detectable a11y violations in dark mode", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();
    await expect(page.getByRole("table", { name: /total hits/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the comparison view with multiple works selected (chips + slider visible) has no detectable a11y violations in dark mode", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByLabel("Remove Comparison Work 1")).toBeVisible();

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    await page.getByRole("option", { name: "Comparison Work 2" }).click();
    await expect(page.getByLabel("Remove Comparison Work 2")).toBeVisible();
    await expect(page.getByRole("slider", { name: /range start \(year\)/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the works combobox open (grouped options + fandom-header bulk-select) has no detectable a11y violations in dark mode", async ({
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

  // Testing task 14: dark-mode counterpart of the light-mode pinned-point +
  // flipped-table scan above - delta-chip green/red contrast and the
  // orientation toggle's focus ring can differ by theme (§8's "Contrast of
  // green/red chip text on card background must meet WCAG AA (verify both
  // modes)").
  test("the populated dashboard with a pinned comparison point and a flipped table has no detectable a11y violations in dark mode", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    // Scoped to the "Total hits" chart's own <details> disclosure - see
    // the identical light-mode test's comment for why an unscoped
    // page-wide locator is ambiguous here.
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

  test("the comparison view at the 10-work selection cap has no detectable a11y violations in dark mode", async ({
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

  // Dark-mode counterpart of the light-mode dense/windowed-clip scan above -
  // see that test's identical comment for the full items 4/5/7 rationale.
  test("the dense (>30-point), windowed-clip comparison dashboard has no detectable a11y violations in dark mode", async ({
    page,
  }) => {
    await mockStatsForUser(page, DENSE_WINDOWED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
});
