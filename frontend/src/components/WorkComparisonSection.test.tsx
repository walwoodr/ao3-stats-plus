import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// WorkComparisonSection is the orchestrator that REPLACES PerWorkTrends
// (Q1, resolved: replace, not coexist) and composes the Autocomplete-based
// WorkPicker + DateRangeSlider + two MultiSeriesTrendChart instances (hits,
// kudos) side-by-side in a bordered "controls island"
// (docs/plans/work-comparison-picker-redesign.md §8). `selectedWorkIds`/
// `range` now live in the persisted per-username useWorkComparisonStore
// (§2), not local useState - every render passes `username` and the store
// is reset (in-memory + localStorage) between tests, mirroring how
// useTokenStore.test.ts resets its own store. Interaction helpers below
// replace the old direct checkbox clicks with combobox-driven equivalents
// (plan T9(a)); persistence-specific reconciliation cases (§2.3) live in the
// sibling WorkComparisonSection.persistence.test.tsx, split out for the same
// per-concern-file reason WorkComparisonSection.caption.test.tsx and
// .leadIn.test.tsx already exist as separate files.
const USERNAME = "testauthor";

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], ...overrides };
}

function renderSection(props: { perWorkSeries: PerWorkSeries[]; earliestPostYear: number | null }) {
  return render(<WorkComparisonSection {...props} username={USERNAME} />);
}

function getWorksCombobox() {
  return screen.getByRole("combobox", { name: /works to compare/i });
}

// Opens the combobox only if it isn't already open - MUI's Autocomplete
// toggles the popup closed on a second click of an already-open, already-
// focused input (confirmed against a Testing-stage reference
// implementation), so unconditionally clicking it before every interaction
// would accidentally close an already-open popup instead of being a no-op.
async function ensurePickerOpen(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole("listbox")) {
    await user.click(getWorksCombobox());
  }
}

// Toggles one work on/off via the combobox - mirrors the old direct
// checkbox-click helper's toggle-either-direction behavior (clicking an
// unselected option adds it; clicking a selected one removes it, §3/T1).
async function selectWorkViaCombobox(user: ReturnType<typeof userEvent.setup>, title: string) {
  await ensurePickerOpen(user);
  await user.click(screen.getByRole("option", { name: title }));
}

async function bulkSelectFandom(user: ReturnType<typeof userEvent.setup>, fandomFragment: string) {
  await ensurePickerOpen(user);
  await user.click(
    screen.getByRole("button", {
      name: new RegExp(`(select|deselect) all.*${fandomFragment}`, "i"),
    }),
  );
}

function isSelected(title: string): boolean {
  return screen.queryByLabelText(`Remove ${title}`) !== null;
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkComparisonStore.setState({ byUsername: {} });
});

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
  it("defaults to exactly one selected work (the first) on mount, matching today's default", () => {
    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    expect(isSelected("Work One")).toBe(true);
    expect(isSelected("Work Two")).toBe(false);
  });

  it("renders both the hits and kudos comparison charts together", () => {
    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    expect(screen.getByRole("img", { name: /^hits$/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^kudos$/i })).toBeInTheDocument();
  });

  it("shows only the default work's data in both charts' legends", () => {
    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
    expect(within(hitsFigure).getAllByText(/work one/i).length).toBeGreaterThan(0);
    expect(within(hitsFigure).queryByText(/work two/i)).not.toBeInTheDocument();
  });

  describe("the controls island layout (§8)", () => {
    // Testing-stage hook for the island's DOM structure: a
    // `data-testid="controls-island"` wrapper is the minimal structural
    // marker this suite needs to prove the picker and slider are rendered
    // as siblings inside one shared bordered container, rather than
    // asserting on exact Tailwind class strings (brittle) or a visual
    // snapshot. Implementation may name it differently but should keep an
    // equivalent hook - ask before dropping the ability to verify this
    // structurally.
    it("renders the works combobox and the date-range slider inside one shared island container", async () => {
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

      renderSection({ perWorkSeries: worksWithThreeUnionPoints, earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Two");

      const island = screen.getByTestId("controls-island");
      expect(
        within(island).getByRole("combobox", { name: /works to compare/i }),
      ).toBeInTheDocument();
      expect(within(island).getAllByRole("slider").length).toBeGreaterThan(0);
    });

    it("lets the picker fill the row when the slider self-gates to null (≤2 union points)", () => {
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

      const island = screen.getByTestId("controls-island");
      expect(
        within(island).getByRole("combobox", { name: /works to compare/i }),
      ).toBeInTheDocument();
      expect(within(island).queryAllByRole("slider")).toHaveLength(0);
    });
  });

  describe("0 works selected", () => {
    it("shows the empty-selection message in place of chart content once the only work is deselected", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

      await selectWorkViaCombobox(user, "Work One");

      expect(screen.getAllByText(/select at least one work to compare/i).length).toBeGreaterThan(0);
    });

    it("hides the date-range slider with nothing selected", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

      await selectWorkViaCombobox(user, "Work One");

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

    it("caps additions at 10 works via select-all-in-fandom and aria-disables the 11th option", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: ELEVEN_WORKS, earliestPostYear: null });

      await bulkSelectFandom(user, "big fandom");

      const checkedCount = ELEVEN_WORKS.filter((w) => isSelected(w.title)).length;
      expect(checkedCount).toBe(10);
      expect(screen.getByRole("status")).toHaveTextContent(/maximum of 10 works reached/i);
      expect(screen.getByRole("option", { name: "Work 11" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("renders all 10 selected works' legend entries across the comparison charts", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: ELEVEN_WORKS, earliestPostYear: null });

      await bulkSelectFandom(user, "big fandom");

      const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
      const checkedTitles = ELEVEN_WORKS.filter((w) => isSelected(w.title)).map((w) => w.title);

      expect(checkedTitles).toHaveLength(10);
      checkedTitles.forEach((title) => {
        expect(within(hitsFigure).getAllByText(new RegExp(title, "i")).length).toBeGreaterThan(0);
      });
    });
  });

  describe("date-range slider gating tied to the union-points >2 gate", () => {
    it("does not render the slider for the default 1-selected state with only 2 union points", () => {
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

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

      renderSection({ perWorkSeries: worksWithThreeUnionPoints, earliestPostYear: null });

      await selectWorkViaCombobox(user, "Work Two");

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

      renderSection({ perWorkSeries: worksWithThreeUnionPoints, earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Two");
      expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);

      await selectWorkViaCombobox(user, "Work Two");

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

      renderSection({ perWorkSeries: worksAcrossYears, earliestPostYear: null });
      await selectWorkViaCombobox(user, "Work Two");

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

    it("renders all 10 works selected and in both the hits and kudos charts", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: TEN_WORKS, earliestPostYear: null });

      await bulkSelectFandom(user, "fandom a");

      TEN_WORKS.forEach((w) => {
        expect(isSelected(w.title)).toBe(true);
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

    it("does not aria-disable any option with exactly 10 works available and all 10 selected", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: TEN_WORKS, earliestPostYear: null });

      await bulkSelectFandom(user, "fandom a");

      TEN_WORKS.forEach((w) => {
        expect(screen.getByRole("option", { name: w.title })).not.toHaveAttribute(
          "aria-disabled",
          "true",
        );
      });
    });
  });

  it("is not rendered at all when perWorkSeries is empty (existing guard stays the caller's responsibility)", () => {
    renderSection({ perWorkSeries: [], earliestPostYear: null });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
