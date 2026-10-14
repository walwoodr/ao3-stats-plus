import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Maintenance (2026-10-13, item 1): the date-range slider's drag-bounds
// (`DateRangeSlider`'s `min`/`max`, surfaced as `aria-valuemin`/
// `aria-valuemax` on both thumbs) used to derive from the account-wide
// `earliestPostYear` alone (`domainStart = earliestPostYear ?? ...`),
// ignoring which works were actually selected - a selection of only
// recently-published works could still drag the slider's start thumb back
// to the author's very first-ever post, long before any selected work
// existed. ROADMAP.md "v2 candidates" (confirmed 2026-08-03, amended
// 2026-08-04) specifies the real fix: the floor/ceiling should come from
// the CURRENTLY SELECTED works' own data, recomputed as the selection
// changes - and a committed window that falls entirely inside the "every
// selected work lacks real data here" gap should be rejected the same way
// an out-of-domain window already is.
const USERNAME = "testauthor";

function mi(year: number, month: number): number {
  return year * 12 + (month - 1);
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

async function selectWorkViaCombobox(user: ReturnType<typeof userEvent.setup>, title: string) {
  if (!screen.queryByRole("listbox")) {
    await user.click(screen.getByRole("combobox", { name: /works to compare/i }));
  }
  await user.click(screen.getByRole("option", { name: title }));
}

function startThumb(): HTMLElement {
  return screen.getByRole("slider", { name: /^range start$/i });
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkComparisonStore.setState({ byUsername: {} });
});

describe("DateRangeSlider domain bounds reflect the current selection, not the account-wide earliestPostYear", () => {
  it("floors the slider at the selected work's own publish date, not the account's much-earlier earliestPostYear", () => {
    // Account-wide earliestPostYear (2015) is far earlier than this work's
    // own real publish date (Nov 2025) - the reported bug. >2 of the
    // work's own points clear the union-points gate so the slider mounts
    // enabled from the first render.
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2025-11-01",
        points: [
          {
            capturedOn: "2025-12-01",
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
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: 2015 });

    expect(startThumb()).toHaveAttribute("aria-valuemin", String(mi(2025, 11)));
  });

  it("recomputes the floor when the selection changes - widening to an earlier-published work, then narrowing back", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2025-11-01",
        points: [
          {
            capturedOn: "2025-12-01",
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
        publishedOn: "2018-01-01",
        points: [
          {
            capturedOn: "2026-02-01",
            hits: 4,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });
    expect(startThumb()).toHaveAttribute("aria-valuemin", String(mi(2025, 11)));

    await selectWorkViaCombobox(user, "Work Two");
    expect(startThumb()).toHaveAttribute("aria-valuemin", String(mi(2018, 1)));

    await selectWorkViaCombobox(user, "Work Two");
    expect(startThumb()).toHaveAttribute("aria-valuemin", String(mi(2025, 11)));
  });

  it("falls back to the earliest-union-year floor only when no selected work can form any zero-basis at all", () => {
    // No publishedOn anywhere and no account-wide earliestPostYear - the
    // pre-existing fallback (earliest real UNION year) still applies.
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        points: [
          {
            capturedOn: "2020-01-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2021-01-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2022-01-01",
            hits: 3,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });

    expect(startThumb()).toHaveAttribute("aria-valuemin", String(mi(2020, 1)));
  });
});

describe("DateRangeSlider domain ceiling reflects the latest real captured date across the selection, not 'now'", () => {
  it("caps the end thumb's drag bound at the selected work's own latest captured date", () => {
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2024-01-01",
        points: [
          {
            capturedOn: "2024-02-01",
            hits: 1,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2024-06-01",
            hits: 2,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
          {
            capturedOn: "2025-01-01",
            hits: 3,
            kudos: 1,
            comments: 0,
            bookmarks: 0,
            subscriptions: 0,
          },
        ],
      }),
    ];

    renderSection({ perWorkSeries: works, earliestPostYear: null });

    const endThumb = screen.getByRole("slider", { name: /^range end$/i });
    expect(endThumb).toHaveAttribute("aria-valuemax", String(mi(2025, 1)));
  });
});

describe("a committed window entirely inside the empty lead-in gap is corrected (ROADMAP amendment, 2026-08-04)", () => {
  it("rejects a window chosen entirely inside the gap, falling back to the real-capture default instead of showing an all-flat-lead-in view", () => {
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

    // Entirely inside the (2010-01, 2015-01) gap - every selected work is
    // either unpublished or published-but-not-yet-captured throughout.
    useWorkComparisonStore.getState().setRange(USERNAME, { start: mi(2011, 1), end: mi(2012, 1) });
    renderSection({ perWorkSeries: works, earliestPostYear: null });

    // Rejected back to the default real-capture span, not left applying a
    // window with nothing real inside it.
    expect(screen.getByText(/^Jan 2015\s*[–-]\s*Jan 2020$/)).toBeInTheDocument();
  });

  it("keeps a committed window that straddles the gap's edge (real data still visible on one side)", () => {
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

    // Straddles the gap's end edge (2015-01) - real data is visible from
    // 2015 onward within this window, so it's a legitimate choice.
    useWorkComparisonStore.getState().setRange(USERNAME, { start: mi(2012, 1), end: mi(2016, 1) });
    renderSection({ perWorkSeries: works, earliestPostYear: null });

    expect(screen.getByText(/^Jan 2012\s*[–-]\s*Jan 2016$/)).toBeInTheDocument();
  });
});
