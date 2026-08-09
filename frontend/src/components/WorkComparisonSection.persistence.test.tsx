import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkComparisonSection } from "./WorkComparisonSection";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// Persistence reconciliation corner cases introduced by moving
// `selectedWorkIds`/`range` into the persisted useWorkComparisonStore
// (docs/plans/work-comparison-picker-redesign.md §2.3, T9(c)/(d)). Split
// into its own file for the same per-concern reason
// WorkComparisonSection.caption.test.tsx/.leadIn.test.tsx already exist
// separately from WorkComparisonSection.test.tsx (CODE_STANDARDS.md file-
// length guidance) - the base interaction/rendering suite lives there.
const USERNAME = "testauthor";

function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return { title: `Work ${overrides.ao3WorkId}`, fandoms: "", points: [], ...overrides };
}

function renderSection(props: { perWorkSeries: PerWorkSeries[]; earliestPostYear: number | null }) {
  return render(<WorkComparisonSection {...props} username={USERNAME} />);
}

function isSelected(title: string): boolean {
  return screen.queryByLabelText(`Remove ${title}`) !== null;
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

const TWO_WORKS: PerWorkSeries[] = [
  work({
    ao3WorkId: 1,
    title: "Work One",
    fandoms: "Fandom A",
    points: [{ capturedOn: "2026-01-01", hits: 10, kudos: 1 }],
  }),
  work({
    ao3WorkId: 2,
    title: "Work Two",
    fandoms: "Fandom A",
    points: [{ capturedOn: "2026-01-08", hits: 5, kudos: 1 }],
  }),
];

describe("WorkComparisonSection: store read/write wiring", () => {
  it("restores a previously-persisted selection for this username on mount, instead of the first-work default", () => {
    useWorkComparisonStore.getState().setSelection(USERNAME, [2]);

    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    expect(isSelected("Work One")).toBe(false);
    expect(isSelected("Work Two")).toBe(true);
  });

  it("writes selection changes through to the store (and localStorage) as the user interacts", async () => {
    const user = userEvent.setup();
    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    await selectWorkViaCombobox(user, "Work Two");

    expect(useWorkComparisonStore.getState().getSelection(USERNAME)).toEqual([1, 2]);
    const raw = window.localStorage.getItem("ao3-stats-plus-work-comparison-store");
    expect(JSON.parse(raw ?? "{}").state.byUsername[USERNAME].selectedWorkIds).toEqual([1, 2]);
  });

  it("writes range changes through to the store as the slider is operated", async () => {
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

    const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
    startThumb.focus();
    await user.keyboard("{ArrowRight}");

    expect(useWorkComparisonStore.getState().getRange(USERNAME)).not.toBeNull();
  });

  it("selection survives a remount (persisted, not lost on navigation away and back)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });
    await selectWorkViaCombobox(user, "Work Two");
    unmount();

    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    expect(isSelected("Work One")).toBe(true);
    expect(isSelected("Work Two")).toBe(true);
  });
});

describe("WorkComparisonSection: persistence reconciliation (§2.3)", () => {
  it("defaults to the first work on a genuine first visit (no store entry for this username)", () => {
    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    expect(isSelected("Work One")).toBe(true);
    expect(isSelected("Work Two")).toBe(false);
  });

  it("filters a restored selection down to ids present in the current perWorkSeries (dangling ids dropped)", () => {
    // ao3WorkId 999 doesn't exist in TWO_WORKS - simulates a work deleted/
    // renamed since the selection was last persisted, or a different
    // account's stale data.
    useWorkComparisonStore.getState().setSelection(USERNAME, [999, 2]);

    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    expect(isSelected("Work Two")).toBe(true);
    expect(screen.queryAllByLabelText(/^Remove /)).toHaveLength(1);
  });

  it("falls back to the first work when every restored id is dangling (filtering would otherwise empty the selection)", () => {
    useWorkComparisonStore.getState().setSelection(USERNAME, [997, 998, 999]);

    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    expect(isSelected("Work One")).toBe(true);
    expect(screen.queryAllByLabelText(/^Remove /)).toHaveLength(1);
  });

  // styleAssignment (workId -> style slot) stays view-local, rebuilt on
  // mount from the restored/reconciled selection ORDER - not perWorkSeries
  // order - so a restored [2, 1] selection must land Work Two on the
  // lowest-free-index slot 0 (slate-blue circle) and Work One on slot 1
  // (teal square), per seriesStyles.ts's SERIES_STYLE_SLOTS and
  // assignStyleSlot's lowest-free-index-on-add contract.
  it("rebuilds styleAssignment from the restored selection's own order, not perWorkSeries order", () => {
    useWorkComparisonStore.getState().setSelection(USERNAME, [2, 1]);

    renderSection({ perWorkSeries: TWO_WORKS, earliestPostYear: null });

    // Scoped to one figure - the same legend text otherwise legitimately
    // renders twice (once per chart, Hits and Kudos). The worded (shape,
    // color) description no longer renders in the visible legend (removed
    // per 2026-08-09 TECH_DEBT.md) - it's asserted here via the sr-only
    // accessible table's column headers (<th>) instead.
    const hitsFigure = screen.getByRole("img", { name: /^hits$/i });
    expect(
      within(hitsFigure).getByText(/work two.*slate-blue circle marker/i, { selector: "th" }),
    ).toBeInTheDocument();
    expect(
      within(hitsFigure).getByText(/work one.*teal square marker/i, { selector: "th" }),
    ).toBeInTheDocument();
  });

  it("re-clamps a stale restored range to the full domain rather than applying it as-is", () => {
    useWorkComparisonStore.getState().setRange(USERNAME, { start: 1900, end: 1901 });
    const worksWithThreeUnionPoints: PerWorkSeries[] = [
      work({
        ao3WorkId: 1,
        title: "Work One",
        fandoms: "Fandom A",
        points: [
          { capturedOn: "2020-01-01", hits: 1, kudos: 1 },
          { capturedOn: "2021-01-01", hits: 2, kudos: 1 },
          { capturedOn: "2022-01-01", hits: 3, kudos: 1 },
        ],
      }),
    ];

    // Work One alone already clears the >2 union-points gate (3 points),
    // so the slider mounts from the default 1-selected state - no
    // interaction needed to observe the re-clamp.
    renderSection({ perWorkSeries: worksWithThreeUnionPoints, earliestPostYear: null });

    const startThumb = screen.getByRole("slider", { name: /range start \(year\)/i });
    expect(startThumb).toHaveAttribute("aria-valuemin", "2020");
    expect(Number(startThumb.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(2020);
  });
});
