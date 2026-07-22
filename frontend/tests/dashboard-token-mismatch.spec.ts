import { test, expect } from "@playwright/test";
import { mockStatsForUser, TOKEN_MISMATCH_RESPONSE } from "./support/mockGraphql";

test.describe("dashboard with a mismatched/invalid token", () => {
  test("shows an error state explaining the mismatch instead of charts", async ({ page }) => {
    await mockStatsForUser(page, TOKEN_MISMATCH_RESPONSE);

    await page.goto("/u/testauthor?token=tok_wrong");

    await expect(page.getByText(/doesn't match|invalid token|not authorized/i)).toBeVisible();
    await expect(page.getByRole("img", { name: /total hits/i })).toHaveCount(0);
  });

  test("keeps the manual token-entry form available so the user can retry", async ({ page }) => {
    await mockStatsForUser(page, TOKEN_MISMATCH_RESPONSE);

    await page.goto("/u/testauthor?token=tok_wrong");

    await expect(page.getByLabel(/read token/i)).toBeVisible();
  });

  test("clears the bad token so a reload doesn't immediately refire the same mismatched query", async ({
    page,
  }) => {
    await mockStatsForUser(page, TOKEN_MISMATCH_RESPONSE);
    await page.goto("/u/testauthor?token=tok_wrong");
    await expect(page.getByText(/doesn't match|invalid token|not authorized/i)).toBeVisible();

    await page.goto("/u/testauthor");

    await expect(page.getByLabel(/read token/i)).toBeVisible();
  });
});
