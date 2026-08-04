import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// WorkComparisonSection is the orchestrator that REPLACES PerWorkTrends
// (Q1, resolved: replace, not coexist) - it owns selectedWorkIds/range
// local state (see the plan's "State management": plain useState, no
// Zustand - this is ephemeral view-local UI state) and composes
// WorkPicker + DateRangeSlider + two MultiSeriesTrendChart instances
// (hits, kudos).
function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], ...overrides };
}

const TWO_WORKS: PerWorkSeries[] = [
  work({
    ao3WorkId: 1,
    title: "Work One",
    fandoms: "Fandom A",
    points: [
      { capturedOn: "2026-01-01", hits: 10, kudos: 1 },
      { capturedOn: "2026-01-08", hits: 20, kudos: 2 },
    ],
  }),
  work({
    ao3WorkId: 2,
    title: "Work Two",
    fandoms: "Fandom A",
    points: [{ capturedOn: "2026-01-08", hits: 5, kudos: 1 }],
  }),
];

describe("WorkComparisonSection", () => {
  it("defaults to exactly one selected work (the first) on mount, matching today's PerWorkTrends default", () => {
    render(<WorkComparisonSection perWorkSeries={TWO_WORKS} earliestPostYear={null} />);

    expect(screen.getByRole("checkbox", { name: "Work One" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Work Two" })).not.toBeChecked();
  });

  it("renders both the hits and kudos comparison charts together", () => {
    render(<WorkComparisonSection perWorkSeries={TWO_WORKS} earliestPostYear={null} />);

    expect(screen.getByRole("img", { name: /^hits$/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^kudos$/i })).toBeInTheDocument();
  });

  it("shows only the default work's data in both charts' legends", () => {
    render(<WorkComparisonSection perWorkSeries={TWO_WORKS} earliestPostYear={null} />);

    // MultiSeriesTrendChart renders a work's title in three places (visible
    // legend, sr-only per-point markers, sr-only table header) - see its own
    // test file's "renders a visible legend" case - so a loose match must
    // use getAllByText (>=1), not the singular getByText which throws on
    // multiple matches.
    const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
    expect(within(hitsFigure).getAllByText(/work one/i).length).toBeGreaterThan(0);
    expect(within(hitsFigure).queryByText(/work two/i)).not.toBeInTheDocument();
  });

  describe("0 works selected", () => {
    it("shows the empty-selection message in place of chart content once the only work is unchecked", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={TWO_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("checkbox", { name: "Work One" }));

      expect(screen.getAllByText(/select at least one work to compare/i).length).toBeGreaterThan(0);
    });

    it("hides the date-range slider with nothing selected", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={TWO_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("checkbox", { name: "Work One" }));

      expect(screen.queryAllByRole("slider")).toHaveLength(0);
    });
  });

  describe("10 works selected (at the cap)", () => {
    const ELEVEN_WORKS: PerWorkSeries[] = Array.from({ length: 11 }, (_, i) =>
      work({
        ao3WorkId: i + 1,
        title: `Work ${i + 1}`,
        fandoms: "Big Fandom",
        points: [{ capturedOn: "2026-01-01", hits: i, kudos: i }],
      }),
    );

    it("caps additions at 10 works via select-all-in-fandom and disables the 11th checkbox", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={ELEVEN_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("button", { name: /select all.*big fandom/i }));

      const checkedCount = ELEVEN_WORKS.filter((w) =>
        screen.getByRole("checkbox", { name: w.title }).matches(":checked"),
      ).length;
      expect(checkedCount).toBe(10);
      expect(screen.getByRole("status")).toHaveTextContent(/maximum of 10 works reached/i);
    });

    it("renders all 10 selected works' legend entries across the comparison charts", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={ELEVEN_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("button", { name: /select all.*big fandom/i }));

      const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
      const checkedTitles = ELEVEN_WORKS.filter((w) =>
        screen.getByRole("checkbox", { name: w.title }).matches(":checked"),
      ).map((w) => w.title);

      expect(checkedTitles).toHaveLength(10);
      checkedTitles.forEach((title) => {
        // Same multi-occurrence reality as above - a work's title legitimately
        // appears 3x per figure (legend, sr-only markers, sr-only table).
        expect(within(hitsFigure).getAllByText(new RegExp(title, "i")).length).toBeGreaterThan(0);
      });
    });
  });

  describe("date-range slider gating tied to the union-points >2 gate", () => {
    it("does not render the slider for the default 1-selected state with only 2 union points", () => {
      render(<WorkComparisonSection perWorkSeries={TWO_WORKS} earliestPostYear={null} />);

      expect(screen.queryAllByRole("slider")).toHaveLength(0);
    });

    it("renders the slider once the selection's union points exceed 2", async () => {
      const user = userEvent.setup();
      const worksWithThreeUnionPoints: PerWorkSeries[] = [
        work({
          ao3WorkId: 1,
          title: "Work One",
          fandoms: "Fandom A",
          points: [
            { capturedOn: "2020-01-01", hits: 1, kudos: 1 },
            { capturedOn: "2021-01-01", hits: 2, kudos: 1 },
          ],
        }),
        work({
          ao3WorkId: 2,
          title: "Work Two",
          fandoms: "Fandom A",
          points: [{ capturedOn: "2022-01-01", hits: 3, kudos: 1 }],
        }),
      ];

      render(
        <WorkComparisonSection perWorkSeries={worksWithThreeUnionPoints} earliestPostYear={null} />,
      );

      await user.click(screen.getByRole("checkbox", { name: "Work Two" }));

      expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
    });

    it("unmounts the slider again (resetting the window) once the selection drops back to <= 2 union points", async () => {
      const user = userEvent.setup();
      const worksWithThreeUnionPoints: PerWorkSeries[] = [
        work({
          ao3WorkId: 1,
          title: "Work One",
          fandoms: "Fandom A",
          points: [
            { capturedOn: "2020-01-01", hits: 1, kudos: 1 },
            { capturedOn: "2021-01-01", hits: 2, kudos: 1 },
          ],
        }),
        work({
          ao3WorkId: 2,
          title: "Work Two",
          fandoms: "Fandom A",
          points: [{ capturedOn: "2022-01-01", hits: 3, kudos: 1 }],
        }),
      ];

      render(
        <WorkComparisonSection perWorkSeries={worksWithThreeUnionPoints} earliestPostYear={null} />,
      );
      await user.click(screen.getByRole("checkbox", { name: "Work Two" }));
      expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);

      await user.click(screen.getByRole("checkbox", { name: "Work Two" }));

      expect(screen.queryAllByRole("slider")).toHaveLength(0);
    });
  });

  describe("dynamic-content announcement (role=status summary)", () => {
    it("announces the current selection count and year range on change", async () => {
      const user = userEvent.setup();
      const worksAcrossYears: PerWorkSeries[] = [
        work({
          ao3WorkId: 1,
          title: "Work One",
          fandoms: "Fandom A",
          points: [{ capturedOn: "2020-06-01", hits: 1, kudos: 1 }],
        }),
        work({
          ao3WorkId: 2,
          title: "Work Two",
          fandoms: "Fandom A",
          points: [{ capturedOn: "2026-06-01", hits: 2, kudos: 1 }],
        }),
      ];

      render(<WorkComparisonSection perWorkSeries={worksAcrossYears} earliestPostYear={null} />);
      await user.click(screen.getByRole("checkbox", { name: "Work Two" }));

      const statusRegions = screen.getAllByRole("status");
      const summary = statusRegions.find((el) => /comparing/i.test(el.textContent ?? ""));

      expect(summary).toBeDefined();
      expect(summary?.textContent).toMatch(/comparing 2 works/i);
      expect(summary?.textContent).toMatch(/2020/);
      expect(summary?.textContent).toMatch(/2026/);
    });
  });

  // Testing task 10 (docs/plans/usds-dataviz-color-scheme.md): the full
  // 10-work cap-raise state rendered end to end through the real
  // orchestrator (picker + both charts), not just the cap-truncation
  // mechanics covered above.
  describe("10-work state renders both charts + full legend", () => {
    const TEN_WORKS: PerWorkSeries[] = Array.from({ length: 10 }, (_, i) =>
      work({
        ao3WorkId: i + 1,
        title: `Work ${i + 1}`,
        fandoms: "Fandom A",
        points: [{ capturedOn: "2026-01-01", hits: (i + 1) * 10, kudos: i + 1 }],
      }),
    );

    it("renders all 10 works checked and in both the hits and kudos charts", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={TEN_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("button", { name: /select all.*fandom a/i }));

      TEN_WORKS.forEach((w) => {
        expect(screen.getByRole("checkbox", { name: w.title })).toBeChecked();
      });

      const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
      const kudosFigure = screen.getByRole("img", { name: /^kudos$/i });
      TEN_WORKS.forEach((w) => {
        expect(within(hitsFigure).getAllByText(new RegExp(w.title, "i")).length).toBeGreaterThan(0);
        expect(within(kudosFigure).getAllByText(new RegExp(w.title, "i")).length).toBeGreaterThan(
          0,
        );
      });
    });

    it("does not disable any checkbox with exactly 10 works available and all 10 selected (cap, not availability, gates)", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={TEN_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("button", { name: /select all.*fandom a/i }));

      TEN_WORKS.forEach((w) => {
        expect(screen.getByRole("checkbox", { name: w.title })).not.toBeDisabled();
      });
    });
  });

  it("is not rendered at all when perWorkSeries is empty (existing guard stays the caller's responsibility)", () => {
    render(<WorkComparisonSection perWorkSeries={[]} earliestPostYear={null} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  // Regression for TECH_DEBT.md (2026-08-03): `range` was only ever reset
  // to null when the selection dropped *below* the >2 union-points gate -
  // never reconciled against a live `domain` that shifts while staying
  // *above* the gate. This drives the selection through exactly that path
  // (never dipping to <= 2 union points, so the old gate-based reset never
  // fires) and asserts the newly-selected work's own points actually reach
  // the chart, rather than being silently filtered out by a stale window.
  describe("stale range window across a selection swap (regression)", () => {
    it("re-clamps the window against the live domain instead of leaving a stale narrowed range applied", async () => {
      const user = userEvent.setup();
      const worksWithDisjointRanges: PerWorkSeries[] = [
        work({
          ao3WorkId: 1,
          title: "Work Early",
          fandoms: "Fandom A",
          points: [
            { capturedOn: "2018-01-01", hits: 10, kudos: 1 },
            { capturedOn: "2018-06-01", hits: 20, kudos: 2 },
            { capturedOn: "2019-01-01", hits: 30, kudos: 3 },
          ],
        }),
        work({
          ao3WorkId: 2,
          title: "Work Late",
          fandoms: "Fandom A",
          points: [
            { capturedOn: "2023-01-01", hits: 100, kudos: 10 },
            { capturedOn: "2024-01-01", hits: 200, kudos: 20 },
            { capturedOn: "2025-01-01", hits: 300, kudos: 30 },
          ],
        }),
      ];

      render(
        <WorkComparisonSection perWorkSeries={worksWithDisjointRanges} earliestPostYear={null} />,
      );

      // "Work Early" alone already clears the >2 union-points gate (3
      // points), so the slider is mounted from the default 1-selected state.
      expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);

      // Narrow the window down to Work Early's own span - excludes Work
      // Late's 2023-2025 points entirely.
      const endThumb = screen.getByRole("slider", { name: /range end \(year\)/i });
      const initialEnd = Number(endThumb.getAttribute("aria-valuenow"));
      endThumb.focus();
      for (let year = initialEnd; year > 2019; year--) {
        await user.keyboard("{ArrowLeft}");
      }
      expect(screen.getByText(/2018\s*[–-]\s*2019/)).toBeInTheDocument();

      // Add Work Late (union points stay well above the gate throughout),
      // then drop Work Early - leaving only Work Late selected. Work Late
      // alone still clears the gate (3 points), so the slider stays mounted
      // and the selection never dips to <= 2 union points, meaning the old
      // gate-drop reset never fires even though the domain has shifted.
      await user.click(screen.getByRole("checkbox", { name: "Work Late" }));
      await user.click(screen.getByRole("checkbox", { name: "Work Early" }));

      expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);

      const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
      // Without a live re-clamp against the current domain, Work Late's
      // 2023-2025 points are all silently filtered out by the stale
      // [2018, 2019] window - this should not happen.
      expect(within(hitsFigure).queryByText(/work late.*2024-01-01/i)).toBeInTheDocument();
    });
  });
});
