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
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], bookmarks: [], ...overrides };
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

    const figure = screen.getByRole("img", { name: "Work One" });
    expect(within(figure).getAllByText(/^total —/i).length).toBeGreaterThan(0);
    expect(within(figure).getAllByText(/^public —/i).length).toBeGreaterThan(0);
    expect(within(figure).getAllByText(/^private —/i).length).toBeGreaterThan(0);
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
    // via the sr-only table's column headers (<th>) instead.
    const figure = screen.getByRole("img", { name: "Work One" });
    expect(
      within(figure).getByText(/total.*slate-blue circle marker/i, { selector: "th" }),
    ).toBeInTheDocument();
    expect(
      within(figure).getByText(/public.*teal square marker/i, { selector: "th" }),
    ).toBeInTheDocument();
    expect(
      within(figure).getByText(/private.*sage triangle marker/i, { selector: "th" }),
    ).toBeInTheDocument();
  });

  // Corner case §4.3: a selected work with zero enrichment data is NOT an
  // error - its Total line is always present (bookmarks is non-null on
  // every point); only Public/Private are absent.
  it("a work with zero enrichment data still renders its Total line; Public/Private are simply absent, not an error", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [UNENRICHED_WORK], earliestPostYear: null });

    await goToBookmarksByWork(user);

    const figure = screen.getByRole("img", { name: "Work Two" });
    expect(within(figure).getByText(/total.*2026-01-08.*2/i)).toBeInTheDocument();
    expect(within(figure).queryByText(/^public —/i)).not.toBeInTheDocument();
    expect(within(figure).queryByText(/^private —/i)).not.toBeInTheDocument();
  });

  it("each work's chart exposes its own accessible sr-only table with Date x Total/Public/Private columns", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: [ENRICHED_WORK], earliestPostYear: null });

    await goToBookmarksByWork(user);

    const table = screen.getByRole("table", { name: "Work One" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    // Column headers also carry the worded (shape, color) description now
    // (see the "fixed slot 0/1/2" test below) - asserted loosely here via
    // startsWith rather than duplicating the exact wording.
    expect(headers).toHaveLength(4);
    expect(headers[0]).toBe("Date");
    expect(headers[1]).toMatch(/^Total —/);
    expect(headers[2]).toMatch(/^Public —/);
    expect(headers[3]).toMatch(/^Private —/);
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

    const figure = screen.getByRole("img", { name: "Work One" });
    expect(within(figure).getByText(/total.*published 2020-01-01/i)).toBeInTheDocument();
    expect(within(figure).queryByText(/public.*published 2020-01-01/i)).not.toBeInTheDocument();
    expect(within(figure).queryByText(/private.*published 2020-01-01/i)).not.toBeInTheDocument();
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
