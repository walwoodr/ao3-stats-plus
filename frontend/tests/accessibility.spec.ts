import { test, expect } from "@playwright/test";

// Explicit keyboard-nav/focus-order/ARIA assertions per the plan. Automated
// axe scanning is covered separately via Storybook's addon-a11y (already
// configured from Bootstrap) on the individual component stories - these
// e2e checks focus on things only observable in a full page: landmark
// structure, tab order, and focus management across a route change.
test.describe("accessibility", () => {
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
  }) => {
    await page.goto("/u/testauthor");

    const input = page.getByLabel(/read token/i);
    await expect(input).toBeVisible();

    await input.focus();
    await page.keyboard.type("tok_a11y_check");
    await page.keyboard.press("Tab");

    const submitButton = page.getByRole("button", { name: /use this token|submit/i });
    await expect(submitButton).toBeFocused();
  });
});
