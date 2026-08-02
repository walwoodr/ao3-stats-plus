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

    const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
    expect(within(hitsFigure).getByText(/work one/i)).toBeInTheDocument();
    expect(within(hitsFigure).queryByText(/work two/i)).not.toBeInTheDocument();
  });

  describe("0 works selected", () => {
    it("shows the empty-selection message in place of chart content once the only work is unchecked", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={TWO_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("checkbox", { name: "Work One" }));

      expect(screen.getAllByText(/select at least one work to compare/i).length).toBeGreaterThan(
        0,
      );
    });

    it("hides the date-range slider with nothing selected", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={TWO_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("checkbox", { name: "Work One" }));

      expect(screen.queryAllByRole("slider")).toHaveLength(0);
    });
  });

  describe("6 works selected (at the cap)", () => {
    const SEVEN_WORKS: PerWorkSeries[] = Array.from({ length: 7 }, (_, i) =>
      work({
        ao3WorkId: i + 1,
        title: `Work ${i + 1}`,
        fandoms: "Big Fandom",
        points: [{ capturedOn: "2026-01-01", hits: i, kudos: i }],
      }),
    );

    it("caps additions at 6 works via select-all-in-fandom and disables the 7th checkbox", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={SEVEN_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("button", { name: /select all.*big fandom/i }));

      const checkedCount = SEVEN_WORKS.filter((w) =>
        screen.getByRole("checkbox", { name: w.title }).matches(":checked"),
      ).length;
      expect(checkedCount).toBe(6);
      expect(screen.getByRole("status")).toHaveTextContent(/maximum of 6 works reached/i);
    });

    it("renders all 6 selected works' legend entries across the comparison charts", async () => {
      const user = userEvent.setup();
      render(<WorkComparisonSection perWorkSeries={SEVEN_WORKS} earliestPostYear={null} />);

      await user.click(screen.getByRole("button", { name: /select all.*big fandom/i }));

      const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
      const checkedTitles = SEVEN_WORKS.filter((w) =>
        screen.getByRole("checkbox", { name: w.title }).matches(":checked"),
      ).map((w) => w.title);

      checkedTitles.forEach((title) => {
        expect(within(hitsFigure).getByText(new RegExp(title, "i"))).toBeInTheDocument();
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

  it("is not rendered at all when perWorkSeries is empty (existing guard stays the caller's responsibility)", () => {
    render(<WorkComparisonSection perWorkSeries={[]} earliestPostYear={null} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
