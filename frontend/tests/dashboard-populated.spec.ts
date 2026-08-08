import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockStatsForUser, POPULATED_STATS_RESPONSE } from "./support/mockGraphql";

test.describe("dashboard with a seeded snapshot history", () => {
  test("renders the aggregate metric toggle (Hits by default, no ratio chart) from the mocked stats response", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);

    await page.goto("/u/testauthor?token=tok_valid123");

    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();
    await expect(page.getByRole("tablist").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /kudos.to.hits ratio/i })).not.toBeVisible();
  });

  // Q1 (resolved: replace, not coexist) - the old single-work <select>
  // dropdown is gone; WorkComparisonSection's grouped checkbox picker
  // takes its place, defaulting to exactly the first work selected.
  test("renders the per-work comparison chart with a grouped checkbox picker", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);

    await page.goto("/u/testauthor?token=tok_valid123");

    await expect(page.getByRole("group", { name: /works to compare/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Work A" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Work A" })).toBeChecked();
    await expect(page.getByRole("combobox", { name: /work/i })).not.toBeVisible();
  });

  test("strips the ?token= query param from the URL after capturing it", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);

    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    expect(new URL(page.url()).search).toBe("");
  });

  test("a returning visit with no token param reuses the stored token", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    await page.goto("/u/testauthor");

    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();
  });

  // Testing task 8 (docs/plans/per-work-zero-basis-dates.md): the fixture's
  // default-selected work ("Work A") carries a publishedOn before its
  // first capture, so the visible lead-in caption should render beneath
  // the comparison chart pair in the default populated dashboard state.
  test("shows the dashed-lead-in caption once a selected work has a zero-basis leadIn", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await expect(page.getByRole("checkbox", { name: "Work A" })).toBeChecked();
    await expect(
      page.getByText(
        /dashed segments show the period before your first captured stats for a work/i,
      ),
    ).toBeVisible();
  });

  // docs/plans/additional-metric-trend-charts.md, Testing task T-T8: axe
  // scans against the new metric-toggle interactions, extending this file
  // per the plan's explicit instruction (rather than accessibility.spec.ts,
  // which covers the pre-existing landing/install/dashboard states).
  test("switching the account-level metric toggle to Subscribers is axe-clean", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    await page.getByRole("tab", { name: "Subscribers" }).click();

    await expect(page.getByRole("img", { name: /subscribers/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("switching the per-work metric toggle to Comments is axe-clean", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /^hits$/i })).toBeVisible();

    await page.getByRole("tab", { name: "Comments" }).click();

    await expect(page.getByRole("img", { name: /^comments$/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("opening the Bookmarks sub-tab and checking Public is axe-clean", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /^hits$/i })).toBeVisible();

    await page.getByRole("tab", { name: "Bookmarks" }).click();
    await expect(page.getByRole("tab", { name: "By Type" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("checkbox", { name: "Public" }).click();

    await expect(page.getByRole("img", { name: /^public bookmarks$/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("switching Bookmarks to the By Work sub-tab is axe-clean", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /^hits$/i })).toBeVisible();

    await page.getByRole("tab", { name: "Bookmarks" }).click();
    await page.getByRole("tab", { name: "By Work" }).click();

    await expect(page.getByRole("img", { name: "Work A" })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
