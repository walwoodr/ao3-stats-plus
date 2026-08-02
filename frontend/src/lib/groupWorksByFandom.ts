import type { PerWorkSeries } from "../queries/useStatsForUser";

// `fandoms` is a single ", "-joined string at the API boundary, not a list
// (backend/app/services/snapshot_ingest_service.rb:129 - confirmed, not
// assumed, see the plan's "Backend / data model" section). Splitting on
// ", " is lossy if a fandom name itself contains that exact substring - an
// accepted limitation (see docs/plans/per-work-comparison-graph.md's Corner
// Cases and the matching TECH_DEBT.md entry), not a bug fixed here.
const FANDOM_DELIMITER = ", ";

export const NO_FANDOM_LABEL = "No fandom";

export interface FandomGroup {
  fandom: string;
  works: PerWorkSeries[];
}

function splitFandoms(fandoms: string): string[] {
  if (fandoms === "") return [NO_FANDOM_LABEL];
  return fandoms.split(FANDOM_DELIMITER);
}

// Groups works by fandom for WorkPicker's grouped checkbox UI. Ordering is
// deterministic first-encounter order (both which fandom group appears
// first, and which work appears first within a group) rather than
// alphabetical - a Testing-stage interface decision (see
// groupWorksByFandom.test.ts's header comment), not re-litigated here. A
// multi-fandom work is one underlying object, referenced (not cloned) from
// every group it belongs to, so callers can compare by identity/ao3WorkId.
export function groupWorksByFandom(perWorkSeries: PerWorkSeries[]): FandomGroup[] {
  const groups: FandomGroup[] = [];
  const groupIndexByFandom = new Map<string, number>();

  for (const work of perWorkSeries) {
    const fandomNames = splitFandoms(work.fandoms);
    for (const fandom of fandomNames) {
      let groupIndex = groupIndexByFandom.get(fandom);
      if (groupIndex === undefined) {
        groupIndex = groups.length;
        groupIndexByFandom.set(fandom, groupIndex);
        groups.push({ fandom, works: [] });
      }
      const group = groups[groupIndex];
      // Guards the "a fandoms string that repeats the same fandom name"
      // defensive corner case - never list a work twice within one group.
      if (!group.works.some((existing) => existing.ao3WorkId === work.ao3WorkId)) {
        group.works.push(work);
      }
    }
  }

  return groups;
}
