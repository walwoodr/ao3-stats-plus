import { describe, expect, it } from "vitest";
import { groupWorksByFandom, NO_FANDOM_LABEL, type FandomGroup } from "./groupWorksByFandom";
import type { PerWorkSeries } from "../queries/useStatsForUser";

// groupWorksByFandom is a pure client-side transform over the `fandoms`
// string already returned by the existing statsForUser query (see the
// plan's "Backend / data model" section - this is confirmed to be a single
// ", "-joined string, not a list, per
// backend/app/services/snapshot_ingest_service.rb:129). It powers
// WorkPicker's grouped checkbox UI: one fieldset per fandom, with
// multi-fandom works appearing (but not duplicated) under every fandom they
// belong to.
function work(overrides: Partial<PerWorkSeries> & { ao3WorkId: number }): PerWorkSeries {
  return {
    title: `Work ${overrides.ao3WorkId}`,
    fandoms: "",
    points: [],
    ...overrides,
  };
}

describe("groupWorksByFandom", () => {
  it("splits a single-fandom work into a single group", () => {
    const works = [work({ ao3WorkId: 1, fandoms: "Fandom One" })];

    const groups = groupWorksByFandom(works);

    expect(groups).toHaveLength(1);
    expect(groups[0].fandom).toBe("Fandom One");
    expect(groups[0].works).toEqual([works[0]]);
  });

  it("splits a multi-fandom work's `, `-joined fandoms field into multiple groups", () => {
    const works = [work({ ao3WorkId: 1, fandoms: "Fandom One, Fandom Two" })];

    const groups = groupWorksByFandom(works);

    expect(groups.map((g) => g.fandom)).toEqual(["Fandom One", "Fandom Two"]);
    expect(groups.every((g) => g.works.length === 1)).toBe(true);
  });

  it("dedupes a multi-fandom work across the groups it belongs to - it is one underlying work, not a copy", () => {
    const multiFandomWork = work({ ao3WorkId: 1, fandoms: "Fandom One, Fandom Two" });
    const groups = groupWorksByFandom([multiFandomWork]);

    const groupOneWork = groups.find((g) => g.fandom === "Fandom One")?.works[0];
    const groupTwoWork = groups.find((g) => g.fandom === "Fandom Two")?.works[0];

    // Same underlying work object in both groups (not a clone), so that
    // downstream consumers (e.g. WorkPicker's checked-state sync) can
    // trivially compare by identity or by ao3WorkId without a deep-equal.
    expect(groupOneWork).toBe(multiFandomWork);
    expect(groupTwoWork).toBe(multiFandomWork);
  });

  it("never lists a work more than once within the same group", () => {
    // Defensive: a work whose fandoms string happens to repeat the same
    // fandom name (e.g. bad upstream data) must still appear exactly once
    // per group, not once per repetition.
    const works = [work({ ao3WorkId: 1, fandoms: "Fandom One, Fandom One" })];

    const groups = groupWorksByFandom(works);

    expect(groups).toHaveLength(1);
    expect(groups[0].works).toHaveLength(1);
  });

  it("buckets a work with an empty fandoms string under a 'No fandom' group rather than dropping it", () => {
    const works = [work({ ao3WorkId: 1, fandoms: "" })];

    const groups = groupWorksByFandom(works);

    expect(groups).toHaveLength(1);
    expect(groups[0].fandom).toBe(NO_FANDOM_LABEL);
    expect(groups[0].works).toEqual([works[0]]);
  });

  it("orders groups by first encounter while scanning the input array (deterministic, not dependent on later re-sorts)", () => {
    const works = [
      work({ ao3WorkId: 1, fandoms: "Fandom B" }),
      work({ ao3WorkId: 2, fandoms: "Fandom A" }),
      work({ ao3WorkId: 3, fandoms: "Fandom B" }),
    ];

    const groups = groupWorksByFandom(works);

    expect(groups.map((g) => g.fandom)).toEqual(["Fandom B", "Fandom A"]);
  });

  it("orders works within a group preserving their relative order from the input array", () => {
    const works = [
      work({ ao3WorkId: 3, fandoms: "Fandom A" }),
      work({ ao3WorkId: 1, fandoms: "Fandom A" }),
      work({ ao3WorkId: 2, fandoms: "Fandom A" }),
    ];

    const groups = groupWorksByFandom(works);

    expect(groups[0].works.map((w) => w.ao3WorkId)).toEqual([3, 1, 2]);
  });

  it("is stable across repeated calls with the same input (same object graph each time is not required, same order is)", () => {
    const works = [
      work({ ao3WorkId: 1, fandoms: "Fandom One" }),
      work({ ao3WorkId: 2, fandoms: "Fandom Two" }),
    ];

    const first = groupWorksByFandom(works);
    const second = groupWorksByFandom(works);

    expect(first.map((g) => g.fandom)).toEqual(second.map((g) => g.fandom));
    expect(first.map((g) => g.works.map((w) => w.ao3WorkId))).toEqual(
      second.map((g) => g.works.map((w) => w.ao3WorkId)),
    );
  });

  it("returns an empty array for an empty perWorkSeries list", () => {
    expect(groupWorksByFandom([])).toEqual([]);
  });

  // Accepted, documented limitation (plan's Corner Cases: "Lossy fandom
  // split") - a fandom *name* that itself literally contains ", " cannot be
  // told apart from two fandoms joined by the delimiter, since the backend
  // exposes `fandoms` as a single comma-joined string, not a list. This is
  // NOT a bug to fix here: the plan explicitly defers the real fix (storing
  // fandoms as an array/jsonb) to a separate, out-of-scope data-model
  // change, and records this as a TECH_DEBT.md candidate instead. This test
  // pins the CURRENT accepted behavior (splits into two pseudo-groups) so a
  // future change to that behavior is a deliberate, reviewed decision.
  it("splits a fandom name that itself contains the delimiter into two pseudo-fandom groups (accepted limitation, not a bug)", () => {
    const works = [work({ ao3WorkId: 1, fandoms: "Sherlock Holmes, RDJ Films" })];

    const groups = groupWorksByFandom(works);

    // "Sherlock Holmes, RDJ Films" is intended by the (hypothetical) author
    // as ONE fandom name, but is indistinguishable from two fandoms named
    // "Sherlock Holmes" and "RDJ Films" at the string level.
    expect(groups.map((g) => g.fandom)).toEqual(["Sherlock Holmes", "RDJ Films"]);
    expect(groups.every((g) => g.works[0].ao3WorkId === 1)).toBe(true);
  });

  it("does not mutate the input perWorkSeries array or its work objects", () => {
    const works = [work({ ao3WorkId: 1, fandoms: "Fandom One, Fandom Two" })];
    const snapshot = JSON.parse(JSON.stringify(works)) as unknown;

    groupWorksByFandom(works);

    expect(JSON.parse(JSON.stringify(works))).toEqual(snapshot);
  });
});

// Type-only compile check: consumers (WorkPicker) rely on this shape.
const _typeCheck: FandomGroup = { fandom: "x", works: [] };
void _typeCheck;
