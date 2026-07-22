import { test, expect } from "@playwright/test";

// Toolchain smoke test - confirms Playwright can drive a real browser
// against the Vite dev server. Real e2e coverage belongs to the Testing
// stage once there's an actual UI to exercise.
test("home page loads and renders the app heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ao3-stats-plus" })).toBeVisible();
});
