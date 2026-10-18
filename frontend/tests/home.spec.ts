import { test, expect } from "@playwright/test";

// Toolchain smoke test - confirms Playwright can drive a real browser
// against the Vite dev server. Real e2e coverage belongs to the Testing
// stage once there's an actual UI to exercise.
test("home page loads and renders the app heading", async ({ page }) => {
  await page.goto("/");
  // Maintenance fix (2026-10-05): this still named the Bootstrap scaffold's
  // placeholder heading text ("ao3-stats-plus", the repo slug) rather than
  // LandingPage.tsx's real <h1> ("AO3 Stats+") - never updated once the
  // actual landing page replaced the scaffold, so this always failed once
  // Playwright browsers were available to run it (see TECH_DEBT.md).
  await expect(page.getByRole("heading", { name: "AO3 Stats+" })).toBeVisible();
});
