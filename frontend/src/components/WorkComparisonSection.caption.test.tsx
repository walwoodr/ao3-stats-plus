import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Testing task 8 (docs/plans/per-work-zero-basis-dates.md, section 7): a
// short visible caption renders beneath the chart pair whenever >=1
// currently selected/visible work has a rendered lead-in, and is hidden
// entirely when zero lead-ins are currently rendered.
//
// docs/plans/date-range-slider-month-granularity.md D2 originally meant the
// default range (the real-capture span) sat at/after every work's own
// lead-in month, so the (since-removed) computeLeadIn drop-gate hid the
// caption by default too. Chart-table-polish-batch item 4, OD-2 (docs/
// plans/chart-table-polish-batch.md §4 item 4, resolved 2026-10-06) removes
// that drop-gate - the caption now shows whenever a resolvable leadIn
// exists, independent of window position; "hidden by default" moved
// entirely to the chart's own visual clipping (windowStartEpoch). Several
// tests below still call `widenRange` where that's incidental to clearing
// an unrelated gate (e.g. the >2-union-points reset), not to reveal an
// otherwise-hidden caption.
const CAPTION_TEXT = /dashed segments show the period before your first captured stats for a work/i;
const USERNAME = "testauthor";

function mi(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function widenRange() {
  useWorkComparisonStore.getState().setRange(USERNAME, { start: mi(1990, 1), end: mi(2099, 12) });
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
// batch.md §4 item 4, resolved 2026-10-06): INVERTS this describe block,
// same rationale as WorkComparisonSection.leadIn.test.tsx's identically-
// named supersession block. The caption's visibility (`hasRenderedLeadIn`)
// is derived directly from whether any selected work's built series carries
// a `leadIn` - since OD-2 removes computeLeadIn's window-start drop-gate,
// the caption is no longer hidden by default either; it shows whenever a
// resolvable leadIn exists (subject only to the zero-visible-points and
// degenerate guards), independent of the window. The plan's own §4 item 4
// "Interaction with the caption" note anticipated exactly this.
describe("WorkComparisonSection: visible lead-in caption present regardless of window position (OD-2 supersedes D2's prior data-level hiding)", () => {
  it("renders the caption on first load when the default single selected work has a resolvable leadIn (OD-2: no longer data-level-hidden by default)", () => {
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
        ],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });

    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();
  });

  it("leaves the caption's visibility unchanged by widening the stored range - OD-2 moved that effect to the chart's visual clipping, not computeLeadIn", () => {
    // >2 own distinct points (not just 1) so the pre-existing >2-union-
    // points gate stays clear and doesn't reset the just-widened range back
    // to null on the very next render (the plan's own "<=2 distinct union
    // dates -> effectiveRange falls back to defaultWindow" corner case) -
    // see docs/plans/date-range-slider-month-granularity.md's Corner cases.
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
    ];

    const { rerender } = renderSection({ perWorkSeries: works, earliestPostYear: 2020 });
    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();

    widenRange();
    rerender(
      <WorkComparisonSection perWorkSeries={works} earliestPostYear={2020} username={USERNAME} />,
    );

    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();
  });
});

describe("WorkComparisonSection: visible lead-in caption (widened range)", () => {
  it("does not render the caption when no selected work has a leadIn (no publishedOn, no earliestPostYear)", () => {
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
        ],
      }),
    ];

    widenRange();
    renderSection({ perWorkSeries: works, earliestPostYear: null });

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  it("appears once at least one additionally-selected work has a leadIn, even if the first selected work doesn't", async () => {
    const user = userEvent.setup();
    // Work One (the default selection) needs >2 OWN distinct points so the
    // >2-union-points gate is already clear on the very first render -
    // otherwise the gate-drop line resets the just-widened range back to
    // null before "Work Two" is ever selected, and that reset is permanent
    // (nothing re-applies the wide range afterward). Its own publishedOn is
    // set equal to its first captured point (not null) - with
    // earliestPostYear now needed non-null (for Work Two's domain-floor
    // reachability below), a null publishedOn would otherwise fall back to
    // the earliestPostYear baseline and give Work One an eligible leadIn
    // too, contradicting this test's "even if the first selected work
    // doesn't [have a leadIn]" premise - the zeroBasisDate >= firstVisible-
    // Point guard deterministically suppresses it instead.
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2026-01-01",
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
        publishedOn: "2020-01-01",
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
    renderSection({ perWorkSeries: works, earliestPostYear: 2020 });
    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();

    await selectWorkViaCombobox(user, "Work Two");

    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();
  });

  it("hides the caption again once the only work with a leadIn is deselected", async () => {
    const user = userEvent.setup();
    // Work One (the default selection, and the one with the leadIn here)
    // needs >2 own distinct points so the initial widenRange() write
    // survives the first render's gate check.
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
    renderSection({ perWorkSeries: works, earliestPostYear: 2020 });
    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();

    await selectWorkViaCombobox(user, "Work One");

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  // Chart-table-polish-batch item 4, OD-2 (docs/plans/chart-table-polish-
  // batch.md §4 item 4, resolved 2026-10-06): INVERTS this test's pre-batch
  // assertion. Zooming the slider past a work's publish month used to drop
  // its leadIn entirely (the deliberate pre-batch drop-gate) and hide the
  // caption with it - OD-2 reverses that: the leadIn now stays in the data
  // (clipped visually at the chart's left edge instead, per OD-2a = Option
  // B), so `hasRenderedLeadIn`/the caption must stay TRUE here, per the
  // plan's own §4 "Interaction with the caption" note.
  it("keeps the caption visible once the slider window is narrowed past every selected work's publish month (OD-2: the leadIn is clipped, not dropped)", () => {
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
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
      }),
    ];

    // Narrow past the work's Jan 2010 publish month.
    useWorkComparisonStore.getState().setRange(USERNAME, { start: mi(2019, 1), end: mi(2020, 12) });
    renderSection({ perWorkSeries: works, earliestPostYear: null });

    expect(screen.getByText(/^Jan 2019\s*[–-]/)).toBeInTheDocument();
    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();
  });

  it("renders the caption exactly once, not once per chart (Hits + Kudos)", () => {
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
    ];

    widenRange();
    renderSection({ perWorkSeries: works, earliestPostYear: 2020 });

    expect(screen.getAllByText(CAPTION_TEXT)).toHaveLength(1);
  });

  it("does not render the caption at all with zero works selected", async () => {
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
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    widenRange();
    renderSection({ perWorkSeries: works, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work One");

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });
});
