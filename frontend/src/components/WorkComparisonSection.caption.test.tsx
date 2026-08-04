import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Testing task 8 (docs/plans/per-work-zero-basis-dates.md, section 7): a
// short visible caption renders beneath the chart pair (Hits, Kudos) reading
// "Dashed segments show the period before your first captured stats for a
// work." whenever >=1 currently selected/visible work has a rendered
// lead-in, and is hidden entirely when zero lead-ins are currently
// rendered - including the "zoomed past every work's publish date" corner
// case, where the underlying data still technically has a zero-basis but
// none currently display. Renders the real component tree (unlike
// WorkComparisonSection.leadIn.test.tsx's chart-stubbing approach) since
// the caption is rendered directly by WorkComparisonSection itself, outside
// MultiSeriesTrendChart - no chart-level mock needed to observe it.
//
// The two "does not render" tests below are regression fences, not
// red-today assertions: the caption doesn't exist at all pre-implementation,
// so its absence already trivially holds. They earn their place once the
// caption lands (catching a future "always show it" regression).
const CAPTION_TEXT = /dashed segments show the period before your first captured stats for a work/i;

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "",
    points: [],
    publishedOn: null,
    ...overrides,
  };
}

describe("WorkComparisonSection: visible lead-in caption", () => {
  it("renders the caption when the default single selected work has a rendered leadIn", () => {
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
    ];

    render(<WorkComparisonSection perWorkSeries={works} earliestPostYear={null} />);

    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();
  });

  it("does not render the caption when no selected work has a leadIn (no publishedOn, no earliestPostYear)", () => {
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: null,
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
    ];

    render(<WorkComparisonSection perWorkSeries={works} earliestPostYear={null} />);

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  it("appears once at least one additionally-selected work has a leadIn, even if the first selected work doesn't", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: null,
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 2, kudos: 1 }],
      }),
    ];

    render(<WorkComparisonSection perWorkSeries={works} earliestPostYear={null} />);
    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Work Two" }));

    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();
  });

  it("hides the caption again once the only work with a leadIn is deselected", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
      work({
        ao3WorkId: 2,
        title: "Work Two",
        publishedOn: null,
        points: [{ capturedOn: "2026-01-01", hits: 2, kudos: 1 }],
      }),
    ];

    render(<WorkComparisonSection perWorkSeries={works} earliestPostYear={null} />);
    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Work One" }));

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  // Corner case (plan section 4): zooming the slider past every currently
  // selected work's publish year drops every leadIn as a display-window
  // consequence - the caption must follow suit and disappear, even though
  // the underlying data still technically has a zero-basis for each work.
  it("hides the caption once the slider window is narrowed past every selected work's publish year", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2010-01-01",
        points: [
          { capturedOn: "2015-01-01", hits: 1, kudos: 1 },
          { capturedOn: "2018-01-01", hits: 2, kudos: 1 },
          { capturedOn: "2020-01-01", hits: 3, kudos: 1 },
        ],
      }),
    ];

    render(<WorkComparisonSection perWorkSeries={works} earliestPostYear={null} />);
    expect(screen.getByText(CAPTION_TEXT)).toBeInTheDocument();

    // 3 own points already clear the >2 union-points slider gate. Domain
    // start is the earliest union captured date (2015) - narrow past the
    // work's 2010 publish year.
    const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
    startThumb.focus();
    for (let year = 2015; year < 2019; year++) {
      await user.keyboard("{ArrowRight}");
    }
    expect(screen.getByText(/2019\s*[–-]/)).toBeInTheDocument();

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });

  it("renders the caption exactly once, not once per chart (Hits + Kudos)", () => {
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
    ];

    render(<WorkComparisonSection perWorkSeries={works} earliestPostYear={null} />);

    expect(screen.getAllByText(CAPTION_TEXT)).toHaveLength(1);
  });

  it("does not render the caption at all with zero works selected", async () => {
    const user = userEvent.setup();
    const works: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        publishedOn: "2020-01-01",
        points: [{ capturedOn: "2026-01-01", hits: 1, kudos: 1 }],
      }),
    ];

    render(<WorkComparisonSection perWorkSeries={works} earliestPostYear={null} />);
    await user.click(screen.getByRole("checkbox", { name: "Work One" }));

    expect(screen.queryByText(CAPTION_TEXT)).not.toBeInTheDocument();
  });
});
