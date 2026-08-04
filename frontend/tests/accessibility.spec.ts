import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
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

  // Full keyboard walkthrough of the new per-work comparison surface: tab
  // into the grouped picker, toggle a work on via the keyboard, select an
  // entire fandom (reaching the 10-work cap), then operate both
  // DateRangeSlider thumbs via arrow keys. Requires @mui/material +
  // emotion peers to be installed (Implementation task 6) - fails until
  // then, same as the rest of the DateRangeSlider coverage.
  test("keyboard walkthrough: toggle works in the picker, select-all to the cap, and operate both slider thumbs", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("checkbox", { name: "Comparison Work 1" })).toBeChecked();

    const secondWorkCheckbox = page.getByRole("checkbox", { name: "Comparison Work 2" });
    await secondWorkCheckbox.focus();
    await expect(secondWorkCheckbox).toBeFocused();
    await page.keyboard.press("Space");
    await expect(secondWorkCheckbox).toBeChecked();

    const selectAllButton = page.getByRole("button", { name: /select all.*shared fandom/i });
    await selectAllButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText(/maximum of 10 works reached/i);
    await expect(page.getByRole("checkbox", { name: "Comparison Work 11" })).toBeDisabled();

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

  test("the token-mismatch error state has no detectable a11y violations", async ({ page }) => {
    await mockStatsForUser(page, TOKEN_MISMATCH_RESPONSE);
    await page.goto("/u/testauthor?token=tok_wrong");
    await expect(page.getByText(/doesn't match|invalid token|not authorized/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  // The three new populated-comparison-view states called out by the plan's
  // Accessibility section: multi-select active (2+ works checked, slider
  // visible), and the 10-work cap (disabled checkboxes + role=status
  // announcement). Distinct from the single-default-work populated state
  // already covered above.
  test("the comparison view with multiple works selected (slider visible) has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("checkbox", { name: "Comparison Work 1" })).toBeChecked();

    await page.getByRole("checkbox", { name: "Comparison Work 2" }).check();
    await expect(page.getByRole("slider", { name: /range start \(year\)/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the comparison view at the 10-work selection cap has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("button", { name: /select all.*shared fandom/i }).click();
    await expect(page.getByRole("status")).toContainText(/maximum of 10 works reached/i);
    await expect(page.getByRole("checkbox", { name: "Comparison Work 11" })).toBeDisabled();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
});
