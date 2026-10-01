import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

const USERNAME = "testauthor";

// docs/plans/date-range-slider-month-granularity.md D1: month-index
// encoding (`year * 12 + (month - 1)`), matching lib/monthIndex.ts.
function mi(year: number, month: number): number {
  return year * 12 + (month - 1);
}

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

// MUI's Autocomplete toggles the popup closed on a second click of an
// already-open, already-focused input - only click to open if not already
// open, so a second call in the same test doesn't accidentally close it.
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

// Regression for TECH_DEBT.md (2026-08-03): `range` was only ever reset to
// null when the selection dropped *below* the >2 union-points gate - never
// reconciled against a live `domain` that shifts while staying *above* the
// gate. This drives the selection through exactly that path (never dipping
// to <= 2 union points, so the old gate-based reset never fires) and
// asserts the newly-selected work's own points actually reach the chart,
// rather than being silently filtered out by a stale window. Interaction
// mechanism updated to the combobox (docs/plans/work-comparison-picker-
// redesign.md T9(a)) - the regression assertion itself is unchanged.
describe("stale range window across a selection swap (regression)", () => {
  it("re-clamps the window against the live domain instead of leaving a stale narrowed range applied", async () => {
    const user = userEvent.setup();
    const worksWithDisjointRanges: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work Early",
        fandoms: "Fandom A",
        points: [
          {
            capturedOn: "2018-01-01",
            hits: 10,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2018-06-01",
            hits: 20,
            kudos: 2,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2019-01-01",
            hits: 30,
            kudos: 3,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Late",
        fandoms: "Fandom A",
        points: [
          {
            capturedOn: "2023-01-01",
            hits: 100,
            kudos: 10,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2024-01-01",
            hits: 200,
            kudos: 20,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2025-01-01",
            hits: 300,
            kudos: 30,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    renderSection({ perWorkSeries: worksWithDisjointRanges, earliestPostYear: null });

    // "Work Early" alone already clears the >2 union-points gate (3
    // points), so the slider is mounted from the default 1-selected state.
    // Per D2 (LOCKED), the default window is already Work Early's own
    // real-capture span (Jan 2018 - Jan 2019) - narrowing further isn't
    // needed to set up this regression's stale-window premise, since the
    // default itself already excludes Work Late's 2023-2025 points.
    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Jan 2018\s*[–-]\s*Jan 2019$/)).toBeInTheDocument();

    // Add Work Late (union points stay well above the gate throughout),
    // then drop Work Early - leaving only Work Late selected. Work Late
    // alone still clears the gate (3 points), so the slider stays mounted
    // and the selection never dips to <= 2 union points, meaning the old
    // gate-drop reset never fires even though the domain has shifted.
    await selectWorkViaCombobox(user, "Work Late");
    await selectWorkViaCombobox(user, "Work Early");

    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);

    // The work's dates now live in the visible synced table's column
    // headers (a sibling of the aria-hidden figure, not the old sr-only
    // marker spans that used to sit inside it - docs/plans/chart-synced-
    // data-table.md §2.4). Without a live re-clamp against the current
    // domain, Work Late's 2023-2025 points are all silently filtered out
    // by the stale [2018, 2019] window - this should not happen.
    const hitsTable = screen.getByRole("table", { name: /^hits$/i });
    expect(within(hitsTable).getByRole("columnheader", { name: "2024-01-01" })).toBeInTheDocument();
  });
});

// Regression for TECH_DEBT.md (2026-08-03): the role="status" "Comparing N
// works, START to END." summary used to derive its year span from the full
// unfiltered union of the selected works' captured dates, never from the
// currently-applied DateRangeSlider window - so narrowing the visible range
// changed the charts but not what was announced to screen readers. Fixed to
// report the currently-active (possibly narrowed) range, matching what's
// actually shown.
describe("comparison summary reports the active windowed range, not the full data span (regression)", () => {
  it("updates the announced month/year span when the date-range window is narrowed", () => {
    const singleWorkWideSpan: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work Only",
        fandoms: "Fandom A",
        points: [
          {
            capturedOn: "2018-01-01",
            hits: 10,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2020-01-01",
            hits: 20,
            kudos: 2,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2025-01-01",
            hits: 30,
            kudos: 3,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    // A single selected work's default window (D2) already equals its own
    // full real-capture span - Jan 2018 to Jan 2025 - so this test still
    // needs a genuine narrowing action to exercise the regression. Setting
    // the store directly (rather than 60+ month-step ArrowLeft presses)
    // proves the same summary-derivation logic; DateRangeSlider.test.tsx
    // separately covers the slider's own keyboard-stepping mechanics.
    const { rerender } = renderSection({
      perWorkSeries: singleWorkWideSpan,
      earliestPostYear: null,
    });

    expect(screen.getByRole("status")).toHaveTextContent(/Jan 2018 to Jan 2025/);

    useWorkComparisonStore.getState().setRange(USERNAME, { start: mi(2018, 1), end: mi(2020, 1) });
    rerender(
      <WorkComparisonSection
        perWorkSeries={singleWorkWideSpan}
        earliestPostYear={null}
        username={USERNAME}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Jan 2018 to Jan 2020/);
    expect(screen.getByRole("status")).not.toHaveTextContent(/Jan 2018 to Jan 2025/);
  });
});

// Regression for a Review (adversarial) finding, 2026-10-01: a malformed
// capturedOn at either boundary of the sorted union-dates array made
// monthIndexOf return NaN for defaultWindow.start/.end. Since effectiveRange
// is never-null (D2), every filterPointsInWindow comparison against a NaN
// bound is false - silently discarding ALL real points across every
// selected work, not just the one malformed point. This directly violated
// the plan's own stated invariant (§5 Error states: "the point is excluded
// ... No throw, no crash" - implying only the bad point, never everything
// else). Fixed by falling back to `domain` when either union-derived bound
// isn't finite.
describe("a malformed capturedOn at a union-date boundary does not suppress every other real point (regression)", () => {
  it("still renders the other works' real data when the union's first date is malformed", async () => {
    const user = userEvent.setup();
    const worksWithOneMalformedBoundary: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work Malformed",
        points: [
          {
            capturedOn: "not-a-date",
            hits: 1,
            kudos: 0,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Good",
        points: [
          {
            capturedOn: "2024-03-01",
            hits: 10,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2024-04-01",
            hits: 20,
            kudos: 2,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    renderSection({ perWorkSeries: worksWithOneMalformedBoundary, earliestPostYear: null });
    // Default selection (reconcileSelection) is Work Malformed alone - add
    // Work Good so both are in the union, matching the scenario the
    // adversarial finding actually describes (a malformed point at one
    // boundary of a multi-work union, not a single-work selection).
    await selectWorkViaCombobox(user, "Work Good");

    const table = screen.getByRole("table", { name: /hits/i });
    expect(within(table).getByRole("columnheader", { name: "2024-03-01" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "2024-04-01" })).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(/NaN/);
  });

  // Regression for Review (adversarial) Finding 2, 2026-10-01: the test
  // above only covers the `defaultWindow`/`monthIndexOf` guard, reached via
  // the multi-work union. The deeper bug - `yearOf()` (feeding `domainStart`/
  // `domain` itself, not just `defaultWindow`) had no NaN guard at all - is
  // only reachable when the DEFAULT single-work selection
  // (`reconcileSelection`) lands on the one work whose only point is
  // malformed, which the multi-work test above exercises only as an
  // unstated side effect of array order. This test makes that path
  // explicit: a single work, malformed point, no interaction - asserting it
  // renders at all (an infinite re-render loop throws, so a successful
  // render IS the assertion) rather than relying on the combobox test to
  // keep covering it incidentally.
  it("still renders (no infinite re-render loop) when the only selected work's only point is malformed", () => {
    const soleWorkMalformed: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work Malformed",
        points: [
          {
            capturedOn: "not-a-date",
            hits: 1,
            kudos: 0,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    renderSection({ perWorkSeries: soleWorkMalformed, earliestPostYear: null });

    expect(screen.getByRole("status")).not.toHaveTextContent(/NaN/);
  });
});
