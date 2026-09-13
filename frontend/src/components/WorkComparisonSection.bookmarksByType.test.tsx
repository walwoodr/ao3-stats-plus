import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Bookmarks "By Type" sub-tab (docs/plans/additional-metric-trend-charts.md
// §3.4 Option 1, Testing task T-T6): a Total/Public/Private checkbox group
// (Total checked by default) where each CHECKED type renders its own
// stacked MultiSeriesTrendChart, one line per selected work, grouped by
// metric-type. Shares the same total/public/private data as By Work
// (.bookmarksByWork.test.tsx, T-T7).
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

async function goToBookmarksByType(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Bookmarks" }));
  // By Type is the default sub-tab (T-T5) - no extra click needed, but
  // click defensively in case a future default change is made, since this
  // file only cares about By Type's own content.
  if (screen.getByRole("tab", { name: "By Type" }).getAttribute("aria-selected") !== "true") {
    await user.click(screen.getByRole("tab", { name: "By Type" }));
  }
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkComparisonStore.setState({ byUsername: {} });
});

// Work One: enrichment ran on both snapshots (public/private both present).
// Work Two: enrichment never ran (public/private always null together, per
// the backend's derivation rule - private_bookmarks is null exactly when
// public_bookmarks is null).
const ENRICHED_AND_UNENRICHED_WORKS: PerWorkSeries[] = [
  work({
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
  }),
  work({
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
  }),
];

describe("WorkComparisonSection: Bookmarks By Type", () => {
  it("renders a Bookmark types checkbox group in a fieldset/legend, Total checked by default", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });

    await goToBookmarksByType(user);

    const group = screen.getByRole("group", { name: /bookmark types/i });
    expect(within(group).getByRole("checkbox", { name: "Total" })).toBeChecked();
    expect(within(group).getByRole("checkbox", { name: "Public" })).not.toBeChecked();
    expect(within(group).getByRole("checkbox", { name: "Private" })).not.toBeChecked();
  });

  it("renders exactly one 'Total bookmarks' chart with Total checked by default, one line per selected work", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");

    await goToBookmarksByType(user);

    const figure = screen.getByRole("img", { name: /^total bookmarks$/i });
    expect(within(figure).getAllByText(/work one/i).length).toBeGreaterThan(0);
    expect(within(figure).getAllByText(/work two/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("img", { name: /^public bookmarks$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^private bookmarks$/i })).not.toBeInTheDocument();
  });

  it("checking Public adds a 'Public bookmarks' chart without removing Total's", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    await goToBookmarksByType(user);

    await user.click(screen.getByRole("checkbox", { name: "Public" }));

    expect(screen.getByRole("img", { name: /^total bookmarks$/i })).toBeInTheDocument();
    const publicFigure = screen.getByRole("img", { name: /^public bookmarks$/i });
    expect(within(publicFigure).getAllByText(/work one/i).length).toBeGreaterThan(0);
  });

  it("unchecking Total removes the Total bookmarks chart", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    await goToBookmarksByType(user);

    await user.click(screen.getByRole("checkbox", { name: "Total" }));

    expect(screen.queryByRole("img", { name: /^total bookmarks$/i })).not.toBeInTheDocument();
  });

  it("checking Private adds a 'Private bookmarks' chart", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    await goToBookmarksByType(user);

    await user.click(screen.getByRole("checkbox", { name: "Private" }));

    const figure = screen.getByRole("img", { name: /^private bookmarks$/i });
    expect(within(figure).getAllByText(/work one/i).length).toBeGreaterThan(0);
  });

  // Plan §3.3/§4.1: sparse public/private points are filtered out before
  // charting (never fabricated as zero) - the a11y table's own "—" cell
  // convention (existing cellValue path) confirms the gap for Work Two's
  // unenriched snapshot, distinct from a genuine captured 0.
  it("Public bookmarks: a work with no enrichment on a date shows a gap ('—'), never a fabricated 0, in the accessible table", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");
    await goToBookmarksByType(user);

    await user.click(screen.getByRole("checkbox", { name: "Public" }));

    const table = screen.getByRole("table", { name: /^public bookmarks$/i });
    const workTwoRow = within(table)
      .getAllByRole("row")
      .find((row) => /2026-01-08/.test(row.textContent ?? "") && /—/.test(row.textContent ?? ""));
    expect(workTwoRow).toBeDefined();
  });

  // Corner case §4.2: a checked type with ZERO data across every currently
  // selected work must show an explicit message, not an empty/blank chart
  // frame.
  it("shows an empty-state message instead of a blank chart when the checked type has no data for any selected work", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    // Deselect Work One (the only enriched work), leaving only Work Two,
    // which never has public/private data.
    await selectWorkViaCombobox(user, "Work One");
    await goToBookmarksByType(user);

    await user.click(screen.getByRole("checkbox", { name: "Public" }));

    expect(screen.queryByRole("img", { name: /^public bookmarks$/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/no public.*bookmark data captured yet for the selected works/i),
    ).toBeInTheDocument();
  });

  // Plan §3.3: "No zero-basis lead-in on the sparse public/private series
  // (their first enrichment point is not the work's first capture). Total
  // keeps its lead-in."
  it("Total gets a zero-basis leadIn but the Public/Private charts for the same work do not", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    await goToBookmarksByType(user);

    const totalFigure = screen.getByRole("img", { name: /^total bookmarks$/i });
    expect(within(totalFigure).getAllByText(/published 2020-01-01/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("checkbox", { name: "Public" }));

    const publicFigure = screen.getByRole("img", { name: /^public bookmarks$/i });
    expect(within(publicFigure).queryByText(/published 2020-01-01/i)).not.toBeInTheDocument();
    expect(within(publicFigure).queryByText(/estimated baseline/i)).not.toBeInTheDocument();
  });

  it("each checked type-chart exposes its own accessible sr-only data table (Date x works)", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    await goToBookmarksByType(user);
    await user.click(screen.getByRole("checkbox", { name: "Private" }));

    expect(screen.getByRole("table", { name: /^total bookmarks$/i })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /^private bookmarks$/i })).toBeInTheDocument();
  });

  it("the checkboxes are keyboard-operable (Space toggles)", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: ENRICHED_AND_UNENRICHED_WORKS, earliestPostYear: null });
    await goToBookmarksByType(user);

    screen.getByRole("checkbox", { name: "Public" }).focus();
    await user.keyboard(" ");

    expect(screen.getByRole("checkbox", { name: "Public" })).toBeChecked();
    expect(screen.getByRole("img", { name: /^public bookmarks$/i })).toBeInTheDocument();
  });
});
