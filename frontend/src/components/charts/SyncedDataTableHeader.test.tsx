import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { SyncedDataTableHeader, DateAxisRowCells } from "./SyncedDataTableHeader";
import { buildDateHierarchy } from "../../lib/dateHierarchy";
import type { DateAxisEntry, SeriesAxisEntry } from "../../lib/tableOrientation";

// Testing tasks T3/T4 (docs/plans/date-hierarchy-grouping.md §10, §4):
// SyncedDataTableHeader.tsx does not exist yet - every test below fails at
// the import, a genuine red for this whole file (and transitively for
// dateHierarchy.ts too, since this file's own fixtures build a real
// hierarchy via buildDateHierarchy to drive DateAxisRowCells - both new
// modules are exercised together here the same way SyncedDataTable.tsx
// will exercise them at Implementation time).
//
// The exact component/props split below (a `SyncedDataTableHeader`
// <thead>-only component for BOTH orientations' top header row(s), plus a
// separate `DateAxisRowCells` component that renders one date-row's
// leading Year?/Month?/Day <th> trio for datesAsRows' tbody) is this
// Testing stage's own concrete translation of §4's DOM-shape prose - the
// plan does not pin an exact props contract for this new file the way §3
// pins dateHierarchy's. Implementation must match this split or flag back
// if a different internal decomposition is genuinely required to stay
// within the file's <250-line budget.
function noop() {}

// Mirrors the plan's own happy-path hard case (§1/§3): 2014 lead-in (single
// date, single month, single year - the "corrected flaw" regression fence)
// plus a Jul/Aug 2026 cluster, incl. a single-point month (Aug).
const DATE_AXIS: DateAxisEntry[] = [
  { dateKey: "2014-09-06", label: "Before 2014 (estimated baseline)", isLeadIn: true },
  { dateKey: "2026-07-01", label: "2026-07-01", isLeadIn: false },
  { dateKey: "2026-07-15", label: "2026-07-15", isLeadIn: false },
  { dateKey: "2026-08-10", label: "2026-08-10", isLeadIn: false },
];

const SINGLE_SERIES: SeriesAxisEntry[] = [{ seriesKey: "value", title: "Hits" }];

const MULTI_SERIES: SeriesAxisEntry[] = [
  {
    seriesKey: "work-1",
    title: "Work A",
    identityDescription: "slate-blue circle marker",
    colorHex: "#727F8C",
    shape: "circle",
  },
  {
    seriesKey: "work-2",
    title: "Work B",
    identityDescription: "teal square marker",
    colorHex: "#4F7074",
    shape: "square",
  },
];

function renderHeader(props: {
  dateAxis: DateAxisEntry[];
  seriesAxis: SeriesAxisEntry[];
  orientation: "datesAsColumns" | "datesAsRows";
  activeDateKey?: string | null;
  pinnedDateKey?: string | null;
}) {
  return render(
    <table>
      <SyncedDataTableHeader
        rowHeaderLabel="Metric"
        dateAxis={props.dateAxis}
        seriesAxis={props.seriesAxis}
        orientation={props.orientation}
        activeDateKey={props.activeDateKey ?? null}
        pinnedDateKey={props.pinnedDateKey ?? null}
        notifyActiveDateKeyChange={noop}
        togglePin={noop}
      />
    </table>,
  );
}

describe("SyncedDataTableHeader: datesAsColumns - three-tier thead (T3)", () => {
  it("renders exactly three <tr> inside <thead>", () => {
    const { container } = renderHeader({
      dateAxis: DATE_AXIS,
      seriesAxis: SINGLE_SERIES,
      orientation: "datesAsColumns",
    });

    const thead = container.querySelector("thead");
    expect(thead).not.toBeNull();
    expect(thead?.querySelectorAll("tr")).toHaveLength(3);
  });

  it("gives the year row th[scope=colgroup] cells with colSpan equal to their distinct month-group count", () => {
    const { container } = renderHeader({
      dateAxis: DATE_AXIS,
      seriesAxis: SINGLE_SERIES,
      orientation: "datesAsColumns",
    });

    const yearCells = Array.from(container.querySelectorAll('th[scope="colgroup"]')).filter(
      (el) => el.textContent === "2014" || el.textContent === "2026",
    );
    expect(yearCells.map((el) => el.textContent)).toEqual(["2014", "2026"]);
    expect(yearCells[0]).toHaveAttribute("colSpan", "1"); // 2014 -> 1 month (Sep).
    expect(yearCells[1]).toHaveAttribute("colSpan", "2"); // 2026 -> 2 months (Jul, Aug).
  });

  it("gives the month row th[scope=colgroup] cells with colSpan equal to their day count", () => {
    const { container } = renderHeader({
      dateAxis: DATE_AXIS,
      seriesAxis: SINGLE_SERIES,
      orientation: "datesAsColumns",
    });

    const monthCells = Array.from(container.querySelectorAll('th[scope="colgroup"]')).filter((el) =>
      ["Sep", "Jul", "Aug"].includes(el.textContent ?? ""),
    );
    expect(monthCells.map((el) => el.textContent)).toEqual(["Sep", "Jul", "Aug"]);
    expect(monthCells[0]).toHaveAttribute("colSpan", "1"); // Sep -> 1 day (lead-in).
    expect(monthCells[1]).toHaveAttribute("colSpan", "2"); // Jul -> 2 days.
    expect(monthCells[2]).toHaveAttribute("colSpan", "1"); // Aug -> 1 day.
  });

  it("renders the day tier as DateHeaderCell columnheaders (scope=col) showing day-of-month, with the full label as accessible name", () => {
    const { container } = renderHeader({
      dateAxis: DATE_AXIS,
      seriesAxis: SINGLE_SERIES,
      orientation: "datesAsColumns",
    });

    const dayCells = container.querySelectorAll('th[scope="col"][data-date-key]');
    expect(dayCells).toHaveLength(4);
    expect(Array.from(dayCells).map((el) => el.textContent)).toEqual(["06", "01", "15", "10"]);
    expect(dayCells[0]).toHaveAttribute("aria-label", "Before 2014 (estimated baseline)");
    expect(dayCells[1]).toHaveAttribute("aria-label", "2026-07-01");
  });

  it("gives the corner cell rowSpan=3 and scope=col, carrying the sr-only rowHeaderLabel", () => {
    const { container } = renderHeader({
      dateAxis: DATE_AXIS,
      seriesAxis: SINGLE_SERIES,
      orientation: "datesAsColumns",
    });

    const corner = container.querySelector('th[scope="col"]:not([data-date-key])');
    expect(corner).not.toBeNull();
    expect(corner).toHaveAttribute("rowSpan", "3");
    expect(corner?.textContent).toBe("Metric");
  });

  it("regression fence: a single-date year (the corrected flaw) still decomposes into all three tiers (2014 / Sep / 06)", () => {
    const { container } = renderHeader({
      dateAxis: [DATE_AXIS[0]],
      seriesAxis: SINGLE_SERIES,
      orientation: "datesAsColumns",
    });

    const thead = container.querySelector("thead");
    expect(thead?.querySelectorAll("tr")).toHaveLength(3);
    const yearCell = Array.from(container.querySelectorAll('th[scope="colgroup"]')).find(
      (el) => el.textContent === "2014",
    );
    const monthCell = Array.from(container.querySelectorAll('th[scope="colgroup"]')).find(
      (el) => el.textContent === "Sep",
    );
    expect(yearCell).toHaveAttribute("colSpan", "1");
    expect(monthCell).toHaveAttribute("colSpan", "1");
    const dayCell = container.querySelector('th[scope="col"][data-date-key]');
    expect(dayCell?.textContent).toBe("06");
  });

  it("calls togglePin with the day's dateKey when its pin button is clicked (sync/pin still keyed off the day tier, §6)", () => {
    const togglePin = vi.fn();
    const { container } = render(
      <table>
        <SyncedDataTableHeader
          rowHeaderLabel="Metric"
          dateAxis={DATE_AXIS}
          seriesAxis={SINGLE_SERIES}
          orientation="datesAsColumns"
          activeDateKey={null}
          pinnedDateKey={null}
          onPinnedDateKeyChange={noop}
          notifyActiveDateKeyChange={noop}
          togglePin={togglePin}
        />
      </table>,
    );

    const button = within(
      container.querySelector('th[data-date-key="2026-07-01"]') as HTMLElement,
    ).getByRole("button");
    button.click();

    expect(togglePin).toHaveBeenCalledWith("2026-07-01");
  });
});

describe("SyncedDataTableHeader: datesAsRows - single thead row, series as columnheaders (T4)", () => {
  it("renders exactly one <tr> inside <thead>, with the corner (colSpan=3) plus one columnheader per series", () => {
    const { container } = renderHeader({
      dateAxis: DATE_AXIS,
      seriesAxis: MULTI_SERIES,
      orientation: "datesAsRows",
    });

    const thead = container.querySelector("thead");
    expect(thead?.querySelectorAll("tr")).toHaveLength(1);

    const corner = container.querySelector('th[scope="col"]:not([data-date-key])');
    expect(corner).toHaveAttribute("colSpan", "3");

    const seriesHeaders = Array.from(container.querySelectorAll("th")).filter(
      (el) => el.textContent?.includes("Work A") || el.textContent?.includes("Work B"),
    );
    expect(seriesHeaders).toHaveLength(2);
  });

  it("still carries each series' identity description in its column header after the header rewrite", () => {
    const { container } = renderHeader({
      dateAxis: DATE_AXIS,
      seriesAxis: MULTI_SERIES,
      orientation: "datesAsRows",
    });

    const headerText = Array.from(container.querySelectorAll("th"))
      .map((el) => el.textContent ?? "")
      .join(" | ");
    expect(headerText).toContain("slate-blue circle marker");
    expect(headerText).toContain("teal square marker");
  });
});

describe("DateAxisRowCells: datesAsRows leading date-tier cells per tbody row (T4)", () => {
  function renderRow(rowIndex: number, dateAxis: DateAxisEntry[] = DATE_AXIS) {
    const hierarchy = buildDateHierarchy(dateAxis);
    return render(
      <table>
        <tbody>
          <tr>
            <DateAxisRowCells
              hierarchy={hierarchy}
              rowIndex={rowIndex}
              activeDateKey={null}
              pinnedDateKey={null}
              notifyActiveDateKeyChange={noop}
              togglePin={noop}
            />
          </tr>
        </tbody>
      </table>,
    );
  }

  it("row 0 (2014-09-06, first row overall) emits Year+Month+Day, all three th cells", () => {
    const { container } = renderRow(0);
    const cells = container.querySelectorAll("tr th");
    // Year(rowgroup) + Month(rowgroup) + Day(row) - first row of every tier.
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveAttribute("scope", "rowgroup");
    expect(cells[0].textContent).toBe("2014");
    expect(cells[1]).toHaveAttribute("scope", "rowgroup");
    expect(cells[1].textContent).toBe("Sep");
    expect(cells[2]).toHaveAttribute("scope", "row");
    expect(cells[2].textContent).toBe("06");
  });

  it("row 1 (2026-07-01, first row of a NEW year+month group) also emits all three th cells", () => {
    const { container } = renderRow(1);
    const cells = container.querySelectorAll("tr th");
    expect(cells).toHaveLength(3);
    expect(cells[0].textContent).toBe("2026");
    expect(cells[1].textContent).toBe("Jul");
    expect(cells[2].textContent).toBe("01");
  });

  it("row 2 (2026-07-15, still within Jul 2026) omits the Year/Month cells - only the Day cell renders", () => {
    const { container } = renderRow(2);
    const cells = container.querySelectorAll("tr th");
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveAttribute("scope", "row");
    expect(cells[0].textContent).toBe("15");
  });

  it("row 3 (2026-08-10, a NEW month but the SAME year) emits only Month+Day - Year is omitted (still within 2026)", () => {
    const { container } = renderRow(3);
    const cells = container.querySelectorAll("tr th");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveAttribute("scope", "rowgroup");
    expect(cells[0].textContent).toBe("Aug");
    expect(cells[1]).toHaveAttribute("scope", "row");
    expect(cells[1].textContent).toBe("10");
  });

  it("gives the Year cell rowSpan equal to the total day-count under that year (not just its first month)", () => {
    const { container } = renderRow(0);
    const yearCell = container.querySelector('th[scope="rowgroup"]');
    // 2014 has exactly 1 day under it.
    expect(yearCell).toHaveAttribute("rowSpan", "1");
  });

  it("gives the 2026 Year cell (row 1) a rowSpan of 3 (Jul's 2 days + Aug's 1 day)", () => {
    const { container } = renderRow(1);
    const yearCell = Array.from(container.querySelectorAll('th[scope="rowgroup"]')).find(
      (el) => el.textContent === "2026",
    );
    expect(yearCell).toHaveAttribute("rowSpan", "3");
  });

  it("regression fence: a single-date year (2014 alone) still emits all three tiers with rowSpan=1 each", () => {
    const { container } = renderRow(0, [DATE_AXIS[0]]);
    const cells = container.querySelectorAll("tr th");
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveAttribute("rowSpan", "1");
    expect(cells[1]).toHaveAttribute("rowSpan", "1");
  });

  it("the Day cell keeps the full accessible name via aria-label while showing day-of-month text (§6 belt-and-suspenders)", () => {
    const { container } = renderRow(0);
    const dayCell = container.querySelector('th[scope="row"]');
    expect(dayCell?.textContent).toBe("06");
    expect(dayCell).toHaveAttribute("aria-label", "Before 2014 (estimated baseline)");
  });

  it("calls togglePin with the day's dateKey when its pin button is clicked in datesAsRows mode too", () => {
    const togglePin = vi.fn();
    const hierarchy = buildDateHierarchy(DATE_AXIS);
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <DateAxisRowCells
              hierarchy={hierarchy}
              rowIndex={1}
              activeDateKey={null}
              pinnedDateKey={null}
              onPinnedDateKeyChange={noop}
              notifyActiveDateKeyChange={noop}
              togglePin={togglePin}
            />
          </tr>
        </tbody>
      </table>,
    );

    const dayCell = container.querySelector('th[scope="row"]') as HTMLElement;
    within(dayCell).getByRole("button").click();

    expect(togglePin).toHaveBeenCalledWith("2026-07-01");
  });
});
