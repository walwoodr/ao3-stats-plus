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
// MultiSeriesTrendChart's own rendering). Assertions are unchanged by the
// picker/state-store redesign (docs/plans/work-comparison-picker-redesign.md
// T9(e)) - only the selection interaction mechanism (checkbox -> combobox)
// and the now-required `username` prop / store reset are new here.
vi.mock("./charts/MultiSeriesTrendChart", () => ({
  MultiSeriesTrendChart: ({ title, series }: { title: string; series: SeriesDatum[] }) => (
    <pre data-testid={`captured-series-${title}`}>
      {JSON.stringify(series.map((s) => ({ workId: s.workId, leadIn: s.leadIn ?? null })))}
    </pre>
  ),
}));

const USERNAME = "testauthor";

interface CapturedLeadIn {
  capturedOn: string;
  label: string;
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

describe("WorkComparisonSection: per-work zero-basis leadIn derivation", () => {
  it("uses a work's own publishedOn as its leadIn, labeled 'Published <date>'", async () => {
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
    expect(leadIns[1]).toEqual({ capturedOn: "2020-06-01", label: "Published 2020-06-01" });
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
    expect(leadIns[2]).toEqual({
      capturedOn: "2019-01-01",
      label: "Before 2019 (estimated baseline)",
    });
  });

  it("gives every fallback work the identical shared fallback capturedOn/label (they collapse to one slot)", async () => {
    const user = userEvent.setup();
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

    renderSection({ perWorkSeries: works, earliestPostYear: 2018 });
    await selectWorkViaCombobox(user, "Work Two");

    const leadIns = capturedLeadIns();
    expect(leadIns[1]).toEqual({
      capturedOn: "2018-01-01",
      label: "Before 2018 (estimated baseline)",
    });
    expect(leadIns[2]).toEqual(leadIns[1]);
  });

  it("omits leadIn entirely when a work has no publishedOn and earliestPostYear itself is null", async () => {
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

    renderSection({ perWorkSeries: works, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");

    const leadIns = capturedLeadIns();
    // Work One still gets its own accurate leadIn even though the shared
    // earliestPostYear prop is null - only the *fallback* path needs it.
    expect(leadIns[1]).toEqual({ capturedOn: "2020-06-01", label: "Published 2020-06-01" });
    expect(leadIns[2]).toBeNull();
  });

  describe("guard: zeroBasisDate >= firstVisiblePoint.capturedOn", () => {
    it("suppresses the leadIn when a work's publishedOn is not strictly before its first point", async () => {
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

      renderSection({ perWorkSeries: works, earliestPostYear: 2019 });
      await selectWorkViaCombobox(user, "Work Two");

      const leadIns = capturedLeadIns();
      expect(leadIns[1]).not.toBeNull();
      expect(leadIns[2]).toBeNull();
    });
  });

  describe("guard: date-range slider window vs a work's publish year", () => {
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

    it("keeps every selected work's leadIn present at the default full-range view", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: [EARLY, LATE], earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Late");

      const leadIns = capturedLeadIns();
      expect(leadIns[1]).not.toBeNull();
      expect(leadIns[2]).not.toBeNull();
    });

    it("drops a work's leadIn once the slider's narrowed start year passes its publish year, while a later-published work's leadIn remains", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: [EARLY, LATE], earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Late");

      // Domain start is the earliest union captured date (2015, since
      // earliestPostYear is null here) - narrow it up to 2019, past Work
      // Early's 2010 publish year but not past Work Late's 2019 one.
      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      startThumb.focus();
      for (let year = 2015; year < 2019; year++) {
        await user.keyboard("{ArrowRight}");
      }
      // Anchored (not a bare /2019.../ substring match) - the mocked
      // MultiSeriesTrendChart's own debug <pre> dump (used by
      // capturedLeadIns() below) legitimately contains "2019-03-01" once
      // Work Late's real leadIn survives this narrowed window, which would
      // otherwise collide with a loose substring match on this element too.
      expect(screen.getByText(/^2019\s*[–-]\s*2026$/)).toBeInTheDocument();

      const leadIns = capturedLeadIns();
      expect(leadIns[1]).toBeNull();
      expect(leadIns[2]).not.toBeNull();
    });

    it("omits a work's leadIn once the narrowed window filters out all of its own visible points, independent of the year gate", async () => {
      const user = userEvent.setup();
      const VANISHES: PerWorkSeries = work({
        ao3WorkId: 3,
        title: "Work Vanishes",
        // Publish year (2020) alone would clear the >= start(2019) gate -
        // isolating that it's the "zero visible points" condition, not the
        // year gate, that suppresses this one.
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

      renderSection({ perWorkSeries: [EARLY, LATE, VANISHES], earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Late");
      await selectWorkViaCombobox(user, "Work Vanishes");

      const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
      startThumb.focus();
      for (let year = 2015; year < 2019; year++) {
        await user.keyboard("{ArrowRight}");
      }

      const leadIns = capturedLeadIns();
      expect(leadIns[1]).toBeNull(); // Work Early: dropped by the start-year gate
      expect(leadIns[2]).not.toBeNull(); // Work Late: the positive control - still present
      expect(leadIns[3]).toBeNull(); // Work Vanishes: zero visible points after filtering
    });
  });
});
