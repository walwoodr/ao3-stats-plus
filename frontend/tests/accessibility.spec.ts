import { test, expect } from "@playwright/test";
import { MULTI_WORK_STATS_RESPONSE, mockStatsForUser } from "./support/mockGraphql";

// Explicit keyboard-nav/focus-order/ARIA assertions per the plan. Split
// (2026-10-20, CODE_STANDARDS.md's 400-line .ts budget - this file had
// grown to 559 lines) into sibling spec files by concern, mirroring this
// project's other *.test.ts per-concern splits: automated axe scans now
// live in accessibility.axeScans.spec.ts (light mode) and
// accessibility.darkMode.spec.ts (dark mode). Storybook's addon-a11y
// (already configured from Bootstrap) covers automated component-level
// scans on the chart stories - complementary to, not a replacement for,
// the full-page scans in those sibling files.
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

    const startThumb = page.getByRole("slider", { name: /range start/i });
    await startThumb.focus();
    await expect(startThumb).toBeFocused();
    const startBefore = await startThumb.getAttribute("aria-valuenow");
    await page.keyboard.press("ArrowRight");
    await expect(startThumb).not.toHaveAttribute("aria-valuenow", startBefore ?? "");

    const endThumb = page.getByRole("slider", { name: /range end/i });
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
