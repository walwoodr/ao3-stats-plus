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
//
// docs/plans/work-comparison-picker-refinements.md §3 changes two things
// tested here: (1) the fandom-header bulk-select control is now a real
// `role="option"` inside the popup listbox, not a `role="button"` bar
// sibling (requirement 1) - `bulkSelectFandom` below clicks the option; (2)
// DateRangeSlider is now ALWAYS mounted (never unmounted/absent) - it's
// disabled instead, so assertions that used to check for zero `role="slider"`
// elements now check for two DISABLED ones instead.
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
  await user.click(screen.getByRole("option", { name: new RegExp(fandomFragment, "i") }));
}

function getGridRow(): HTMLElement {
  return screen.getByTestId("controls-island").firstElementChild as HTMLElement;
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

  // docs/plans/additional-metric-trend-charts.md §3.0 (Option B, the metric
  // toggle): only ONE metric's chart renders at a time now, not Hits+Kudos
  // together - switching the [Hits | Kudos | ...] tablist swaps which chart
  // shows. Full toggle/non-sparse-metric coverage lives in
  // WorkComparisonSection.metrics.test.tsx; this file keeps just the
  // Hits-by-default smoke assertion plus the toggle-swap it replaces.
  it("renders the Hits chart by default; switching to the Kudos tab shows Kudos instead", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    expect(screen.getByRole("img", { name: /^hits$/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^kudos$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Kudos" }));

    expect(screen.getByRole("img", { name: /^kudos$/i })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^hits$/i })).not.toBeInTheDocument();
  });

  it("shows only the default work's data in both charts' legends", () => {
    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
    expect(within(hitsFigure).getAllByText(/work one/i).length).toBeGreaterThan(0);
    expect(within(hitsFigure).queryByText(/work two/i)).not.toBeInTheDocument();
  });

  describe("the controls island layout (§8, refined by refinements-plan §3)", () => {
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

    // Requirement 3 (§3.2): the slider is now ALWAYS mounted - it merely
    // becomes disabled below the >2 union-points threshold, rather than
    // being omitted from the tree entirely.
    it("keeps the slider mounted (but disabled) inside the island when the default selection has ≤2 union points", () => {
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

      const island = screen.getByTestId("controls-island");
      expect(
        within(island).getByRole("combobox", { name: /works to compare/i }),
      ).toBeInTheDocument();
      const sliders = within(island).getAllByRole("slider");
      expect(sliders).toHaveLength(2);
      sliders.forEach((slider) => expect(slider).toBeDisabled());
    });

    // Requirement 3 (§3.1): a deterministic two-column CSS grid
    // (`md:grid-cols-[minmax(0,1fr)_18rem]`) is the confirmed fixed-width
    // mechanism (plan sign-off #3) - `minmax(0,1fr)` on the picker track is
    // what stops accumulating chips from ever widening the column.
    it("lays the island out as a fixed-width two-column grid (picker minmax(0,1fr), slider fixed 18rem)", () => {
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

      const gridRow = getGridRow();
      expect(gridRow.className).toContain("md:grid");
      expect(gridRow.className).toContain("md:grid-cols-[minmax(0,1fr)_18rem]");
    });

    it("keeps the grid layout's className identical as the selection grows (chips accumulating never changes the column widths)", async () => {
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
      const classNameBeforeSelecting = getGridRow().className;

      await selectWorkViaCombobox(user, "Work Two");

      expect(getGridRow().className).toBe(classNameBeforeSelecting);
    });
  });

  describe("0 works selected", () => {
    it("shows the empty-selection message in place of chart content once the only work is deselected", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

      await selectWorkViaCombobox(user, "Work One");

      expect(screen.getAllByText(/select at least one work to compare/i).length).toBeGreaterThan(0);
    });

    it("still renders the (disabled) date-range slider with nothing selected, rather than omitting it", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

      await selectWorkViaCombobox(user, "Work One");

      const sliders = screen.getAllByRole("slider");
      expect(sliders).toHaveLength(2);
      sliders.forEach((slider) => expect(slider).toBeDisabled());
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

  // Requirement 3 (§3.2): the >2 union-points gate now controls DateRange-
  // Slider's `disabled` prop, not whether it mounts at all - the slider is
  // always in the DOM (see "the controls island layout" describe above for
  // the always-mounted assertions); this block covers the enabled/disabled
  // TRANSITION as the selection changes, and that the gate-drop range reset
  // is unchanged.
  describe("date-range slider DISABLED state tied to the union-points >2 gate", () => {
    it("is disabled for the default 1-selected state with only 2 union points", () => {
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

      const sliders = screen.getAllByRole("slider");
      expect(sliders).toHaveLength(2);
      sliders.forEach((slider) => expect(slider).toBeDisabled());
    });

    it("becomes enabled once the selection's union points exceed 2", async () => {
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

      screen.getAllByRole("slider").forEach((slider) => expect(slider).not.toBeDisabled());
    });

    it("disables the slider again (resetting the window) once the selection drops back to <= 2 union points", async () => {
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
      screen.getAllByRole("slider").forEach((slider) => expect(slider).not.toBeDisabled());

      await selectWorkViaCombobox(user, "Work Two");

      const sliders = screen.getAllByRole("slider");
      expect(sliders).toHaveLength(2);
      sliders.forEach((slider) => expect(slider).toBeDisabled());
      expect(useWorkComparisonStore.getState().getRange(USERNAME)).toBeNull();
    });

    it("shows the full earliestPostYear-to-current-year domain on the disabled slider's readout", () => {
      const currentYear = new Date().getFullYear();
      renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: 2015 });

      expect(screen.getByText(new RegExp(`2015\\s*[–-]\\s*${currentYear}`))).toBeInTheDocument();
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
  // orchestrator (picker + chart), not just the cap-truncation mechanics
  // covered above. Updated for the metric toggle (§3.0): both Hits and
  // Kudos get the full legend, but one at a time - checked via a tab switch,
  // not two simultaneously-rendered figures.
  describe("10-work state renders the active chart + full legend", () => {
    const TEN_WORKS: PerWorkSeries[] = Array.from({ length: 10 }, (_, i) =>
      work({
        ao3WorkId: i + 1,
        title: `Work ${i + 1}`,
        fandoms: "Fandom A",
        points: [{ capturedOn: "2026-01-01", hits: (i + 1) * 10, kudos: i + 1 }],
      }),
    );

    it("renders all 10 works selected, with the full legend on both the Hits and Kudos tabs", async () => {
      const user = userEvent.setup();
      renderSection({ perWorkSeries: TEN_WORKS, earliestPostYear: null });

      await bulkSelectFandom(user, "fandom a");

      TEN_WORKS.forEach((w) => {
        expect(isSelected(w.title)).toBe(true);
      });

      const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
      TEN_WORKS.forEach((w) => {
        expect(within(hitsFigure).getAllByText(new RegExp(w.title, "i")).length).toBeGreaterThan(0);
      });

      await user.click(screen.getByRole("tab", { name: "Kudos" }));

      const kudosFigure = screen.getByRole("img", { name: /^kudos$/i });
      TEN_WORKS.forEach((w) => {
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
