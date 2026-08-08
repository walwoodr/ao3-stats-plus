import { useState } from "react";
import type { PerWorkPoint, PerWorkSeries } from "../queries/useStatsForUser";
import {
  clampWindow,
  filterPointsInWindow,
  shouldShowRangeSlider,
  unionCapturedOnDates,
  type YearWindow,
} from "../lib/comparisonSelection";
import { assignStyleSlot, releaseStyleSlot } from "../lib/seriesStyles";
import { useWorkComparisonStore } from "../store/useWorkComparisonStore";
import { WorkPicker } from "./WorkPicker";
import { DateRangeSlider } from "./DateRangeSlider";
import {
  MultiSeriesTrendChart,
  type SeriesDatum,
  type SeriesLeadIn,
} from "./charts/MultiSeriesTrendChart";

export interface WorkComparisonSectionProps {
  perWorkSeries: PerWorkSeries[];
  earliestPostYear: number | null;
  username: string;
}

function yearOf(capturedOn: string): number {
  return Number(capturedOn.slice(0, 4));
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Error states (plan section 5): a malformed publishedOn (not a real
// ISO8601Date, which the backend types it as but this is defensive) is
// treated the same as a missing one - use the fallback, never throw.
function isValidIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

// Per-work zero-basis date: the work's own accurate publishedOn when
// present and well-formed, else the same synthetic
// `${earliestPostYear}-01-01` baseline the aggregate charts already use,
// else null when neither source exists (plan corner case: no zero-basis
// can be formed).
function zeroBasisDateFor(work: PerWorkSeries, earliestPostYear: number | null): string | null {
  if (work.publishedOn && isValidIsoDate(work.publishedOn)) return work.publishedOn;
  if (earliestPostYear != null) return `${earliestPostYear}-01-01`;
  return null;
}

function zeroBasisLabelFor(
  work: PerWorkSeries,
  zeroBasisDate: string,
  earliestPostYear: number | null,
): string {
  if (work.publishedOn && isValidIsoDate(work.publishedOn) && work.publishedOn === zeroBasisDate) {
    return `Published ${work.publishedOn}`;
  }
  return `Before ${earliestPostYear} (estimated baseline)`;
}

// Gates a work's computed zero-basis date into a renderable `leadIn`, per
// the plan's "Decoupling from the date-range slider" slider-interaction
// gating: only when the work has >=1 currently-visible point, the
// zero-basis year isn't below the active window's start, and the
// zero-basis date is strictly before the first visible point (the
// degenerate-guard, avoiding a zero-width/backwards segment).
function computeLeadIn(
  work: PerWorkSeries,
  earliestPostYear: number | null,
  visiblePoints: PerWorkPoint[],
  effectiveRange: YearWindow | null,
): SeriesLeadIn | undefined {
  if (visiblePoints.length === 0) return undefined;

  const zeroBasisDate = zeroBasisDateFor(work, earliestPostYear);
  if (zeroBasisDate === null) return undefined;
  if (effectiveRange !== null && yearOf(zeroBasisDate) < effectiveRange.start) return undefined;

  const firstVisiblePoint = visiblePoints[0];
  if (zeroBasisDate >= firstVisiblePoint.capturedOn) return undefined;

  return {
    capturedOn: zeroBasisDate,
    label: zeroBasisLabelFor(work, zeroBasisDate, earliestPostYear),
  };
}

// Filters a persisted/restored selection down to ids that still exist in
// perWorkSeries (a work deleted/renamed since, or a different account's
// stale data - plan §2.3 #2), falling back to the first work whenever that
// leaves nothing selected - covers both a genuine first visit (no restored
// ids at all, §2.3 #1) and dangling ids that filtering emptied out (§2.3
// #2) via the same fallback.
function reconcileSelection(
  rawSelectedWorkIds: number[],
  perWorkSeries: PerWorkSeries[],
): number[] {
  const availableIds = new Set(perWorkSeries.map((work) => work.ao3WorkId));
  const filtered = rawSelectedWorkIds.filter((id) => availableIds.has(id));
  if (filtered.length > 0) return filtered;
  return perWorkSeries[0] ? [perWorkSeries[0].ao3WorkId] : [];
}

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

// Diffs a new selection against the current style-assignment map so each
// work's (shape, dash, color) triple stays stable across other works being
// toggled - the lowest-free-index-on-add / release-on-remove contract lives
// in seriesStyles.ts; this just keeps the map in sync with whatever
// selection (from a user interaction OR the mount-time reconciliation
// below) is now current.
function syncStyleAssignment(
  previous: Map<number, number>,
  nextSelectedWorkIds: number[],
): Map<number, number> {
  let next = previous;
  for (const workId of previous.keys()) {
    if (!nextSelectedWorkIds.includes(workId)) next = releaseStyleSlot(next, workId);
  }
  for (const workId of nextSelectedWorkIds) {
    if (!next.has(workId)) next = assignStyleSlot(next, workId);
  }
  return next;
}

// REPLACES PerWorkTrends (Q1: replace, not coexist). `selectedWorkIds`/
// `range` now live in the persisted per-username useWorkComparisonStore
// (plan §2) rather than local useState - restored on mount and reconciled
// against the current perWorkSeries (§2.3). `styleAssignment` (workId ->
// style slot) stays view-local useState, NOT persisted - style slots are
// ephemeral visual assignment, rebuilt from the restored/reconciled
// selection's own order. Composes the Autocomplete-based WorkPicker +
// DateRangeSlider + two MultiSeriesTrendChart instances (hits, kudos)
// side-by-side in a bordered "controls island" (§8).
export function WorkComparisonSection({
  perWorkSeries,
  earliestPostYear,
  username,
}: WorkComparisonSectionProps) {
  const setSelectionInStore = useWorkComparisonStore((state) => state.setSelection);
  const setRangeInStore = useWorkComparisonStore((state) => state.setRange);

  // Persistence reconciliation (§2.3 #1/#2), performed once - inside this
  // lazy initializer, which React guarantees runs exactly once, synchronously,
  // during the component's FIRST render, before the `selectedWorkIds`
  // subscription below reads its first snapshot. Writing the reconciled
  // selection straight back into the store here (rather than in a
  // useEffect) means that subscription already reflects it within this same
  // render - no extra render pass, and, critically, no re-running on every
  // later render, so a user explicitly deselecting down to zero works
  // during the CURRENT session stays at zero rather than this same
  // fallback-to-first-work logic re-forcing a selection back afterward.
  const [styleAssignment, setStyleAssignment] = useState<Map<number, number>>(() => {
    const store = useWorkComparisonStore.getState();
    const currentRaw = store.getSelection(username);
    const reconciled = reconcileSelection(currentRaw, perWorkSeries);
    if (!sameIds(reconciled, currentRaw)) store.setSelection(username, reconciled);
    return syncStyleAssignment(new Map(), reconciled);
  });

  const selectedWorkIds = useWorkComparisonStore((state) => state.getSelection(username));
  const rawRange = useWorkComparisonStore((state) => state.getRange(username));

  if (perWorkSeries.length === 0) return null;

  function handleSelectionChange(nextSelectedWorkIds: number[]) {
    setSelectionInStore(username, nextSelectedWorkIds);
    setStyleAssignment((previous) => syncStyleAssignment(previous, nextSelectedWorkIds));
  }

  // Selection order (not perWorkSeries order) drives both the legend/table
  // column order and the style assignment lookup above.
  const orderedSelectedWorks = selectedWorkIds
    .map((workId) => perWorkSeries.find((work) => work.ao3WorkId === workId))
    .filter((work): work is PerWorkSeries => work !== undefined);

  const unionDates = unionCapturedOnDates(orderedSelectedWorks);
  const showSlider = shouldShowRangeSlider(unionDates);

  // Q5's boundary-crossing corner case, preserved by §3.2: once the
  // selection drops back to <= 2 union points, the slider becomes DISABLED
  // (no longer unmounts - see DateRangeSlider's own `disabled` derivation)
  // AND the window resets to full - no stale filter left applied
  // invisibly. Adjusts the store during render (the same "you might not
  // need an effect" pattern this file already used for the pre-redesign
  // local `range` useState) rather than in a useEffect.
  if (!showSlider && rawRange !== null) {
    setRangeInStore(username, null);
  }

  const currentYear = new Date().getFullYear();
  const earliestUnionYear = unionDates.length > 0 ? yearOf(unionDates[0]) : currentYear;
  const domainStart = Math.min(earliestPostYear ?? earliestUnionYear, currentYear);
  const domain: YearWindow = { start: domainStart, end: currentYear };

  // Range state invariants (plan's Error states): re-clamp `range` against
  // the *live* `domain` at derivation time, not just against the
  // then-current domain back when `handleRangeChange` set it. A selection
  // change can shift the domain (e.g. swapping to a work with a disjoint
  // date range) while staying above the >2 gate, so the gate-drop reset
  // below never fires for it - `range` alone can't be trusted raw here. If
  // the stored window no longer overlaps the domain at all, treat it as
  // fully stale and fall back to the full domain rather than collapsing it
  // to a degenerate single-point clamp; otherwise preserve the overlapping
  // portion of the user's chosen window.
  const effectiveRange: YearWindow | null =
    rawRange === null || rawRange.end < domain.start || rawRange.start > domain.end
      ? null
      : clampWindow(rawRange, domain);

  const sliderValue: [number, number] = effectiveRange
    ? [effectiveRange.start, effectiveRange.end]
    : [domain.start, domain.end];

  function handleRangeChange(nextValue: [number, number]) {
    setRangeInStore(username, clampWindow({ start: nextValue[0], end: nextValue[1] }, domain));
  }

  // Generalized (plan §3.2) to take a value extractor + an applyLeadIn flag
  // rather than a hardcoded "hits"|"kudos" field name, so every top-level
  // metric (and the Bookmarks sub-views' Total/Public/Private types) share
  // this one builder. Sparse metrics (public/private bookmarks) drop
  // null-valued points instead of charting them (plan §3.3 - never
  // fabricate a zero) and pass applyLeadIn=false (their first enrichment
  // point isn't the work's first capture). Existing window-filtering,
  // style-slot assignment, and lead-in gating stay intact.
  function buildSeries(
    valueOf: (point: PerWorkPoint) => number | null,
    applyLeadIn: boolean,
  ): SeriesDatum[] {
    return orderedSelectedWorks.map((work) => {
      const visiblePoints = effectiveRange
        ? filterPointsInWindow(work.points, effectiveRange)
        : work.points;
      const points = visiblePoints
        .map((point) => ({ capturedOn: point.capturedOn, value: valueOf(point) }))
        .filter((point): point is { capturedOn: string; value: number } => point.value !== null);
      const leadIn = applyLeadIn
        ? computeLeadIn(work, earliestPostYear, visiblePoints, effectiveRange)
        : undefined;
      return {
        workId: work.ao3WorkId,
        title: work.title,
        styleIndex: styleAssignment.get(work.ao3WorkId) ?? 0,
        points,
        leadIn,
      };
    });
  }

  const summaryMessage =
    selectedWorkIds.length > 0
      ? `Comparing ${selectedWorkIds.length} work${selectedWorkIds.length === 1 ? "" : "s"}, ` +
        `${yearOf(unionDates[0] ?? `${currentYear}-01-01`)} to ` +
        `${yearOf(unionDates[unionDates.length - 1] ?? `${currentYear}-01-01`)}.`
      : "";

  // leadIn gating (computeLeadIn) doesn't depend on the metric - hits and
  // kudos share the same visible-points/window inputs - so whether the
  // caption should show is read off one of the two built series arrays
  // rather than recomputed separately, per the plan's "reuse the same gate
  // rather than recomputing it separately" instruction.
  const hitsSeries = buildSeries((point) => point.hits, true);
  const kudosSeries = buildSeries((point) => point.kudos, true);
  const hasRenderedLeadIn = hitsSeries.some((s) => s.leadIn !== undefined);

  return (
    <div className="mt-10 flex flex-col gap-6">
      <h2 className="font-display text-xl font-semibold text-ink">Compare works</h2>

      <div
        data-testid="controls-island"
        className="flex flex-col gap-3 rounded-lg border border-ink/12 bg-card p-6"
      >
        {/* Requirement 3/§3.1: a deterministic two-column CSS grid, NOT a
            flex row - `minmax(0,1fr)` on the picker track is what stops
            accumulating chips from ever widening the column (a plain `1fr`
            track's implicit min-width is min-content, which chips WOULD
            grow). The slider column is a fixed `18rem` and the slider is
            now ALWAYS rendered into it (disabled below the threshold,
            never omitted) - see DateRangeSlider.tsx's own `disabled` gate. */}
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
          <div>
            <WorkPicker
              perWorkSeries={perWorkSeries}
              selectedWorkIds={selectedWorkIds}
              onChange={handleSelectionChange}
              extraStatusMessage={summaryMessage}
            />
          </div>

          <div>
            <DateRangeSlider
              min={domain.start}
              max={domain.end}
              value={sliderValue}
              onChange={handleRangeChange}
              unionPointCount={unionDates.length}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <MultiSeriesTrendChart title="Hits" valueLabel="Hits" series={hitsSeries} />
        <MultiSeriesTrendChart title="Kudos" valueLabel="Kudos" series={kudosSeries} />
      </div>

      {hasRenderedLeadIn && (
        <p className="text-sm text-ink-soft">
          Dashed segments show the period before your first captured stats for a work.
        </p>
      )}
    </div>
  );
}
