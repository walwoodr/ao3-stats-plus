import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  DENSE_WINDOWED_STATS_RESPONSE,
  mockStatsForUser,
  MULTI_WORK_STATS_RESPONSE,
  POPULATED_STATS_RESPONSE,
} from "./support/mockGraphql";

// Dark-mode counterpart of accessibility.axeScans.spec.ts's automated axe
// scans - same states, forced to `prefers-color-scheme: dark` via
// Playwright's `colorScheme` context option, since the app's own token
// theming (useChartColors) branches on this media feature and
// contrast/focus-ring violations can differ by theme. Split out of
// accessibility.spec.ts (2026-10-20, CODE_STANDARDS.md's 400-line .ts
// budget) - see that file for the keyboard-nav/focus-order assertions.
test.describe("accessibility - automated axe scans (dark mode)", () => {
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
    await expect(page.getByRole("slider", { name: /range start/i })).toBeVisible();

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
