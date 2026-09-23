import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Bookmarks "By Work" sub-tab (docs/plans/additional-metric-trend-charts.md
// §3.4 Option 3, Testing task T-T7): for every currently-selected work, IN
// SELECTION ORDER, one MultiSeriesTrendChart plots that work's Total/
// Public/Private as three lines using the FIXED slot 0/1/2 shape+color
// (Total=circle/slate-blue, Public=square/teal, Private=triangle/sage - see
// seriesStyles.ts's SERIES_STYLE_SLOTS) - identity channels are free here
// since each chart holds exactly one work's data. Shares the same
// total/public/private data as By Type (.bookmarksByType.test.tsx, T-T6).
const USERNAME = "testauthor";

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "",
    points: [],
    bookmarks: [],
    ...overrides,
  };
}

function renderSection(props: { perWorkSeries: PerWorkSeries[]; earliestPostYear: number | null }) {
  return render(<WorkComparisonSection {...props} username={USERNAME} />);
}

async function selectWorkViaCombobox(user: ReturnType<typeof userEvent.setup>, title: string) {
  if (!screen.queryByRole("listbox")) {
    await user.click(screen.getByRole("combobox", { name: /works to compare/i }));
  }
  await user.click(screen.getByRole("option", { name: title }));
}

async function goToBookmarksByWork(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Bookmarks" }));
  await user.click(screen.getByRole("tab", { name: "By Work" }));
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkComparisonStore.setState({ byUsername: {} });
});

const ENRICHED_WORK = work({
  ao3WorkId: 1,
  title: "Work One",
  fandoms: "Fandom A",
  publishedOn: "2020-01-01",
  points: [
    {
      capturedOn: "2026-01-01",
      hits: 10,
      kudos: 1,
      comments: 2,
      bookmarks: 4,
      subscriptions: 1,
      publicBookmarks: 3,
      privateBookmarks: 1,
    },
    {
      capturedOn: "2026-01-08",
      hits: 20,
      kudos: 2,
      comments: 5,
      bookmarks: 9,
      subscriptions: 2,
      publicBookmarks: 6,
      privateBookmarks: 3,
    },
  ],
});

const UNENRICHED_WORK = work({
  ao3WorkId: 2,
  title: "Work Two",
  fandoms: "Fandom A",
  points: [
    {
      capturedOn: "2026-01-08",
      hits: 5,
      kudos: 1,
      comments: 1,
      bookmarks: 2,
      subscriptions: 1,
      publicBookmarks: null,
      privateBookmarks: null,
    },
  ],
});

describe("WorkComparisonSection: Bookmarks By Work", () => {
  it("renders one chart per selected work, each titled by that work's title", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [ENRICHED_WORK, UNENRICHED_WORK], earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");

    await goToBookmarksByWork(user);

    expect(screen.getByRole("img", { name: "Work One" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Work Two" })).toBeInTheDocument();
  });

  it("each work's chart shows exactly three lines labeled Total/Public/Private (not by work title)", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [ENRICHED_WORK], earliestPostYear: null });

    await goToBookmarksByWork(user);

    // The per-line labeling now lives in the visible table's row headers (a
    // sibling of the aria-hidden figure, not nested inside it, per
    // docs/plans/chart-synced-data-table.md §2.4) - each row header splits
    // the visible title and the visually-hidden identity description across
    // two elements (D5), so check via .textContent rather than a single
    // getByText node match.
    const table = screen.getByRole("table", { name: "Work One" });
    const rowHeaders = within(table)
      .getAllByRole("rowheader")
      .map((header) => header.textContent ?? "");
    expect(rowHeaders.some((text) => /^total/i.test(text))).toBe(true);
    expect(rowHeaders.some((text) => /^public/i.test(text))).toBe(true);
    expect(rowHeaders.some((text) => /^private/i.test(text))).toBe(true);
  });

  // Plan §3.4: fixed styleIndex 0/1/2 (Total=slot 0 circle/slate-blue,
  // Public=slot 1 square/teal, Private=slot 2 triangle/sage) - learnable
  // once, consistent across every work's chart, regardless of the work's
  // OWN top-level style slot (used elsewhere for cross-work identity).
  it("uses the fixed slot 0/1/2 shape+color glyphs for Total/Public/Private, worded in the sr-only accessible table", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [ENRICHED_WORK], earliestPostYear: null });

    await goToBookmarksByWork(user);

    // The worded (shape, color) description no longer renders in the
    // visible legend (removed per 2026-08-09 TECH_DEBT.md) - asserted here
    // via the visible table's row headers (<th scope="row">) instead (D5).
    const table = screen.getByRole("table", { name: "Work One" });
    const rowHeaders = within(table)
      .getAllByRole("rowheader")
      .map((header) => header.textContent ?? "");
    expect(rowHeaders.some((text) => /total.*slate-blue circle marker/i.test(text))).toBe(true);
    expect(rowHeaders.some((text) => /public.*teal square marker/i.test(text))).toBe(true);
    expect(rowHeaders.some((text) => /private.*sage triangle marker/i.test(text))).toBe(true);
  });

  // Corner case §4.3: a selected work with zero enrichment data is NOT an
  // error - its Total line is always present (bookmarks is non-null on
  // every point); only Public/Private are absent.
  it("a work with zero enrichment data still renders its Total line; Public/Private are simply absent, not an error", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [UNENRICHED_WORK], earliestPostYear: null });

    await goToBookmarksByWork(user);

    const table = screen.getByRole("table", { name: "Work Two" });
    const rowHeaders = within(table).getAllByRole("rowheader");
    const rowHeaderTexts = rowHeaders.map((header) => header.textContent ?? "");
    expect(rowHeaderTexts.some((text) => /^total/i.test(text))).toBe(true);
    // Public/Private are excluded from the series entirely for an
    // unenriched work (WorkComparisonBookmarksTab's buildWorkTypeSeries
    // filters out any type with zero points) - no row at all, not merely an
    // empty/"—" one.
    expect(rowHeaderTexts.some((text) => /^public/i.test(text))).toBe(false);
    expect(rowHeaderTexts.some((text) => /^private/i.test(text))).toBe(false);

    const totalRowHeader = rowHeaders.find((header) => /^total/i.test(header.textContent ?? ""));
    const totalRow = totalRowHeader?.closest("tr");
    expect(totalRow).not.toBeNull();
    expect(within(totalRow as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  // Rewritten for the transposed synced data table (docs/plans/chart-
  // synced-data-table.md D3): dates are now COLUMNS and Total/Public/
  // Private are ROWS - the inverse of the old sr-only table's Date x
  // work-type column shape this test used to check.
  it("each work's chart exposes its own visible table with Total/Public/Private rows across the captured dates", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [ENRICHED_WORK], earliestPostYear: null });

    await goToBookmarksByWork(user);

    const table = screen.getByRole("table", { name: "Work One" });
    const columnHeaders = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    // Corner cell (sr-only "Work") + Total's zero-basis leadIn column + one
    // per captured date (see the leadIn test below for why only Total's
    // leadIn contributes a column here).
    expect(columnHeaders).toEqual(["Work", "Published 2020-01-01", "2026-01-01", "2026-01-08"]);

    // Row headers also carry the worded (shape, color) description now (see
    // the "fixed slot 0/1/2" test above) - asserted loosely here via
    // startsWith rather than duplicating the exact wording.
    const rowHeaders = within(table)
      .getAllByRole("rowheader")
      .map((header) => header.textContent ?? "");
    expect(rowHeaders).toHaveLength(3);
    expect(rowHeaders.some((text) => text.startsWith("Total"))).toBe(true);
    expect(rowHeaders.some((text) => text.startsWith("Public"))).toBe(true);
    expect(rowHeaders.some((text) => text.startsWith("Private"))).toBe(true);
  });

  // Plan §3.4: "By-Work charts stack in that same [selection] order" - the
  // existing orderedSelectedWorks order, not perWorkSeries declaration
  // order.
  it("stacks the charts in selection order, not perWorkSeries declaration order", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [ENRICHED_WORK, UNENRICHED_WORK], earliestPostYear: null });
    // Deselect the default (Work One), then select Work Two first, then
    // Work One again - selection order is now [Work Two, Work One],
    // reversed from perWorkSeries declaration order.
    await selectWorkViaCombobox(user, "Work One");
    await selectWorkViaCombobox(user, "Work Two");
    await selectWorkViaCombobox(user, "Work One");

    await goToBookmarksByWork(user);

    // Scoped to `aria-labelledby` rather than a bare getAllByRole("img"):
    // WorkPicker's per-chip remove icons are also role="img" (labeled via a
    // direct aria-label, not aria-labelledby), so an unscoped query here
    // would pick those up alongside the chart figures.
    const figures = screen
      .getAllByRole("img")
      .filter((figure) => figure.hasAttribute("aria-labelledby"));
    const titles = figures.map((figure) => figure.getAttribute("aria-labelledby"));
    const headingTexts = titles.map((id) => document.getElementById(id ?? "")?.textContent ?? "");
    expect(headingTexts).toEqual(["Work Two", "Work One"]);
  });

  // Plan §3.3/§3.4: Total keeps its zero-basis leadIn; Public/Private never
  // get one (their first enrichment point isn't the work's first capture).
  it("Total keeps its zero-basis leadIn within a work's By-Work chart; Public/Private do not", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [ENRICHED_WORK], earliestPostYear: null });

    await goToBookmarksByWork(user);

    const table = screen.getByRole("table", { name: "Work One" });
    expect(
      within(table).getByRole("columnheader", { name: "Published 2020-01-01" }),
    ).toBeInTheDocument();
    const rowHeaders = within(table).getAllByRole("rowheader");

    // Total's row has a real (leadIn) 0 value at that column.
    const totalRow = rowHeaders
      .find((header) => /^total/i.test(header.textContent ?? ""))
      ?.closest("tr");
    expect(totalRow).not.toBeNull();
    expect(within(totalRow as HTMLElement).getByText("0")).toBeInTheDocument();

    // Public/Private never carry a leadIn - their rows show "—" at that
    // same zero-basis column instead of a fabricated 0.
    const publicRow = rowHeaders
      .find((header) => /^public/i.test(header.textContent ?? ""))
      ?.closest("tr");
    const privateRow = rowHeaders
      .find((header) => /^private/i.test(header.textContent ?? ""))
      ?.closest("tr");
    expect(within(publicRow as HTMLElement).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(privateRow as HTMLElement).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders without a cap on the number of selected works (no artificial limit on By-Work stacking)", async () => {
    const user = userEvent.setup();
    const manyWorks: PerWorkSeries[] = Array.from({ length: 5 }, (_, i) =>
      work({
        ao3WorkId: i + 1,
        title: `Work ${i + 1}`,
        fandoms: "Big Fandom",
        points: [
          {
            capturedOn: "2026-01-01",
            hits: 1,
            kudos: 1,
            comments: 1,
            bookmarks: i + 1,
            subscriptions: 1,
            publicBookmarks: null,
            privateBookmarks: null,
          },
        ],
      }),
    );
    renderSection({ perWorkSeries: manyWorks, earliestPostYear: null });
    await user.click(screen.getByRole("combobox", { name: /works to compare/i }));
    await user.click(screen.getByRole("option", { name: /big fandom/i }));

    await goToBookmarksByWork(user);

    manyWorks.forEach((w) => {
      expect(screen.getByRole("img", { name: w.title })).toBeInTheDocument();
    });
  });
});
