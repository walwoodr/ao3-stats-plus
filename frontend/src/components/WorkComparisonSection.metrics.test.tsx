import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Per-work metric toggle + non-sparse new metrics (docs/plans/additional-
// metric-trend-charts.md §3.0/§3.1/§3.2, Testing task T-T4). Split into its
// own file (mirrors the existing .leadIn/.caption/.persistence split) so
// WorkComparisonSection.test.tsx stays under its 500-line budget.
//
// Comments, Bookmarks(total), and Subscriptions are "non-sparse" - always
// present on every PerWorkPoint, so §3.2's generalized buildSeries renders
// them exactly like Hits/Kudos (one line per work, window-filtered,
// zero-basis lead-in applied). Selecting the Bookmarks tab itself expands
// into the By-Work/By-Type sub-tab shell (T-T5/T-T6/T-T7, covered in the
// sibling .bookmarksShell/.bookmarksByType/.bookmarksByWork test files) -
// this file only exercises the Bookmarks *tab button* existing in the
// toggle, not its sub-tab content.
const USERNAME = "testauthor";

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], ...overrides };
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

beforeEach(() => {
  window.localStorage.clear();
  useWorkComparisonStore.setState({ byUsername: {} });
});

const TWO_WORKS_ALL_METRICS: PerWorkSeries[] = [
  work({
    ao3WorkId: 1,
    title: "Work One",
    fandoms: "Fandom A",
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

describe("WorkComparisonSection: per-work metric toggle", () => {
  it("renders a tablist with Hits/Kudos/Comments/Bookmarks/Subscriptions tabs", () => {
    renderSection({ perWorkSeries: TWO_WORKS_ALL_METRICS, earliestPostYear: null });

    const tablist = screen.getByRole("tablist", { name: /metric/i });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Hits",
      "Kudos",
      "Comments",
      "Bookmarks",
      "Subscriptions",
    ]);
  });

  it("defaults to the Hits tab selected", () => {
    renderSection({ perWorkSeries: TWO_WORKS_ALL_METRICS, earliestPostYear: null });

    expect(screen.getByRole("tab", { name: "Hits" })).toHaveAttribute("aria-selected", "true");
  });

  describe.each([
    { tabName: "Comments", chartName: /^comments$/i, field: "comments" as const },
    { tabName: "Bookmarks", chartName: /^total bookmarks$/i, field: "bookmarks" as const },
    { tabName: "Subscriptions", chartName: /^subscriptions$/i, field: "subscriptions" as const },
  ])("$tabName metric", ({ tabName, chartName, field }) => {
    it(`renders one line per selected work built from ${field}`, async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: TWO_WORKS_ALL_METRICS, earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Two");

      await user.click(screen.getByRole("tab", { name: tabName }));

      const figure = screen.getByRole("img", { name: chartName });
      const markers = within(figure).getAllByTestId(/multi-series-point-marker-/);
      const values = markers.map((m) => m.textContent ?? "");
      expect(values.some((v) => v.includes(`Work One`))).toBe(true);
      expect(values.some((v) => v.includes(`Work Two`))).toBe(true);
      const workOnePoint = TWO_WORKS_ALL_METRICS[0].points[1];
      expect(values.some((v) => v.includes(String(workOnePoint[field])))).toBe(true);
    });
  });

  it("Bookmarks tab (By Type default, Total checked) uses the always-present total bookmarks count, not the sparse split", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: TWO_WORKS_ALL_METRICS, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");

    await user.click(screen.getByRole("tab", { name: "Bookmarks" }));

    const figure = screen.getByRole("img", { name: /^total bookmarks$/i });
    const markers = within(figure).getAllByTestId(/multi-series-point-marker-/);
    // Work Two's only point has bookmarks: 2 (its publicBookmarks/
    // privateBookmarks are null - By Type's Total series must still show it).
    expect(markers.some((m) => /work two.*\b2\b/i.test(m.textContent ?? ""))).toBe(true);
  });

  it("respects the active date-range window for a non-sparse metric, same as Hits/Kudos", async () => {
    const user = userEvent.setup();
    const worksWithThreeUnionPoints: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        fandoms: "Fandom A",
        points: [
          {
            capturedOn: "2020-01-01",
            hits: 1,
            kudos: 1,
            comments: 1,
            bookmarks: 1,
            subscriptions: 1,
            publicBookmarks: null,
            privateBookmarks: null,
          },
          {
            capturedOn: "2021-01-01",
            hits: 2,
            kudos: 1,
            comments: 9,
            bookmarks: 1,
            subscriptions: 1,
            publicBookmarks: null,
            privateBookmarks: null,
          },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        fandoms: "Fandom A",
        points: [
          {
            capturedOn: "2022-01-01",
            hits: 3,
            kudos: 1,
            comments: 1,
            bookmarks: 1,
            subscriptions: 1,
            publicBookmarks: null,
            privateBookmarks: null,
          },
        ],
      }),
    ];
    renderSection({ perWorkSeries: worksWithThreeUnionPoints, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");
    await user.click(screen.getByRole("tab", { name: "Comments" }));

    const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
    startThumb.focus();
    for (let year = 2020; year < 2021; year++) {
      // eslint-disable-next-line no-await-in-loop -- sequential key presses drive one slider thumb
      await user.keyboard("{ArrowRight}");
    }

    const figure = screen.getByRole("img", { name: /^comments$/i });
    // 2020's comments:1 point for Work One should be filtered out of the
    // window; its 2021 comments:9 point should remain.
    expect(screen.queryByText(/work one.*2020-01-01.*1 comments/i)).not.toBeInTheDocument();
    expect(within(figure).getByText(/work one.*2021-01-01.*9 comments/i)).toBeInTheDocument();
  });

  it("carries a zero-basis leadIn on a non-sparse metric chart, same as Hits", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [
          {
            capturedOn: "2026-01-01",
            hits: 1,
            kudos: 1,
            comments: 4,
            bookmarks: 1,
            subscriptions: 1,
            publicBookmarks: null,
            privateBookmarks: null,
          },
        ],
      }),
    ];
    renderSection({ perWorkSeries: works, earliestPostYear: null });

    await user.click(screen.getByRole("tab", { name: "Comments" }));

    const figure = screen.getByRole("img", { name: /^comments$/i });
    expect(within(figure).getAllByText(/published 2020-01-01/i).length).toBeGreaterThan(0);
  });

  it("switching metric tabs does not reset the selected works or the active range window", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: TWO_WORKS_ALL_METRICS, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");

    await user.click(screen.getByRole("tab", { name: "Comments" }));
    await user.click(screen.getByRole("tab", { name: "Hits" }));

    expect(useWorkComparisonStore.getState().getSelection(USERNAME)).toEqual([1, 2]);
    const figure = screen.getByRole("img", { name: /^hits$/i });
    expect(within(figure).getAllByText(/work two/i).length).toBeGreaterThan(0);
  });

  it("persists the selected per-work metric per-username across a remount", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSection({
      perWorkSeries: TWO_WORKS_ALL_METRICS,
      earliestPostYear: null,
    });
    await user.click(screen.getByRole("tab", { name: "Subscriptions" }));
    unmount();

    renderSection({ perWorkSeries: TWO_WORKS_ALL_METRICS, earliestPostYear: null });

    expect(screen.getByRole("tab", { name: "Subscriptions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
