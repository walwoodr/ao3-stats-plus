import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockStatsForUser, BOOKMARK_FEED_STATS_RESPONSE } from "./support/mockGraphql";

// docs/plans/bookmark-notes-feed.md, task T-10: the new /u/:username/bookmarks
// route, scanned in its default (all-works), filtered, paginated, and
// genuinely-empty states, plus the dashboard<->feed nav path, keyboard-
// operable pagination, and the XSS-neutralization guarantee holding on a
// real rendered page (not just the component-level tests). Kept as its own
// file (mirroring accessibility.pickerRefinements.spec.ts's existing
// satellite-file pattern) rather than appended to accessibility.spec.ts, to
// stay clear of that file's own CODE_STANDARDS.md length budget. None of
// this exists yet - every test below is expected to fail.
test.describe("bookmark notes feed - keyboard nav, focus order, ARIA", () => {
  test("the Bookmarks nav link navigates from the dashboard to the feed, and Dashboard navigates back", async ({
    page,
  }) => {
    await mockStatsForUser(page, BOOKMARK_FEED_STATS_RESPONSE);
    await page.goto("/u/testauthor?token=tok_valid123");

    await page.getByRole("link", { name: /bookmarks/i }).click();
    await expect(page).toHaveURL(/\/u\/testauthor\/bookmarks$/);
    await expect(
      page.getByRole("heading", { name: /testauthor.?s bookmark notes/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /dashboard/i }).click();
    await expect(page).toHaveURL(/\/u\/testauthor$/);
  });

  test("pagination controls are keyboard-operable", async ({ page }) => {
    await mockStatsForUser(page, BOOKMARK_FEED_STATS_RESPONSE);
    await page.goto("/u/testauthor/bookmarks?token=tok_valid123");

    const nextButton = page.getByRole("button", { name: /next/i });
    await nextButton.focus();
    await expect(nextButton).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
  });

  // The load-bearing end-to-end security check (plan §6): the seeded
  // <script>/onerror payload in BOOKMARK_FEED_STATS_RESPONSE's "Popular
  // Work" bookmarks must never execute on a real rendered page.
  test("a seeded XSS payload in a bookmark note does not execute", async ({ page }) => {
    let dialogAppeared = false;
    page.on("dialog", () => {
      dialogAppeared = true;
    });

    await mockStatsForUser(page, BOOKMARK_FEED_STATS_RESPONSE);
    await page.goto("/u/testauthor/bookmarks?token=tok_valid123");
    await expect(page.getByText("Nice fic!")).toBeVisible();

    const xssFlag = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
    expect(xssFlag).toBeUndefined();
    expect(dialogAppeared).toBe(false);
    expect(await page.locator("script", { hasText: "__xss" }).count()).toBe(0);
  });
});

test.describe("bookmark notes feed - automated axe scans", () => {
  test("the default (all-works, multi-page) feed state has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, BOOKMARK_FEED_STATS_RESPONSE);
    await page.goto("/u/testauthor/bookmarks?token=tok_valid123");
    await expect(page.getByText(/no filter.*showing bookmarks from all works/i)).toBeVisible();
    await expect(page.getByRole("navigation", { name: /bookmark feed pagination/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("a 2-work filtered state (glyphs shown, Decision D5) has no detectable a11y violations", async ({
    page,
  }) => {
    await mockStatsForUser(page, BOOKMARK_FEED_STATS_RESPONSE);
    await page.goto("/u/testauthor/bookmarks?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    await page.getByRole("option", { name: "Popular Work" }).click();
    await page.getByRole("option", { name: "Quiet Work" }).click();
    await expect(page.getByLabel("Remove Popular Work")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("a paginated (page 2) state has no detectable a11y violations", async ({ page }) => {
    await mockStatsForUser(page, BOOKMARK_FEED_STATS_RESPONSE);
    await page.goto("/u/testauthor/bookmarks?token=tok_valid123");

    await page.getByRole("button", { name: "2" }).click();
    await expect(page.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });

  test("the genuinely-empty filtered state has no detectable a11y violations", async ({ page }) => {
    await mockStatsForUser(page, BOOKMARK_FEED_STATS_RESPONSE);
    await page.goto("/u/testauthor/bookmarks?token=tok_valid123");

    await page.getByRole("combobox", { name: /works to compare/i }).click();
    await page.getByRole("option", { name: "Empty Work" }).click();
    await expect(page.getByText(/no public bookmark notes found/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
});
