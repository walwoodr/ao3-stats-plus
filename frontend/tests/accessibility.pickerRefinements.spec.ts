import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  mockStatsForUser,
  MULTI_WORK_STATS_RESPONSE,
  POPULATED_STATS_RESPONSE,
} from "./support/mockGraphql";
import { DARK_COLOR_TOKENS, LIGHT_COLOR_TOKENS } from "../src/lib/colorTokens";

// Dedicated e2e/axe coverage for docs/plans/work-comparison-picker-
// refinements.md (Testing task T12), split from the sibling
// accessibility.spec.ts for the same per-concern/file-length reason the
// component-level unit-test suite is split (WorkPicker.test.tsx /
// .header.test.tsx / .styling.test.tsx / .popupOpen.test.tsx). Covers, in a
// REAL browser (not jsdom): the named combobox (requirement 7's highest-risk
// item - a placeholder is not an accessible name), the fandom-header
// option's isolated keyboard reachability (§1.1's load-bearing verified
// finding, in a deterministic freshly-opened-popup context), the selected/
// hover visual states, and the always-rendered-but-disabled slider - each
// scanned with axe in both light and dark, per the plan's token-theming
// requirements (§7/§9).
test.describe("accessibility - picker refinements (keyboard/ARIA)", () => {
  test("the works combobox's accessible name comes from the static label, not a floating MUI label", async ({
    page,
  }) => {
    await page.goto("/u/testauthor");

    const combobox = page.getByRole("combobox", { name: "Works to compare" });
    await expect(combobox).toBeVisible();
    // A dropped MUI floating label (requirement 7) means no
    // .MuiInputLabel-root/.MuiFormLabel-root should exist in the DOM at all
    // - only the plain static <span> supplies the name now.
    await expect(page.locator(".MuiInputLabel-root")).toHaveCount(0);
    await expect(page.getByText("Works to compare")).toBeVisible();
  });

  // §1.1's load-bearing verified finding, confirmed live (not just in the
  // jsdom unit suite): a freshly-opened popup's roving highlight starts at
  // -1, so a single ArrowDown deterministically reaches the FIRST tracked
  // option - the fandom header, since flattenToWorkOptions emits it before
  // any of its fandom's work options.
  test("the fandom-header option is reachable via ArrowDown from a freshly opened popup and toggles the whole fandom on Enter", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    const combobox = page.getByRole("combobox", { name: /works to compare/i });
    await combobox.click();
    await expect(page.getByRole("listbox")).toBeVisible();

    await page.keyboard.press("ArrowDown");
    const header = page.getByRole("option", { name: /shared fandom/i });
    const headerId = await header.getAttribute("id");
    await expect(combobox).toHaveAttribute("aria-activedescendant", headerId ?? "");

    await page.keyboard.press("Enter");

    await expect(page.getByRole("status")).toContainText(/maximum of 10 works reached/i);
  });

  test("the fandom-header option's aria-label conveys its tri-state status and available action to assistive tech", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    const header = page.getByRole("option", { name: /shared fandom/i });

    await expect(header).toHaveAccessibleName(/works selected/i);
  });

  test("hovering a work option applies the ink hover tint and stays axe-clean", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    const option = page.getByRole("option", { name: "Comparison Work 2" });
    // Real browser (not jsdom), so the actual Tailwind stylesheet is loaded
    // - this reads the genuinely COMPUTED background rather than a class
    // token, catching the case where the hover utility class is present but
    // doesn't actually resolve to a visible background.
    const backgroundBeforeHover = await option.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await option.hover();
    const backgroundOnHover = await option.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(backgroundOnHover).not.toBe(backgroundBeforeHover);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  // Requirement 3 (§3.2): a fresh single-work populated dashboard (2
  // captures, at the >2-points boundary) renders the slider DISABLED rather
  // than omitting it - the default landing state most users see.
  test("the disabled date-range slider (default single-work selection, ≤2 captures) is present, marked disabled, and axe-clean", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    const sliders = page.getByRole("slider");
    await expect(sliders).toHaveCount(2);
    await expect(sliders.first()).toBeDisabled();
    await expect(sliders.last()).toBeDisabled();
    await expect(page.getByText("Date range")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("a selected work row shows an ink-colored check (not accent) and has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    const selectedOption = page.getByRole("option", { name: "Comparison Work 1", exact: true });
    await expect(selectedOption).toHaveAttribute("aria-selected", "true");
    const checkStroke = await selectedOption
      .locator("polyline")
      .getAttribute("stroke", { timeout: 5000 });
    expect(checkStroke).toBe(LIGHT_COLOR_TOKENS.ink);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("the Autocomplete clear control is named 'Clear all'", async ({ page }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByLabel("Remove Comparison Work 1")).toBeVisible();

    await expect(page.getByRole("button", { name: "Clear all" })).toBeVisible();
  });
});

test.describe("accessibility - picker refinements (axe, dark mode)", () => {
  test.use({ colorScheme: "dark" });

  test("the disabled date-range slider (default single-work selection, ≤2 captures) is axe-clean in dark mode", async ({
    page,
  }) => {
    await mockStatsForUser(page, POPULATED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");
    await expect(page.getByRole("img", { name: /total hits/i })).toBeVisible();

    const sliders = page.getByRole("slider");
    await expect(sliders).toHaveCount(2);
    await expect(sliders.first()).toBeDisabled();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("a selected work row shows an ink-colored check (not accent) and has no detectable a11y violations in dark mode", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    const selectedOption = page.getByRole("option", { name: "Comparison Work 1", exact: true });
    await expect(selectedOption).toHaveAttribute("aria-selected", "true");
    const checkStroke = await selectedOption
      .locator("polyline")
      .getAttribute("stroke", { timeout: 5000 });
    expect(checkStroke).toBe(DARK_COLOR_TOKENS.ink);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("hovering a work option applies the ink hover tint and stays axe-clean in dark mode", async ({
    page,
  }) => {
    await mockStatsForUser(page, MULTI_WORK_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    const option = page.getByRole("option", { name: "Comparison Work 2" });
    const backgroundBeforeHover = await option.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await option.hover();
    const backgroundOnHover = await option.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(backgroundOnHover).not.toBe(backgroundBeforeHover);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
