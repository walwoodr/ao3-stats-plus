import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";
import type { SeriesDatum } from "./charts/MultiSeriesTrendChart";

// Testing tasks 2 + 3 (docs/plans/per-work-zero-basis-dates.md, section 7):
// WorkComparisonSection computes each selected work's zero-basis date and
// passes it as `leadIn` on the SeriesDatum built for MultiSeriesTrendChart
// (mocked here to observe exactly what's passed, independent of
// MultiSeriesTrendChart's own rendering).
//
// docs/plans/date-range-slider-month-granularity.md D2 originally gated
// this at the DATA level: the default range (earliest..latest REAL
// captured month) sits at/after every work's own lead-in month, so a
// drop-gate in computeLeadIn hid the leadIn entirely until the window was
// widened below it. Chart-table-polish-batch item 4, OD-2 (docs/plans/
// chart-table-polish-batch.md §4 item 4, resolved 2026-10-06) REMOVES that
// drop-gate: computeLeadIn no longer consults the window at all, so a
// work's leadIn is now present in the series data regardless of window
// position (subject only to the zero-visible-points and degenerate
// guards) - "hidden by default" is now purely a chart-visual effect, via
// the windowStartEpoch prop clipping it off the left edge (see
// MultiSeriesTrendChart.windowClipping.test.tsx), never a data-model
// absence. Several tests below still call `widenRange` where that's
// incidental to clearing an unrelated gate (e.g. the >2-union-points reset)
// rather than to reveal an otherwise-hidden leadIn.
vi.mock("./charts/MultiSeriesTrendChart", () => ({
  MultiSeriesTrendChart: ({ title, series }: { title: string; series: SeriesDatum[] }) => (
    <pre data-testid={`captured-series-${title}`}>
      {JSON.stringify(series.map((s) => ({ workId: s.workId, leadIn: s.leadIn ?? null })))}
    </pre>
  ),
}));

const USERNAME = "testauthor";

function mi(year: number, month: number): number {
  return year * 12 + (month - 1);
}

// Clamped down to the live domain by WorkComparisonSection's own re-clamp
// logic regardless of exactly how far these sentinels reach - see
// comparisonSelection.ts's clampWindow.
function widenRange() {
  useWorkComparisonStore.getState().setRange(USERNAME, { start: mi(1990, 1), end: mi(2099, 12) });
}

interface CapturedLeadIn {
  capturedOn: string;
  label: string;
  isPublishDate?: boolean;
}

function capturedLeadIns(title = "Hits"): Record<number, CapturedLeadIn | null> {
  const node = screen.getByTestId(`captured-series-${title}`);
  const parsed: { workId: number; leadIn: CapturedLeadIn | null }[] = JSON.parse(
    node.textContent ?? "[]",
  );
  return Object.fromEntries(parsed.map((entry) => [entry.workId, entry.leadIn]));
}

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "",
    points: [],
    publishedOn: null,
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

// Chart-table-polish-batch item 4, OD-2 (docs/plans/chart-table-polish-
// batch.md §4 item 4, resolved 2026-10-06): INVERTS this describe block's
// pre-batch assertions, same as the "guard: date-range slider window vs a
// work's publish month" block below. The D2-LOCKED premise this block's
// name/original comment described - a lead-in HIDDEN at the data level by
// default because the real-capture-span default window sits at/after its
// month - was exactly the drop-gate OD-2 removes. computeLeadIn no longer
// takes the window into account at all (only the zero-visible-points and
// degenerate guards remain), so a work's leadIn is now present in the
// series data on first load too - "hidden by default" is now purely a
// CHART-visual effect (windowStartEpoch clipping it off the left edge),
// never a data-model absence. The plan's own §4 item 4 "Interaction with
// the caption" note anticipated this exact consequence.
describe("WorkComparisonSection: lead-in present in series data regardless of window position (OD-2 supersedes D2's prior data-level hiding)", () => {
  it("keeps every selected work's leadIn present in the series data on first load (default = real-capture span) - hiding is now a chart-visual-only effect", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-06-01",
        points: [
          {
            capturedOn: "2026-01-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: null,
        points: [
          {
            capturedOn: "2026-01-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: 2019 });
    await selectWorkViaCombobox(user, "Work Two");

    const leadIns = capturedLeadIns();
    expect(leadIns[1]).toEqual({
      capturedOn: "2020-06-01",
      label: "Published 2020-06-01",
      isPublishDate: true,
    });
    expect(leadIns[2]).toEqual({
      capturedOn: "2019-01-01",
      label: "Before 2019 (estimated baseline)",
      isPublishDate: false,
    });
  });

  it("leaves the series-data leadIn unchanged by widening the stored range - OD-2 moved that effect to the chart's windowStartEpoch prop, not computeLeadIn", () => {
    // >2 own distinct points (not just 1) so the pre-existing >2-union-
    // points gate stays clear and doesn't reset the just-widened range back
    // to null on the very next render (the plan's own "<=2 distinct union
    // dates -> effectiveRange falls back to defaultWindow" corner case).
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-06-01",
        points: [
          {
            capturedOn: "2026-01-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-02-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-03-01",
            hits: 3,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    const expectedLeadIn = {
      capturedOn: "2020-06-01",
      label: "Published 2020-06-01",
      isPublishDate: true,
    };

    const { rerender } = renderSection({ perWorkSeries: works, earliestPostYear: 2019 });
    expect(capturedLeadIns()[1]).toEqual(expectedLeadIn);

    widenRange();
    rerender(
      <WorkComparisonSection perWorkSeries={works} earliestPostYear={2019} username={USERNAME} />,
    );

    expect(capturedLeadIns()[1]).toEqual(expectedLeadIn);
  });
});

describe("WorkComparisonSection: per-work zero-basis leadIn derivation (widened range)", () => {
  it("uses a work's own publishedOn as its leadIn, labeled 'Published <date>'", async () => {
    const user = userEvent.setup();
    // Work One (the default selection) needs >2 own distinct points so the
    // >2-union-points gate stays clear from the very first render -
    // otherwise the gate-drop line resets the widened range back to null
    // before "Work Two" is ever selected.
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-06-01",
        points: [
          {
            capturedOn: "2026-01-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-02-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-03-01",
            hits: 3,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: null,
        points: [
          {
            capturedOn: "2026-04-01",
            hits: 4,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    widenRange();
    renderSection({ perWorkSeries: works, earliestPostYear: 2019 });
    await selectWorkViaCombobox(user, "Work Two");

    const leadIns = capturedLeadIns();
    expect(leadIns[1]).toEqual({
      capturedOn: "2020-06-01",
      label: "Published 2020-06-01",
      isPublishDate: true,
    });
  });

  it("falls back to `${earliestPostYear}-01-01`, labeled 'Before <year> (estimated baseline)', when publishedOn is null", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-06-01",
        points: [
          {
            capturedOn: "2026-01-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-02-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-03-01",
            hits: 3,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: null,
        points: [
          {
            capturedOn: "2026-04-01",
            hits: 4,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    widenRange();
    renderSection({ perWorkSeries: works, earliestPostYear: 2019 });
    await selectWorkViaCombobox(user, "Work Two");

    const leadIns = capturedLeadIns();
    expect(leadIns[2]).toEqual({
      capturedOn: "2019-01-01",
      label: "Before 2019 (estimated baseline)",
      isPublishDate: false,
    });
  });

  it("gives every fallback work the identical shared fallback capturedOn/label (they collapse to one slot)", async () => {
    const user = userEvent.setup();
    // Work One (the default selection) needs >2 own distinct points so the
    // >2-union-points gate stays clear from the very first render.
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: null,
        points: [
          {
            capturedOn: "2026-01-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-02-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-03-01",
            hits: 3,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: null,
        points: [
          {
            capturedOn: "2026-04-01",
            hits: 4,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    widenRange();
    renderSection({ perWorkSeries: works, earliestPostYear: 2018 });
    await selectWorkViaCombobox(user, "Work Two");

    const leadIns = capturedLeadIns();
    expect(leadIns[1]).toEqual({
      capturedOn: "2018-01-01",
      label: "Before 2018 (estimated baseline)",
      isPublishDate: false,
    });
    expect(leadIns[2]).toEqual(leadIns[1]);
  });

  it("omits leadIn entirely when a work has no publishedOn and earliestPostYear itself is null", async () => {
    const user = userEvent.setup();
    // Work One (the default selection) needs >2 own distinct points so the
    // >2-union-points gate stays clear from the very first render. Since
    // earliestPostYear is null here (that's this test's whole point - no
    // fallback baseline exists), the domain floor is January of the
    // earliest UNION year instead - so Work One's earliest own captured
    // point is deliberately placed in 2020 itself (after its 2020-06-01
    // publish date) so the domain floor reaches far enough back to make
    // that publish date reachable once widened, rather than being
    // permanently out of the domain's reach.
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-06-01",
        points: [
          {
            capturedOn: "2020-07-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-01-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2026-02-01",
            hits: 3,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: null,
        points: [
          {
            capturedOn: "2026-03-01",
            hits: 4,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    widenRange();
    renderSection({ perWorkSeries: works, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");

    const leadIns = capturedLeadIns();
    // Work One still gets its own accurate leadIn even though the shared
    // earliestPostYear prop is null - only the *fallback* path needs it.
    expect(leadIns[1]).toEqual({
      capturedOn: "2020-06-01",
      label: "Published 2020-06-01",
      isPublishDate: true,
    });
    expect(leadIns[2]).toBeNull();
  });

  describe("guard: zeroBasisDate >= firstVisiblePoint.capturedOn", () => {
    it("suppresses the leadIn when a work's publishedOn is not strictly before its first point", async () => {
      const user = userEvent.setup();
      // Work One (the default selection) needs >2 own distinct points so
      // the >2-union-points gate stays clear from the very first render.
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
              comments: 0,
              bookmarks: 0,
              subscriptions: 0,
            },
            {
              capturedOn: "2026-02-01",
              hits: 2,
              kudos: 1,
              comments: 0,
              bookmarks: 0,
              subscriptions: 0,
            },
            {
              capturedOn: "2026-03-01",
              hits: 3,
              kudos: 1,
              comments: 0,
              bookmarks: 0,
              subscriptions: 0,
            },
          ],
        }),
        work({
          ao3WorkId: 2,
          title: "Work Two",
          // Same-day publish/capture - the degenerate corner case.
          publishedOn: "2026-01-01",
          points: [
            {
              capturedOn: "2026-01-01",
              hits: 2,
              kudos: 1,
              comments: 0,
              bookmarks: 0,
              subscriptions: 0,
            },
          ],
        }),
      ];

      widenRange();
      renderSection({ perWorkSeries: works, earliestPostYear: 2019 });
      await selectWorkViaCombobox(user, "Work Two");

      const leadIns = capturedLeadIns();
      expect(leadIns[1]).not.toBeNull();
      expect(leadIns[2]).toBeNull();
    });
  });

  describe("guard: date-range slider window vs a work's publish month", () => {
    const EARLY: PerWorkSeries = work({
      ao3WorkId: 1,
      title: "Work Early",
      publishedOn: "2010-01-01",
      points: [
        {
          capturedOn: "2015-01-01",
          hits: 1,
          kudos: 1,
          comments: 0,
          bookmarks: 0,
          subscriptions: 0,
        },
        {
          capturedOn: "2018-01-01",
          hits: 2,
          kudos: 1,
          comments: 0,
          bookmarks: 0,
          subscriptions: 0,
        },
        {
          capturedOn: "2020-01-01",
          hits: 3,
          kudos: 1,
          comments: 0,
          bookmarks: 0,
          subscriptions: 0,
        },
      ],
    });
    const LATE: PerWorkSeries = work({
      ao3WorkId: 2,
      title: "Work Late",
      publishedOn: "2019-03-01",
      points: [
        {
          capturedOn: "2019-06-01",
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
          capturedOn: "2021-01-01",
          hits: 30,
          kudos: 3,
          comments: 0,
          bookmarks: 0,
          subscriptions: 0,
        },
      ],
    });

    it("keeps every selected work's leadIn present once the window is widened to cover both", async () => {
      const user = userEvent.setup();
      // EARLY alone already clears the >2-union-points gate (3 own points),
      // so the widened range survives the first render. earliestPostYear
      // is set to EARLY's own publish year (rather than this guard block's
      // usual null) so the domain floor - January of
      // min(earliestPostYear, earliestUnionYear) - actually reaches back
      // far enough to make EARLY's 2010 publish month reachable at all; with
      // earliestPostYear null the floor would be Jan 2015 (the earliest
      // UNION capture date), permanently short of EARLY's own 2010 publish
      // date regardless of how wide the stored range is.
      widenRange();
      renderSection({ perWorkSeries: [EARLY, LATE], earliestPostYear: 2010 });
      await selectWorkViaCombobox(user, "Work Late");

      const leadIns = capturedLeadIns();
      expect(leadIns[1]).not.toBeNull();
      expect(leadIns[2]).not.toBeNull();
    });

    // Chart-table-polish-batch item 4, OD-2 (docs/plans/chart-table-polish-
    // batch.md §4 item 4, resolved 2026-10-06): INVERTS this test's
    // pre-batch assertion. The prior "drops a work's leadIn once the
    // slider's narrowed start passes its publish month" behavior was the
    // deliberate drop-gate decision from per-work-zero-basis-dates.md/
    // date-range-slider-month-granularity.md - OD-2 explicitly reverses it:
    // a baseline earlier than the window start now STAYS in the data (the
    // chart clips it visually via windowStartEpoch, per OD-2a = Option B;
    // see MultiSeriesTrendChart.windowClipping.test.tsx), so computeLeadIn
    // must no longer return undefined for this case.
    it("keeps a work's leadIn once the slider's narrowed start passes its publish month (OD-2: drop-gate removed, chart clips it visually instead)", async () => {
      const user = userEvent.setup();
      // Start narrowed to March 2019: past Work Early's Jan 2010 publish
      // month, not past Work Late's March 2019 one (inclusive boundary).
      useWorkComparisonStore
        .getState()
        .setRange(USERNAME, { start: mi(2019, 3), end: mi(2021, 12) });
      renderSection({ perWorkSeries: [EARLY, LATE], earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Late");

      expect(screen.getByText(/^Mar 2019\s*[–-]/)).toBeInTheDocument();

      const leadIns = capturedLeadIns();
      expect(leadIns[1]).not.toBeNull();
      expect(leadIns[2]).not.toBeNull();
    });

    // OD-2 (see the "keeps a work's leadIn..." test above for the full
    // rationale): the start-month gate this test's title/comments
    // originally isolated against no longer exists, so Work Early's leadIn
    // is no longer expected to be null here either - only the "zero
    // visible points" guard (Work Vanishes) still suppresses a leadIn.
    it("omits a work's leadIn only when the narrowed window filters out all of its own visible points - the month-start gate is gone (OD-2)", async () => {
      const user = userEvent.setup();
      const VANISHES: PerWorkSeries = work({
        ao3WorkId: 3,
        title: "Work Vanishes",
        // Publish month (Jan 2020) alone would clear the >= start(Mar 2019)
        // gate - isolating that it's the "zero visible points" condition,
        // not the month gate, that suppresses this one.
        publishedOn: "2020-01-01",
        points: [
          {
            capturedOn: "2015-01-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2016-01-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      });

      useWorkComparisonStore
        .getState()
        .setRange(USERNAME, { start: mi(2019, 3), end: mi(2021, 12) });
      renderSection({ perWorkSeries: [EARLY, LATE, VANISHES], earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Late");
      await selectWorkViaCombobox(user, "Work Vanishes");

      const leadIns = capturedLeadIns();
      expect(leadIns[1]).not.toBeNull(); // Work Early: OD-2 - no longer dropped by a start-month gate
      expect(leadIns[2]).not.toBeNull(); // Work Late: the positive control - still present
      expect(leadIns[3]).toBeNull(); // Work Vanishes: zero visible points after filtering
    });
  });
});
