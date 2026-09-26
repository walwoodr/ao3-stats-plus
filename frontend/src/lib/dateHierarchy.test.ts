import { describe, expect, it } from "vitest";
import { buildDateHierarchy, type DayEntry, type YearGroup } from "./dateHierarchy";
import type { DateAxisEntry } from "./tableOrientation";

// Testing task T1 (docs/plans/date-hierarchy-grouping.md §10, §3):
// dateHierarchy.ts does not exist yet - every test below fails at the
// import, a genuine red for this whole file. The YearGroup/MonthGroup/
// DayEntry field names and buildDateHierarchy's signature are lifted
// VERBATIM from the plan's §3 interface block (not this Testing stage's own
// invention) - Implementation must match that exact shape.
//
// Two behaviors below ARE this Testing stage's own concrete translation of
// prose the plan leaves slightly open, flagged individually at each test:
// (a) "group consecutively" is pinned to mean strict adjacency in the given
// array order (no implicit re-sort-then-merge of non-adjacent same-year
// runs); (b) the malformed-dateKey fallback group's exact field values
// (year/month/monthAbbrev/day all equal the raw dateKey string, month=NaN)
// and the duplicate-dateKey dedup's "first occurrence wins" tiebreak.
// Implementation must match these or flag back if the plan intended
// something else.

function entry(dateKey: string, isLeadIn = false): DateAxisEntry {
  return { dateKey, label: dateKey, isLeadIn };
}

// Flattens a YearGroup[] hierarchy back to its ordered leaf DayEntry[] -
// used to assert "grouping order preserved" without hand-walking the tree
// in every test.
function flattenDays(hierarchy: YearGroup[]): DayEntry[] {
  return hierarchy.flatMap((year) => year.months.flatMap((month) => month.days));
}

describe("buildDateHierarchy: grouping order (§3 - iterate in given order, never re-sort)", () => {
  it("preserves the input entries' order in the flattened day sequence (ascending axis, lead-in first)", () => {
    const entries = [
      entry("2014-09-06", true),
      entry("2026-07-01"),
      entry("2026-07-15"),
      entry("2026-08-10"),
    ];

    const hierarchy = buildDateHierarchy(entries);
    const flattened = flattenDays(hierarchy);

    expect(flattened.map((d) => d.dateKey)).toEqual(entries.map((e) => e.dateKey));
  });

  it("does not re-sort out-of-order input - a later dateKey appearing earlier in the array stays earlier in the flattened output", () => {
    // Deliberately NOT ascending - if buildDateHierarchy silently re-sorted,
    // this order assertion would fail in the OPPOSITE way (revealing a
    // real implementation deviation from "iterate in given order").
    const entries = [entry("2026-08-10"), entry("2026-07-01")];

    const hierarchy = buildDateHierarchy(entries);
    const flattened = flattenDays(hierarchy);

    expect(flattened.map((d) => d.dateKey)).toEqual(["2026-08-10", "2026-07-01"]);
  });

  it("creates two separate YearGroup entries for the same year when it appears non-adjacently (strict-adjacency grouping, this Testing stage's own translation of 'consecutively')", () => {
    const entries = [entry("2026-01-05"), entry("2027-01-05"), entry("2026-02-01")];

    const hierarchy = buildDateHierarchy(entries);

    expect(hierarchy.map((y) => y.year)).toEqual(["2026", "2027", "2026"]);
  });
});

describe("buildDateHierarchy: single-date year decomposes to all three tiers (the corrected flaw)", () => {
  it("gives a lone date its own YearGroup{span:1} -> MonthGroup{span:1} -> one DayEntry", () => {
    const hierarchy = buildDateHierarchy([entry("2014-09-06")]);

    expect(hierarchy).toHaveLength(1);
    const [year] = hierarchy;
    expect(year.year).toBe("2014");
    expect(year.span).toBe(1);
    expect(year.months).toHaveLength(1);

    const [month] = year.months;
    expect(month.year).toBe("2014");
    expect(month.month).toBe(9);
    expect(month.monthAbbrev).toBe("Sep");
    expect(month.span).toBe(1);
    expect(month.days).toHaveLength(1);

    const [day] = month.days;
    expect(day.dateKey).toBe("2014-09-06");
    expect(day.day).toBe("06");
    expect(day.entry.dateKey).toBe("2014-09-06");
  });

  it("never collapses/omits the month tier for a single-point year (never just year->day)", () => {
    const hierarchy = buildDateHierarchy([entry("2014-09-06")]);

    // months is always present and non-empty, even for a single point -
    // the plan's explicitly "corrected flaw".
    expect(hierarchy[0].months.length).toBeGreaterThan(0);
  });
});

describe("buildDateHierarchy: multi-month year span counts", () => {
  it("sets a year's span to the number of DISTINCT month groups under it, not the number of days", () => {
    const entries = [
      entry("2026-07-01"),
      entry("2026-07-15"),
      entry("2026-07-20"),
      entry("2026-08-10"),
    ];

    const hierarchy = buildDateHierarchy(entries);

    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].year).toBe("2026");
    // 4 days, but only 2 distinct months (Jul, Aug) - span must be 2, not 4.
    expect(hierarchy[0].span).toBe(2);
    expect(hierarchy[0].months.map((m) => m.monthAbbrev)).toEqual(["Jul", "Aug"]);
  });

  it("sets a month's span to the number of days under it", () => {
    const entries = [entry("2026-07-01"), entry("2026-07-15"), entry("2026-07-20")];

    const hierarchy = buildDateHierarchy(entries);

    expect(hierarchy[0].months[0].span).toBe(3);
    expect(hierarchy[0].months[0].days).toHaveLength(3);
  });
});

describe("buildDateHierarchy: single-point month inside a multi-month year", () => {
  it("gives a single-point month span=1 and days.length=1, alongside sibling multi-day months", () => {
    const entries = [entry("2026-07-01"), entry("2026-07-15"), entry("2026-08-10")];

    const hierarchy = buildDateHierarchy(entries);
    const [julyGroup, augustGroup] = hierarchy[0].months;

    expect(julyGroup.span).toBe(2);
    expect(augustGroup.monthAbbrev).toBe("Aug");
    expect(augustGroup.span).toBe(1);
    expect(augustGroup.days).toHaveLength(1);
  });
});

describe("buildDateHierarchy: the lead-in is grouped like any date (D2 - no special-casing here)", () => {
  it("places a lead-in entry into the ordinary year/month/day tiers by its own dateKey, carrying isLeadIn through on the DayEntry's entry", () => {
    const leadIn = entry("2014-09-06", true);
    const hierarchy = buildDateHierarchy([leadIn, entry("2026-07-01")]);

    const leadInYear = hierarchy.find((y) => y.year === "2014");
    expect(leadInYear).toBeDefined();
    const dayEntry = leadInYear?.months[0]?.days[0];
    expect(dayEntry?.entry.isLeadIn).toBe(true);
    expect(dayEntry?.entry.label).toBe(leadIn.label);
  });

  it("merges a lead-in with a real point that shares the same year/month into one MonthGroup (one label, per §7 corner case)", () => {
    const entries = [entry("2026-09-01", true), entry("2026-09-20")];

    const hierarchy = buildDateHierarchy(entries);

    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].months).toHaveLength(1);
    expect(hierarchy[0].months[0].days).toHaveLength(2);
  });
});

describe("buildDateHierarchy: month abbreviation constant-array mapping (all 12 months)", () => {
  const expectedAbbrevs = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  it.each(expectedAbbrevs.map((abbrev, index) => [index + 1, abbrev] as const))(
    "maps month %i to abbreviation %s",
    (monthNumber, expectedAbbrev) => {
      const monthStr = String(monthNumber).padStart(2, "0");
      const hierarchy = buildDateHierarchy([entry(`2026-${monthStr}-15`)]);

      expect(hierarchy[0].months[0].month).toBe(monthNumber);
      expect(hierarchy[0].months[0].monthAbbrev).toBe(expectedAbbrev);
    },
  );
});

describe("buildDateHierarchy: malformed dateKey -> defensive fallback group (§7/§8, never throws, never drops)", () => {
  it("does not throw for a non-ISO dateKey", () => {
    expect(() => buildDateHierarchy([entry("not-a-date")])).not.toThrow();
  });

  it("still yields exactly one DayEntry for the malformed input (never silently dropped)", () => {
    const hierarchy = buildDateHierarchy([entry("not-a-date")]);

    expect(flattenDays(hierarchy)).toHaveLength(1);
    expect(flattenDays(hierarchy)[0].dateKey).toBe("not-a-date");
  });

  // This Testing stage's own concrete translation of "fallback group keyed
  // by the raw string": year/monthAbbrev/day all surface the raw dateKey
  // verbatim (so the table/chart show SOMETHING recognizable instead of a
  // blank/garbage tier), and month is NaN (there is no real month number to
  // report) - Implementation must match this shape or flag back if the
  // plan intended a different fallback representation.
  it("keys the fallback YearGroup/MonthGroup/DayEntry by the raw dateKey string, with month=NaN", () => {
    const hierarchy = buildDateHierarchy([entry("not-a-date")]);

    expect(hierarchy[0].year).toBe("not-a-date");
    expect(hierarchy[0].months[0].year).toBe("not-a-date");
    expect(hierarchy[0].months[0].monthAbbrev).toBe("not-a-date");
    expect(Number.isNaN(hierarchy[0].months[0].month)).toBe(true);
    expect(hierarchy[0].months[0].days[0].day).toBe("not-a-date");
  });

  it("does not let a malformed entry merge with a real, validly-parsed entry's tiers", () => {
    const entries = [entry("not-a-date"), entry("2026-07-01")];

    const hierarchy = buildDateHierarchy(entries);

    expect(hierarchy).toHaveLength(2);
    expect(hierarchy.map((y) => y.year)).toEqual(["not-a-date", "2026"]);
  });
});

describe("buildDateHierarchy: duplicate dateKey dedup (§7)", () => {
  it("dedups two entries sharing the same dateKey into a single DayEntry (first occurrence wins, this Testing stage's own tiebreak)", () => {
    const first = entry("2026-07-01");
    const second: DateAxisEntry = { dateKey: "2026-07-01", label: "duplicate", isLeadIn: false };

    const hierarchy = buildDateHierarchy([first, second]);
    const flattened = flattenDays(hierarchy);

    expect(flattened).toHaveLength(1);
    expect(flattened[0].entry.label).toBe(first.label);
  });

  it("does not inflate the month/year span counts for a deduped duplicate", () => {
    const entries = [
      entry("2026-07-01"),
      { dateKey: "2026-07-01", label: "duplicate", isLeadIn: false },
      entry("2026-07-15"),
    ];

    const hierarchy = buildDateHierarchy(entries);

    expect(hierarchy[0].months[0].span).toBe(2);
  });
});

describe("buildDateHierarchy: empty input", () => {
  it("returns an empty array for no entries (matches the table's empty state, §4)", () => {
    expect(buildDateHierarchy([])).toEqual([]);
  });
});
