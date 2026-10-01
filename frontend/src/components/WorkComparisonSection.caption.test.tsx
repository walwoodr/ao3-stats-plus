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
// docs/plans/date-range-slider-month-granularity.md D2 (LOCKED): the default
// range is now the real-capture span, which sits at/after every work's own
// lead-in month - so no lead-in is rendered by default, and the caption is
// therefore hidden by default too. Every test that wants the caption VISIBLE
// widens the stored range first via `widenRange`.
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

describe("WorkComparisonSection: visible lead-in caption hidden by default (D2)", () => {
  it("does not render the caption on first load even when the default single selected work HAS a leadIn (hidden by default, not absent)", () => {
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

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  it("shows the caption once the stored range is widened to include the lead-in month", () => {
    // >2 own distinct points (not just 1) so the pre-existing >2-union-
    // points gate stays clear and doesn't reset the just-widened range back
    // to null on the very next render (the plan's own "<=2 distinct union
    // dates -> effectiveRange falls back to defaultWindow" corner case) -
    // see docs/plans/date-range-slider-month-granularity.md's Corner cases.
    // earliestPostYear is set to the work's own publish year so the domain
    // floor (Jan of min(earliestPostYear, earliestUnionYear)) actually
    // reaches down to the lead-in month being widened to.
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
    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();

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

  // Corner case §4: zooming the slider past every currently selected work's
  // publish month drops every leadIn as a display-window consequence - the
  // caption must follow suit and disappear.
  it("hides the caption once the slider window is narrowed past every selected work's publish month", () => {
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
    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
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
