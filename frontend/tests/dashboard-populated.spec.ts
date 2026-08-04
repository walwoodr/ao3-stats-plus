import { test, expect } from "@playwright/test";
import { mockStatsForUser, POPULATED_STATS_RESPONSE } from "./support/mockGraphql";

test.describe("dashboard with a seeded snapshot history", () => {
  test("renders aggregate trend charts from the mocked stats response", async ({ page }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);

    await page.goto("/u/testauthor?token=tok_valid123");

    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /kudos.to.hits ratio/i })).toBeVisible();
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
});
