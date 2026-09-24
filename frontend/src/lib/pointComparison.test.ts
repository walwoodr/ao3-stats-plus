import { describe, expect, it } from "vitest";
import {
  computeRowDelta,
  deltaLabel,
  deltaValence,
  elapsedLabel,
  rowValueAsOf,
  type RowComparablePoint,
} from "./pointComparison";

// Testing task 2 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §2.1, §3 item 3, C3a/C3b): pointComparison.ts does not exist
// yet - every test below fails at the import, a genuine red for this whole
// file.
//
// This file's exact exported shapes (RowComparablePoint, DeltaResult's
// fields) are this Testing stage's own translation of the plan's prose into
// a concrete, callable contract - the plan pins rowValueAsOf's signature
// (number | null) and computeRowDelta's inputs/outputs at the semantic
// level ("a real signed delta ... else { kind: "none" }") but not every
// field name. Concretely: DeltaResult's "value" branch also exposes
// resolvedDateKeyA/resolvedDateKeyB (the date each effective value actually
// came from, which may differ from the requested pinnedDate/hoveredDate on a
// carried-forward row) so a caller can render the C3a/§8 "as of <fallback
// date>" sr-only clarifier without re-deriving the walk itself; the "none"
// branch exposes missingDateKey (whichever of pinnedDate/hoveredDate the row
// had no data at-or-before - hoveredDate wins if both are missing, since
// that's the date of the cell actually being rendered) so the "no data for
// this work as of <date>" wording (§8) can be built directly. Implementation
// must match this contract, or flag back if it's wrong - same convention as
// syncedTableModel.test.ts's T1/T2 header comment.
//
// C3a/C3b (mid-Planning corrections, both load-bearing here): the lead-in is
// a normal value-0 floor ENTRY in comparablePoints (ascending, earliest
// first) - there is no column-level selectability gate, and no synthetic-
// value special case. The ONLY "no data" outcome is rowValueAsOf returning
// null because `date` precedes the row's own earliest entry.

function point(dateKey: string, value: number): RowComparablePoint {
  return { dateKey, value };
}

// A typical row: a lead-in floor (0) followed by three real captures, not
// necessarily on the same dates as any other row's own points/lead-in -
// this is the whole reason for the per-row backward-walk (§3 item 3, C3a).
const ROW_WITH_LEAD_IN: RowComparablePoint[] = [
  point("2020-01-01", 0), // lead-in floor
  point("2026-01-03", 100),
  point("2026-01-10", 140),
  point("2026-02-20", 300),
];

// A row with no lead-in at all (e.g. a work whose publishedOn couldn't be
// derived and earliestPostYear was null) - its comparablePoints simply
// starts at its own first real capture.
const ROW_NO_LEAD_IN: RowComparablePoint[] = [point("2026-01-10", 5), point("2026-02-20", 9)];

describe("rowValueAsOf: per-row backward-walk (C3a)", () => {
  it("returns the exact value when the row has a real point exactly at the given date", () => {
    expect(rowValueAsOf(ROW_WITH_LEAD_IN, "2026-01-10")).toBe(140);
  });

  it("walks backward to the most recent real point strictly before the given date when there is no exact match", () => {
    // 2026-01-15 has no own point; the most recent prior real point is
    // 2026-01-10 (140).
    expect(rowValueAsOf(ROW_WITH_LEAD_IN, "2026-01-15")).toBe(140);
  });

  it("falls all the way back to the lead-in's 0 floor when the date is after the lead-in but before any real point ('vs. 0 at publication')", () => {
    expect(rowValueAsOf(ROW_WITH_LEAD_IN, "2025-06-01")).toBe(0);
  });

  it("returns null when the date is BEFORE the row's own earliest entry (the work had no data as of that date)", () => {
    expect(rowValueAsOf(ROW_WITH_LEAD_IN, "2019-01-01")).toBeNull();
  });

  it("returns null for a row with no lead-in when the date precedes its first real point", () => {
    expect(rowValueAsOf(ROW_NO_LEAD_IN, "2026-01-01")).toBeNull();
  });

  it("resolves a row with no lead-in normally once the date reaches its first real point", () => {
    expect(rowValueAsOf(ROW_NO_LEAD_IN, "2026-01-10")).toBe(5);
    expect(rowValueAsOf(ROW_NO_LEAD_IN, "2026-01-31")).toBe(5);
  });

  it("returns null for a row with an empty comparablePoints list", () => {
    expect(rowValueAsOf([], "2026-01-01")).toBeNull();
  });

  // C3b: the lead-in date itself is a legitimate, ordinary entry - not
  // excluded or special-cased. Selecting exactly the lead-in's own date
  // resolves to its value (0), the same as any other exact-match date.
  it("resolves the lead-in's own date to 0, the same as any other exact match (C3b: lead-in is a valid target)", () => {
    expect(rowValueAsOf(ROW_WITH_LEAD_IN, "2020-01-01")).toBe(0);
  });

  it("resolves the row's LATEST point when the date is after every entry", () => {
    expect(rowValueAsOf(ROW_WITH_LEAD_IN, "2099-01-01")).toBe(300);
  });
});

describe("computeRowDelta: both dates resolve to a real signed delta", () => {
  it("computes effB - effA when both the pinned and hovered dates have exact matches", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2026-01-03", "2026-01-10");

    expect(result).toMatchObject({ kind: "value", delta: 40, effA: 100, effB: 140 });
  });

  it("produces a negative delta when the hovered value is lower than the pinned value", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2026-02-20", "2026-01-03");

    expect(result).toMatchObject({ kind: "value", delta: -200 });
  });

  it("uses the lead-in's 0 as effA's basis when the pinned date is the lead-in date itself (C3b)", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2020-01-01", "2026-01-03");

    expect(result).toMatchObject({ kind: "value", delta: 100, effA: 0, effB: 100 });
  });

  // Corner case §6: pinning then hovering the SAME point gives every row a
  // flat, exact delta of 0 - not "none".
  it("resolves to an exact 0 delta when the hovered date equals the pinned date", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2026-01-10", "2026-01-10");

    expect(result).toMatchObject({ kind: "value", delta: 0 });
  });

  // Ratio values are fractional and small - D6 says the delta rule is
  // applied uniformly, with no metric-aware special-casing, so this proves
  // computeRowDelta never assumes integers.
  it("handles fractional (ratio-shaped) values with no special-casing", () => {
    const ratioRow: RowComparablePoint[] = [
      point("2020-01-01", 0),
      point("2026-01-03", 0.1),
      point("2026-01-10", 0.14),
    ];

    const result = computeRowDelta(ratioRow, "2026-01-03", "2026-01-10");

    expect(result.kind).toBe("value");
    if (result.kind === "value") {
      expect(result.delta).toBeCloseTo(0.04, 10);
    }
  });
});

describe("computeRowDelta: per-row carried-forward basis (C3a's key corrected corner case)", () => {
  it("carries A's basis forward to the row's own most-recent prior point when it has no exact value at the pinned date", () => {
    // The table's shared date axis includes 2026-01-15 (some OTHER row's
    // real capture), but THIS row has no point there - it must carry
    // forward from 2026-01-10 (140), not go blank.
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2026-01-15", "2026-02-20");

    expect(result).toMatchObject({
      kind: "value",
      effA: 140,
      effB: 300,
      delta: 160,
      resolvedDateKeyA: "2026-01-10",
      resolvedDateKeyB: "2026-02-20",
    });
  });

  it("carries B's basis forward the same way when the HOVERED date is the one with no exact value", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2026-01-03", "2026-01-15");

    expect(result).toMatchObject({
      kind: "value",
      effA: 100,
      effB: 140,
      resolvedDateKeyA: "2026-01-03",
      resolvedDateKeyB: "2026-01-10",
    });
  });

  it("marks resolvedDateKeyA/B equal to the requested date on an exact match (not carried forward)", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2026-01-03", "2026-01-10");

    expect(result).toMatchObject({
      resolvedDateKeyA: "2026-01-03",
      resolvedDateKeyB: "2026-01-10",
    });
  });

  it("carries forward to the lead-in's own date/0-value when that is the row's nearest prior point", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2025-06-01", "2026-01-03");

    expect(result).toMatchObject({
      kind: "value",
      effA: 0,
      resolvedDateKeyA: "2020-01-01",
      effB: 100,
    });
  });
});

describe("computeRowDelta: the sole 'no data' outcome (C3a/C3b - per row, never per column)", () => {
  it("returns kind 'none' with the pinned date as missingDateKey when the row has no data at/before the PINNED date", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2019-01-01", "2026-01-03");

    expect(result).toEqual({ kind: "none", missingDateKey: "2019-01-01" });
  });

  it("returns kind 'none' with the hovered date as missingDateKey when the row has no data at/before the HOVERED date", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2026-01-03", "2019-01-01");

    expect(result).toEqual({ kind: "none", missingDateKey: "2019-01-01" });
  });

  // Documents this Testing stage's judgment call when BOTH sides fail: the
  // hovered date (the cell actually being rendered) takes priority, since
  // that's the date the "no data ... as of <date>" wording is attached to.
  it("prefers the hovered date's missingDateKey when BOTH the pinned and hovered dates precede the row's earliest entry", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2018-01-01", "2019-01-01");

    expect(result).toEqual({ kind: "none", missingDateKey: "2019-01-01" });
  });

  it("is a meaningful empty, not a colored zero - kind is literally 'none', never delta: 0", () => {
    const result = computeRowDelta(ROW_WITH_LEAD_IN, "2019-01-01", "2026-01-03");

    expect(result.kind).toBe("none");
    expect((result as { delta?: number }).delta).toBeUndefined();
  });
});

describe("deltaValence: the non-color sign channel", () => {
  it("returns 'up' for a positive delta", () => {
    expect(deltaValence(47)).toBe("up");
  });

  it("returns 'down' for a negative delta", () => {
    expect(deltaValence(-12)).toBe("down");
  });

  it("returns 'flat' for exactly zero", () => {
    expect(deltaValence(0)).toBe("flat");
  });

  // D6: uniform coloring rule applies to the ratio too - no metric-aware
  // exception, so a small fractional positive delta is still "up".
  it("applies the same up/down/flat rule to fractional (ratio) deltas - D6 uniform coloring", () => {
    expect(deltaValence(0.04)).toBe("up");
    expect(deltaValence(-0.04)).toBe("down");
  });
});

describe("deltaLabel: sign-prefixed label text", () => {
  it("prefixes a positive delta with +", () => {
    expect(deltaLabel(47)).toBe("+47");
  });

  it("prefixes a negative delta with - (not a double negative)", () => {
    expect(deltaLabel(-12)).toBe("-12");
  });

  it("renders exactly '0' for a zero delta, with no sign prefix", () => {
    expect(deltaLabel(0)).toBe("0");
  });
});

describe("elapsedLabel: item 3<->4 elapsed-time annotation", () => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  it("reports '<N> days later' when the second epoch is after the first", () => {
    const epochA = Date.UTC(2026, 0, 1);
    const epochB = epochA + 42 * MS_PER_DAY;

    expect(elapsedLabel(epochA, epochB)).toBe("42 days later");
  });

  it("reports '<N> days earlier' when the second epoch is before the first", () => {
    const epochA = Date.UTC(2026, 0, 1);
    const epochB = epochA - 10 * MS_PER_DAY;

    expect(elapsedLabel(epochA, epochB)).toBe("10 days earlier");
  });

  it("reports a singular-safe form for exactly one day", () => {
    const epochA = Date.UTC(2026, 0, 1);
    const epochB = epochA + 1 * MS_PER_DAY;

    expect(elapsedLabel(epochA, epochB)).toBe("1 day later");
  });

  it("reports the same-day case distinctly, not '0 days later'", () => {
    const epochA = Date.UTC(2026, 0, 1);

    expect(elapsedLabel(epochA, epochA)).toBe("same day");
  });
});
