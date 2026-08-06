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
});

test.describe("accessibility - automated axe scans (dark mode)", () => {
  // Same three combobox states as the light-mode block above, forced to
  // `prefers-color-scheme: dark` via Playwright's `colorScheme` context
  // option - the app's own token theming (§7/§9, useChartColors) branches
  // on this media feature, so contrast/focus-ring violations can differ by
  // theme and aren't guaranteed by the light-mode scans alone.
  test.use({ colorScheme: "dark" });

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
});
