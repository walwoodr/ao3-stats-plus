import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SyncedDataTable } from "./SyncedDataTable";
import type { SyncedTableModel } from "../../lib/syncedTableModel";

// Testing task 5 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.3, §3 item 3, C3a/C3b, §8): SyncedDataTable.tsx must grow
// a `pinnedDateKey` + `onPinnedDateKeyChange` pair (both optional,
// backward-compatible defaults, mirroring orientation's Testing-stage
// design choice in SyncedDataTable.orientation.test.tsx), render a pin
// control on every date header (lead-in included, C3b - no column-level
// gate), and render a per-row delta chip in the ACTIVE (hovered) date's
// cells using each row's own `comparablePoints` via the per-row backward-
// walk (C3a) - never the literal `cells` array, which is what makes a
// carried-forward row's non-blank delta possible even though its own literal
// cell reads "—". None of this exists yet - every assertion below fails
// today.
//
// This file's own contract for the pin control (an inner `<button
// aria-pressed>` per header, accessible name "Compare from <label>",
// toggling on activation) and the delta chip
// (`[data-testid="delta-chip"]`, sign-prefixed text + a `title`/sr-only
// increase-decrease description) is this Testing stage's own translation of
// §8's prose into a concrete DOM contract - Implementation must match it, or
// flag back if it's wrong.
//
// Fixture: a shared date axis [2014-01-01 (lead-in), 2026-01-01, 2026-01-05,
// 2026-01-08] across three ragged-history rows, each with its OWN
// comparablePoints (the whole point of C3a's per-row walk):
//  - Work A: lead-in (0) + real points on 2026-01-01 (10) and 2026-01-08
//    (20) - NO real point on 2026-01-05 (literal cell "—" there).
//  - Work B: no lead-in, one real point on 2026-01-05 (7) only.
//  - Work C: no lead-in, one real point on 2026-01-08 (50) only - published
//    after every earlier date in this fixture.
const MODEL: SyncedTableModel = {
  columns: [
    { dateKey: "2014-01-01", label: "Before 2014 (estimated baseline)", isLeadIn: true },
    { dateKey: "2026-01-01", label: "2026-01-01", isLeadIn: false },
    { dateKey: "2026-01-05", label: "2026-01-05", isLeadIn: false },
    { dateKey: "2026-01-08", label: "2026-01-08", isLeadIn: false },
  ],
  rows: [
    {
      seriesKey: "work-a",
      title: "Work A",
      identityDescription: "slate-blue circle marker",
      colorHex: "#727F8C",
      shape: "circle",
      cells: [0, 10, "—", 20],
      comparablePoints: [
        { dateKey: "2014-01-01", value: 0 },
        { dateKey: "2026-01-01", value: 10 },
        { dateKey: "2026-01-08", value: 20 },
      ],
    },
    {
      seriesKey: "work-b",
      title: "Work B",
      identityDescription: "teal square marker",
      colorHex: "#4F7074",
      shape: "square",
      cells: ["—", "—", 7, "—"],
      comparablePoints: [{ dateKey: "2026-01-05", value: 7 }],
    },
    {
      seriesKey: "work-c",
      title: "Work C",
      identityDescription: "sage triangle marker",
      colorHex: "#74918D",
      shape: "triangle",
      cells: ["—", "—", "—", 50],
      comparablePoints: [{ dateKey: "2026-01-08", value: 50 }],
    },
  ],
  unitLabel: "Hits",
};

function noop() {}

describe("SyncedDataTable: pin control (§3 item 3, C3b - every date header is a valid pin target)", () => {
  it("renders a pin control on every date header, including the LEAD-IN column (C3b)", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        pinnedDateKey={null}
        onPinnedDateKeyChange={noop}
      />,
    );

    const leadInPinButton = screen.getByRole("button", { name: /compare from.*before 2014/i });
    expect(leadInPinButton).toBeInTheDocument();
    expect(leadInPinButton).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onPinnedDateKeyChange with the lead-in's dateKey when its pin control is activated (C3b: lead-in is a valid pin target)", () => {
    const onPinnedDateKeyChange = vi.fn();
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        pinnedDateKey={null}
        onPinnedDateKeyChange={onPinnedDateKeyChange}
      />,
    );

    screen.getByRole("button", { name: /compare from.*before 2014/i }).click();

    expect(onPinnedDateKeyChange).toHaveBeenCalledWith("2014-01-01");
  });

  it("marks the currently pinned header's control aria-pressed=true, and gives it an sr-only 'pinned comparison point' badge", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        pinnedDateKey="2026-01-01"
        onPinnedDateKeyChange={noop}
      />,
    );

    const pinnedHeader = screen.getByRole("columnheader", { name: /2026-01-01/ });
    expect(within(pinnedHeader).getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(pinnedHeader.textContent).toMatch(/pinned comparison point/i);
  });

  it("calls onPinnedDateKeyChange(null) when the already-pinned header's control is activated again (Clear via re-click)", () => {
    const onPinnedDateKeyChange = vi.fn();
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        pinnedDateKey="2026-01-01"
        onPinnedDateKeyChange={onPinnedDateKeyChange}
      />,
    );

    screen.getByRole("button", { name: /compare from.*2026-01-01/i }).click();

    expect(onPinnedDateKeyChange).toHaveBeenCalledWith(null);
  });

  it("renders no pin controls at all when onPinnedDateKeyChange is omitted (backward compatible)", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
      />,
    );

    expect(screen.queryByRole("button", { name: /compare from/i })).not.toBeInTheDocument();
  });
});

describe("SyncedDataTable: per-row delta chips via the backward-walk (C3a - the key corrected corner case)", () => {
  // (a) covered above (lead-in is a valid pin target). This block covers
  // (b)-(e) from the plan's task list item 5.

  it("(b) shows a carried-forward delta for a row with no literal value at the hovered date, using its most-recent prior point", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey="2026-01-05"
        onActiveDateKeyChange={noop}
        pinnedDateKey="2014-01-01"
        onPinnedDateKeyChange={noop}
      />,
    );

    // Work A's literal cell at 2026-01-05 is "—", but its comparablePoints
    // carry it forward from 2026-01-01 (10) - vs the lead-in's 0 basis, the
    // delta is +10, not blank.
    const workARow = screen.getByRole("row", { name: /work a/i });
    const deltaChip = within(workARow).getByTestId("delta-chip");
    expect(deltaChip.textContent).toBe("+10");
  });

  it("(b) the carried-forward chip carries an sr-only clarifier naming the fallback date it's 'as of'", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey="2026-01-05"
        onActiveDateKeyChange={noop}
        pinnedDateKey="2014-01-01"
        onPinnedDateKeyChange={noop}
      />,
    );

    const workARow = screen.getByRole("row", { name: /work a/i });
    expect(workARow.textContent).toMatch(/as of 2026-01-01/i);
  });

  it("(c) renders an empty cell (no delta chip) with sr-only 'no data ... as of <date>' wording for a row published AFTER the hovered date", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey="2026-01-05"
        onActiveDateKeyChange={noop}
        pinnedDateKey="2014-01-01"
        onPinnedDateKeyChange={noop}
      />,
    );

    // Work C's earliest point is 2026-01-08, after the hovered 2026-01-05 -
    // it has no data as of that date at all.
    const workCRow = screen.getByRole("row", { name: /work c/i });
    expect(within(workCRow).queryByTestId("delta-chip")).not.toBeInTheDocument();
    expect(workCRow.textContent).toMatch(/no data.*as of 2026-01-05/i);
  });

  it("(e) shows an exact 0, flat/neutral delta when hovering the pinned date itself", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey="2026-01-01"
        onActiveDateKeyChange={noop}
        pinnedDateKey="2026-01-01"
        onPinnedDateKeyChange={noop}
      />,
    );

    const workARow = screen.getByRole("row", { name: /work a/i });
    const deltaChip = within(workARow).getByTestId("delta-chip");
    expect(deltaChip.textContent).toBe("0");
  });

  it("colors an increase distinctly from a decrease (non-color sign is always present too)", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey="2026-01-08"
        onActiveDateKeyChange={noop}
        pinnedDateKey="2026-01-01"
        onPinnedDateKeyChange={noop}
      />,
    );

    // Work A: 10 (pinned) -> 20 (hovered), +10, an increase.
    const workARow = screen.getByRole("row", { name: /work a/i });
    const increaseChip = within(workARow).getByTestId("delta-chip");
    expect(increaseChip.textContent).toBe("+10");
    expect(increaseChip.className).not.toBe("");
  });

  it("renders no delta chips anywhere when nothing is pinned, even while hovering", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey="2026-01-08"
        onActiveDateKeyChange={noop}
        pinnedDateKey={null}
        onPinnedDateKeyChange={noop}
      />,
    );

    expect(screen.queryAllByTestId("delta-chip")).toHaveLength(0);
  });

  it("renders no delta chips anywhere when pinned but nothing is being hovered", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey={null}
        onActiveDateKeyChange={noop}
        pinnedDateKey="2026-01-01"
        onPinnedDateKeyChange={noop}
      />,
    );

    expect(screen.queryAllByTestId("delta-chip")).toHaveLength(0);
  });
});

describe("SyncedDataTable: delta chips render correctly under BOTH orientations (d)", () => {
  it("shows the same carried-forward delta for Work A in the flipped (datesAsRows) orientation", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey="2026-01-05"
        onActiveDateKeyChange={noop}
        pinnedDateKey="2014-01-01"
        onPinnedDateKeyChange={noop}
        orientation="datesAsRows"
        onOrientationChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    const activeDateRow = within(table).getByRole("row", { name: /2026-01-05/ });
    const deltaChip = within(activeDateRow).getByTestId("delta-chip");
    expect(deltaChip.textContent).toBe("+10");
  });

  it("shows the same 'no data' empty cell for Work C in the flipped (datesAsRows) orientation", () => {
    render(
      <SyncedDataTable
        title="Hits"
        rowHeaderLabel="Work"
        model={MODEL}
        activeDateKey="2026-01-05"
        onActiveDateKeyChange={noop}
        pinnedDateKey="2014-01-01"
        onPinnedDateKeyChange={noop}
        orientation="datesAsRows"
        onOrientationChange={noop}
      />,
    );

    const table = screen.getByRole("table", { name: /hits/i });
    const activeDateRow = within(table).getByRole("row", { name: /2026-01-05/ });
    expect(activeDateRow.textContent).toMatch(/no data.*as of 2026-01-05/i);
  });
});
