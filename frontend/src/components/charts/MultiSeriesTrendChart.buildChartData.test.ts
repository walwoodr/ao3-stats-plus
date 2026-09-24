import { describe, expect, it } from "vitest";
// Testing task 4 (docs/plans/per-work-zero-basis-dates.md, section 7):
// unit-tests buildChartData directly, pure/dependency-free like
// comparisonSelection.ts's functions. buildChartData is NOT exported by
// the pre-feature component (it's an internal helper today) - per the
// plan's explicit instruction to unit-test it, this file assumes
// Implementation exports it, mirroring this codebase's existing convention
// of exporting pure transform functions for direct testing (see
// comparisonSelection.ts). Until exported, this import resolves to
// `undefined`, so every test below throws at the `buildChartData(...)`
// call site - a genuine, if slightly indirect, red.
//
// Return shape assumed here: `{ rows, zeroBasisLabels }`, where `rows` is
// the existing per-date ChartRow[] (now carrying per-work `lead-*` keys
// alongside the existing `work-*` keys) and `zeroBasisLabels` is the
// `capturedOn -> label` map the plan's "Axis-label/precision treatment"
// section describes (covering the sr-only table's date cell and the
// visible XAxis tickFormatter) for slots that are some work's zero-basis
// and are NOT any work's real capture date.
import { buildChartData, type SeriesDatum } from "./MultiSeriesTrendChart";
import { leadInEpoch, toEpoch } from "../../lib/chartTimeAxis";

const WORK_A: SeriesDatum = {
  workId: 1,
  title: "Work A",
  styleIndex: 0,
  points: [
    { capturedOn: "2026-01-01", value: 10 },
    { capturedOn: "2026-01-08", value: 20 },
  ],
  leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01" },
};

const WORK_B_FALLBACK: SeriesDatum = {
  workId: 2,
  title: "Work B",
  styleIndex: 1,
  points: [{ capturedOn: "2026-01-08", value: 5 }],
  leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
};

const WORK_C_FALLBACK: SeriesDatum = {
  workId: 3,
  title: "Work C",
  styleIndex: 2,
  points: [{ capturedOn: "2026-01-01", value: 3 }],
  leadIn: { capturedOn: "2018-01-01", label: "Before 2018 (estimated baseline)" },
};

const WORK_D_NO_LEADIN: SeriesDatum = {
  workId: 4,
  title: "Work D",
  styleIndex: 3,
  points: [{ capturedOn: "2026-01-01", value: 99 }],
};

describe("buildChartData: axis union with injected zero-basis dates", () => {
  it("includes each distinct leadIn.capturedOn in the union alongside real points", () => {
    const { rows } = buildChartData([WORK_A, WORK_D_NO_LEADIN]);
    // WORK_A's leadIn (2020-01-01) plus the real-date union across both
    // works: WORK_A's own two points (2026-01-01, 2026-01-08) and
    // WORK_D_NO_LEADIN's point (2026-01-01, already covered by WORK_A's).
    expect(rows.map((r) => r.capturedOn)).toEqual(["2020-01-01", "2026-01-01", "2026-01-08"]);
  });

  it("collapses multiple fallback works' identical leadIn date onto one shared slot", () => {
    const { rows } = buildChartData([WORK_B_FALLBACK, WORK_C_FALLBACK]);
    const zeroSlotRows = rows.filter((r) => r.capturedOn === "2018-01-01");
    expect(zeroSlotRows).toHaveLength(1);
  });

  it("does not add a slot for a work with no leadIn beyond its real points", () => {
    const { rows } = buildChartData([WORK_D_NO_LEADIN]);
    expect(rows.map((r) => r.capturedOn)).toEqual(["2026-01-01"]);
  });
});

describe("buildChartData: per-work lead-* dataKeys", () => {
  it("carries 0 at the work's own zero slot", () => {
    const { rows } = buildChartData([WORK_A]);
    const zeroRow = rows.find((r) => r.capturedOn === "2020-01-01");
    expect(zeroRow?.["lead-1"]).toBe(0);
  });

  it("carries the first real point's value at the first real slot (closing the dashed segment)", () => {
    const { rows } = buildChartData([WORK_A]);
    const firstRealRow = rows.find((r) => r.capturedOn === "2026-01-01");
    expect(firstRealRow?.["lead-1"]).toBe(10);
  });

  it("is null on the lead-* key at every other slot", () => {
    const { rows } = buildChartData([WORK_A]);
    const otherRow = rows.find((r) => r.capturedOn === "2026-01-08");
    expect(otherRow?.["lead-1"]).toBeNull();
  });

  it("never carries a value on another work's slot that isn't its own zero or first-real date", () => {
    const { rows } = buildChartData([WORK_A, WORK_B_FALLBACK]);
    // Work A has no leadIn/real point at Work B's 2026-01-08 slot beyond
    // its own already-covered first-real slot; Work B's own zero slot
    // (2018-01-01) carries nothing for Work A.
    const workBZeroRow = rows.find((r) => r.capturedOn === "2018-01-01");
    expect(workBZeroRow?.["lead-1"]).toBeUndefined();
  });

  it("never emits a lead-* key at all for a work with no leadIn", () => {
    const { rows } = buildChartData([WORK_D_NO_LEADIN]);
    rows.forEach((row) => {
      expect(row["lead-4"]).toBeUndefined();
    });
  });
});

describe("buildChartData: main work-* dataKeys are unaffected by lead-in injection", () => {
  it("gives an identical work-* value at a real point whether or not that work carries a leadIn", () => {
    const withoutLeadIn = buildChartData([{ ...WORK_A, leadIn: undefined }]);
    const withLeadIn = buildChartData([WORK_A]);

    const realRowWithout = withoutLeadIn.rows.find((r) => r.capturedOn === "2026-01-01");
    const realRowWith = withLeadIn.rows.find((r) => r.capturedOn === "2026-01-01");

    expect(realRowWith?.["work-1"]).toBe(realRowWithout?.["work-1"]);
    expect(realRowWith?.["work-1"]).toBe(10);
  });

  it("keeps work-* null (not 0) on another work's zero-basis-only slot - no fabricated zero", () => {
    const { rows } = buildChartData([WORK_A, WORK_B_FALLBACK]);
    const workBZeroRow = rows.find((r) => r.capturedOn === "2018-01-01");
    expect(workBZeroRow?.["work-1"]).toBeNull();
  });
});

describe("buildChartData: zeroBasisLabels map", () => {
  it("maps a zero-basis-only fallback slot to its shared 'Before <year> (estimated baseline)' label", () => {
    const { zeroBasisLabels } = buildChartData([WORK_B_FALLBACK, WORK_C_FALLBACK]);
    expect(zeroBasisLabels.get("2018-01-01")).toBe("Before 2018 (estimated baseline)");
  });

  it("maps a zero-basis-only accurate-publish slot to its 'Published <date>' label", () => {
    const { zeroBasisLabels } = buildChartData([WORK_A]);
    expect(zeroBasisLabels.get("2020-01-01")).toBe("Published 2020-01-01");
  });

  it("does not map a slot that is only ever a real capture date", () => {
    const { zeroBasisLabels } = buildChartData([WORK_A]);
    expect(zeroBasisLabels.has("2026-01-01")).toBe(false);
  });

  // Corner case (plan section 4): a fallback slot that happens to equal
  // another work's real capture date is NOT "zero-basis-only" - the map
  // must exclude it so the raw ISO date wins there instead, per the plan's
  // explicit "prefers the raw ISO date for that shared slot" rule.
  it("excludes a slot from the map when it is also some work's real capture date", () => {
    const workWithRealPointOnSharedSlot: SeriesDatum = {
      workId: 5,
      title: "Work E",
      styleIndex: 4,
      points: [{ capturedOn: "2018-01-01", value: 42 }],
    };

    const { zeroBasisLabels } = buildChartData([WORK_B_FALLBACK, workWithRealPointOnSharedSlot]);

    expect(zeroBasisLabels.has("2018-01-01")).toBe(false);
  });
});

describe("buildChartData: robustness", () => {
  it("does not throw for a work with an empty points array but a leadIn present", () => {
    const emptyWork: SeriesDatum = {
      workId: 6,
      title: "Empty",
      styleIndex: 5,
      points: [],
      leadIn: { capturedOn: "2020-01-01", label: "Published 2020-01-01" },
    };

    expect(() => buildChartData([emptyWork])).not.toThrow();
  });

  it("does not throw for a leadIn whose date sorts after all of a work's own points", () => {
    const backwardsLeadIn: SeriesDatum = {
      workId: 7,
      title: "Backwards",
      styleIndex: 0,
      points: [{ capturedOn: "2020-01-01", value: 1 }],
      leadIn: { capturedOn: "2099-01-01", label: "Published 2099-01-01" },
    };

    expect(() => buildChartData([backwardsLeadIn])).not.toThrow();
  });

  it("does not throw with an empty series array", () => {
    expect(() => buildChartData([])).not.toThrow();
    expect(buildChartData([]).rows).toEqual([]);
  });
});

// Testing task 10 (docs/plans/chart-axis-comparison-and-table-orientation-
// batch.md §10, §3 item 4 point 2): each row must also carry a numeric
// `xEpoch` for the new real-time XAxis. The two lead-in placement paths are
// genuinely different code paths (§3 item 4 point 2) - a PUBLISH-DATE
// lead-in (isPublishDate: true) sits at its own REAL epoch (toEpoch), since
// the work really was published then; the account-level ESTIMATED-BASELINE
// lead-in (isPublishDate false/omitted) sits at the BOUNDED synthetic offset
// (chartTimeAxis.leadInEpoch) instead, never its literal (often
// many-years-distant) raw date.
describe("buildChartData: xEpoch (item 4 point 2 - the two lead-in placement paths)", () => {
  it("gives every real point's row an xEpoch equal to toEpoch(capturedOn)", () => {
    const { rows } = buildChartData([WORK_D_NO_LEADIN]);
    const row = rows.find((r) => r.capturedOn === "2026-01-01");

    expect(row?.xEpoch).toBe(toEpoch("2026-01-01"));
  });

  it("places a PUBLISH-DATE lead-in's row at its own real epoch (toEpoch), not a bounded offset", () => {
    // WORK_A's own leadIn fixture (above) doesn't set isPublishDate - build
    // a dedicated one carrying it explicitly, since that flag is what picks
    // this code path.
    const publishDateWork: SeriesDatum = {
      workId: 20,
      title: "Work Publish",
      styleIndex: 0,
      points: [
        { capturedOn: "2026-01-01", value: 10 },
        { capturedOn: "2026-01-11", value: 20 }, // 10-day ruler for later timeAxis specs.
      ],
      leadIn: { capturedOn: "2010-01-01", label: "Published 2010-01-01", isPublishDate: true },
    };

    const { rows: publishRows } = buildChartData([publishDateWork]);
    const leadInRow = publishRows.find((r) => r.capturedOn === "2010-01-01");

    expect(leadInRow?.xEpoch).toBe(toEpoch("2010-01-01"));
  });

  it("places an ESTIMATED-BASELINE lead-in's row at the bounded synthetic offset (leadInEpoch), not its literal (distant) raw date", () => {
    const estimatedBaselineWork: SeriesDatum = {
      workId: 21,
      title: "Work Estimated",
      styleIndex: 0,
      points: [
        { capturedOn: "2026-01-01", value: 10 },
        { capturedOn: "2026-01-11", value: 20 },
      ],
      leadIn: { capturedOn: "2010-01-01", label: "Before 2010 (estimated baseline)" },
    };

    const { rows } = buildChartData([estimatedBaselineWork]);
    const leadInRow = rows.find((r) => r.capturedOn === "2010-01-01");
    const firstRealEpoch = toEpoch("2026-01-01");
    const expectedEpoch = leadInEpoch(firstRealEpoch, {
      realEpochs: [firstRealEpoch, toEpoch("2026-01-11")],
    });

    expect(leadInRow?.xEpoch).toBe(expectedEpoch);
    expect(leadInRow?.xEpoch).not.toBe(toEpoch("2010-01-01"));
  });
});
