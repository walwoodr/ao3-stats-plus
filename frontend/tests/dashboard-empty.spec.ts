import { test, expect } from "@playwright/test";

test.describe("dashboard with no token available", () => {
  test("shows the empty state with a manual token-entry form", async ({ page }) => {
    await page.goto("/u/testauthor");

    await expect(page.getByLabel(/read token/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /use this token|submit/i })).toBeVisible();
  });

  test("does not render any chart region", async ({ page }) => {
    await page.goto("/u/testauthor");

    await expect(page.getByRole("img", { name: /total hits/i })).toHaveCount(0);
  });

  test("lets the user submit a token from the manual entry form and navigate to the dashboard", async ({
    page,
  }) => {
    await page.goto("/u/testauthor");

    await page.getByLabel(/read token/i).fill("tok_manual_entry");
    await page.getByRole("button", { name: /use this token|submit/i }).click();

    await expect(page.getByLabel(/read token/i)).toHaveCount(0);
  });
});
