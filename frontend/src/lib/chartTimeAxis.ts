// Pure helpers for item 4's true chronological x-axis (D7) and item 1's
// y-domain padding math (D1) - docs/plans/chart-axis-comparison-and-table-
// orientation-batch.md §2.1/§3 item 1/§3 item 4. No React/Recharts
// dependency here; the chart components consume these directly.

import { formatNumber } from "./formatNumber";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real captured date is always day-granular ISO (backend guarantees this -
// see snapshot.rb's `captured_on` date column); parsing is done manually via
// Date.UTC rather than Date.parse so the result is always midnight UTC,
// never shifted by the runtime's local timezone. Returns NaN (not a throw)
// for anything unparseable, per §7's "caller filters it before domain
// computation" contract.
export function toEpoch(capturedOn: string): number {
  const match = ISO_DATE_PATTERN.exec(capturedOn);
  if (!match) return NaN;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// The inverse of toEpoch, for a real point's axis tick text.
export function formatDateTick(epoch: number): string {
  const date = new Date(epoch);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

// Deliberately coarser (year-only) than formatDateTick - the estimated-
// baseline lead-in has no real day-level precision to show.
export function formatLeadInTick(epoch: number): string {
  return String(new Date(epoch).getUTCFullYear());
}

// D1 (docs/plans/date-hierarchy-grouping.md §2.2): the three charts' real-
// tick text switches from the full ISO date (formatDateTick) to bare
// day-of-month - month/year context now lives in DateGroupingOverlay's own
// span/rule labels instead of being repeated on every day tick. Purely a
// tick-TEXT change; it never touches selectDisplayedTicks/interval={0}/the
// lead-in marker path. Degrades to the literal (NaN-stringified) text for a
// malformed/NaN epoch rather than throwing, matching formatDateTick's own
// defense-in-depth precedent for an unparseable upstream date.
export function formatDayTick(epoch: number): string {
  if (Number.isNaN(epoch)) return "NaN";
  return pad2(new Date(epoch).getUTCDate());
}

const MIN_LEAD_IN_GAP_DAYS = 14;
const MAX_LEAD_IN_GAP_DAYS = 90;
const FALLBACK_GAP_DAYS = 30;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface LeadInEpochOptions {
  realEpochs: number[];
}

// Places the account-level "estimated baseline" lead-in at a bounded
// synthetic offset before the first real point (§3 item 4 point 2) - NOT at
// its own (often many-years-distant) literal date. The offset is the MEDIAN
// gap between consecutive real points (an outlier gap shouldn't dominate),
// clamped to [MIN, MAX] days, falling back to a flat 30-day gap when there
// are fewer than two real points to derive a gap from.
export function leadInEpoch(firstRealEpoch: number, { realEpochs }: LeadInEpochOptions): number {
  const sorted = [...realEpochs].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(sorted[i] - sorted[i - 1]);
  }
  const gapMs = gaps.length > 0 ? median(gaps) : FALLBACK_GAP_DAYS * MS_PER_DAY;
  const clampedMs = Math.min(
    Math.max(gapMs, MIN_LEAD_IN_GAP_DAYS * MS_PER_DAY),
    MAX_LEAD_IN_GAP_DAYS * MS_PER_DAY,
  );
  return firstRealEpoch - clampedMs;
}

// Round 5 fix (2026-09-25, supersedes round 4's `f9b58e6` partial fix - see
// TECH_DEBT.md). Every XAxis below now passes `interval={0}` (verified
// against the installed recharts@3.10.0 source, node_modules/recharts/es6/
// cartesian/getTicks.js: `isNumber(interval)` routes straight to
// `getNumberIntervalTicks`/`getEveryNth(ticks, interval + 1)`, which for 0
// returns the input `ticks` array UNCHANGED - entirely bypassing
// getTicksEnd/getTicksStart and their width-collision AND minTickGap-
// proximity-buffer logic). That buffer was round 4's remaining bug: even a
// zero-width lead-in tick could still get dropped just for sitting within
// `minTickGap` (default 5px) of an already-kept neighbor, independent of
// its own size - confirmed directly in getTicks.js's getTicksEnd.
//
// Bypassing Recharts' filtering entirely removes a real protection it WAS
// providing correctly for dense REAL (non-lead-in) date ticks - each chart
// already passes every real capture date as a candidate tick, and a
// snapshot is deduped only per CALENDAR DAY (Snapshot's captured_on unique
// index - backend/app/models/snapshot.rb), with no server-side cap on
// total history (StatsForUserResult#aggregate_series returns the user's
// full snapshot history, ordered, unbounded). A dashboard tracking months
// of daily use can realistically accumulate dozens of same-length
// "YYYY-MM-DD" labels (formatDateTick above - always exactly 10 chars),
// which the OLD default `interval="preserveEnd"` collision filtering was
// silently thinning down to a non-overlapping subset - losing that on a
// fixed-width chart card (DashboardPage's `max-w-4xl` + `p-8`, non-
// responsive at time of writing) would reintroduce the exact class of
// overlap bug rounds 1-4 fought, just for real ticks instead of the
// lead-in. Since Recharts no longer does this for us, this module now
// does: cap how many REAL ticks are ever handed to `ticks`, evenly sampled
// (always keeping the earliest and latest), while every LEAD-IN tick is
// ALWAYS included, uncapped and untouched by this sampling - lead-in
// ticks render as small markers (LeadInXAxisTick.tsx), not text, so they
// carry none of the width-collision risk this cap exists for.
//
// MAX_REAL_AXIS_TICKS is a deterministic constant, not a live pixel
// measurement - consistent with this module's existing
// estimateYAxisWidth precedent (also deterministic, for the same reason:
// jsdom never lays out real text, and Recharts' own "auto" DOM measurement
// has now been shown untrustworthy across 4 rounds of this bug). Sized
// generously for this dashboard's current desktop-oriented fixed-width
// layout; the project's own design-context snapshot targets narrower
// (375px) viewports as a checklist item that the existing dashboard hasn't
// migrated to yet (see CLAUDE.md's "Design context" section) - if/when
// that migration happens, this cap should be revisited against real
// measured plot width rather than left as a silent assumption.
export const MAX_REAL_AXIS_TICKS = 6;

// Chart-table-polish-batch item 5 (docs/plans/chart-table-polish-batch.md
// §4 item 5, §8 T5): above this many real (non-lead-in) points, every
// day-of-month tick's text is suppressed entirely ("" per tick) - month/
// year context then comes solely from DateGroupingOverlay's own span/rule
// labels. Shared across all three charts so they agree on exactly one
// cutover; strict `>` per the plan's corner case (30 shows day numbers, 31
// suppresses them).
export const DAY_TICK_SUPPRESSION_THRESHOLD = 30;

export interface DisplayTickRow {
  xEpoch: number;
  isLeadIn: boolean;
}

// Picks exactly which xEpoch values get handed to <XAxis ticks={...}> once
// Recharts' own filtering (interval={0}) is bypassed - see the comment
// above. `rows` may contain duplicate xEpoch values (e.g. a publish-date
// lead-in that coincides with a real capture date); the result is
// deduplicated and sorted ascending.
export function selectDisplayedTicks(rows: DisplayTickRow[]): number[] {
  const leadInEpochs = rows.filter((row) => row.isLeadIn).map((row) => row.xEpoch);
  const realEpochsSorted = [
    ...new Set(rows.filter((row) => !row.isLeadIn).map((row) => row.xEpoch)),
  ].sort((a, b) => a - b);

  let selectedReal: number[];
  if (realEpochsSorted.length <= MAX_REAL_AXIS_TICKS) {
    selectedReal = realEpochsSorted;
  } else {
    // Evenly sample MAX_REAL_AXIS_TICKS indices across the sorted real
    // epochs. Always keeping index 0 and the last index (the domain's real
    // edges) exact - rounding elsewhere in the sampled sequence is fine,
    // but the edges must never drift.
    const lastIndex = realEpochsSorted.length - 1;
    const pickedIndices = new Set<number>();
    for (let i = 0; i < MAX_REAL_AXIS_TICKS; i += 1) {
      const fraction = i / (MAX_REAL_AXIS_TICKS - 1);
      pickedIndices.add(Math.round(fraction * lastIndex));
    }
    selectedReal = [...pickedIndices].sort((a, b) => a - b).map((index) => realEpochsSorted[index]);
  }

  return [...new Set([...leadInEpochs, ...selectedReal])].sort((a, b) => a - b);
}

export interface ComputeYDomainOptions {
  hasLeadIn: boolean;
}

export interface YDomainResult {
  domain: [number, number];
  broken: boolean;
}

const PAD_RATIO = 0.08;

// Bug fix (2026-09-25 Preview finding, item 1): the raw padded ceiling
// (dataMax + pad) is an arbitrary float. Rendered as a Y-axis tick it looks
// inconsistent next to the clean round ticks below it (e.g. "141,554.52"
// beside "0 / 40,000 / 80,000 / 120,000") and, because it's WIDER than the
// short round labels Recharts' default axis width was effectively sized
// for, the extra characters get left-clipped in the real chart (confirmed
// live on the "Total hits"/"Kudos" dashboard charts). Rounding the ceiling
// itself UP (never below the raw value, so no data point is ever pushed out
// of the visible domain) to a "nice" 2-significant-figure number fixes the
// root cause: e.g. 141554.52 -> 150000, 316 -> 320, 0.083 -> 0.084. This is
// the standard nice-axis-bound technique (Heckbert, "Nice Numbers for Graph
// Labels", Graphics Gems, 1990). 2 sig figs (not the coarser 1) keeps the
// extra headroom proportionate to PAD_RATIO's own small-headroom intent
// (D1) rather than snapping all the way to the next power-of-ten multiple.
const NICE_CEILING_SIGNIFICANT_DIGITS = 2;

function niceCeiling(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - (NICE_CEILING_SIGNIFICANT_DIGITS - 1));
  return Math.ceil(value / magnitude) * magnitude;
}

// Root-cause-adjacent defense-in-depth for the same bug: Recharts' YAxis
// `width="auto"` sizing depends on a live DOM text-measurement pass
// (getBoundingClientRect on each rendered tick) that this codebase's charts
// can't rely on being correct in every real layout (and which is a no-op in
// this project's jsdom test environment, since jsdom never lays text out) -
// an explicit width, sized generously for the widest formatted tick label,
// is deterministic instead of hoping "auto" catches up. Approximates a
// monospace glyph's rendered width at the charts' fixed 12px tick font size;
// the padding covers the tick line + Recharts' built-in tick margin.
const APPROX_MONO_CHAR_WIDTH_PX = 7.3;
const Y_AXIS_WIDTH_PADDING_PX = 18;
const MIN_Y_AXIS_WIDTH_PX = 40;

// `topTickValue` is expected to be the (already nice-rounded) domain
// ceiling - the widest label on a Y-axis that starts at/near 0 and counts
// up is always its top tick, so that one value is a sufficient stand-in for
// "the widest tick label this axis will render."
export function estimateYAxisWidth(topTickValue: number): number {
  const label = formatNumber(topTickValue);
  return Math.max(
    MIN_Y_AXIS_WIDTH_PX,
    Math.round(label.length * APPROX_MONO_CHAR_WIDTH_PX) + Y_AXIS_WIDTH_PADDING_PX,
  );
}

// Item 1's padded y-domain rule (D1/D2). `values` must include the lead-in's
// literal 0 when a lead-in is present (D1 - the caller's responsibility).
// `hasLeadIn` is part of the documented call contract (callers state their
// intent explicitly) but the branching itself is driven by whether 0 is
// actually present in `values` ("dataMin <= 0 (lead-in present, or a genuine
// zero floor)", per the plan's own §3 item 1 wording) - both cases collapse
// to the same rule, so the flag itself isn't separately consulted here.
// hasLeadIn is intentionally unused below (part of the stable public
// contract - chartTimeAxis.test.ts calls this with { hasLeadIn } - see the
// comment above for why the flag itself isn't separately consulted).
export function computeYDomain(
  values: number[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { hasLeadIn: _hasLeadIn }: ComputeYDomainOptions,
): YDomainResult {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const range = dataMax - dataMin;
  const fallbackForSinglePoint = Math.max(Math.abs(dataMax) * 0.1, 1);
  const pad = (range || fallbackForSinglePoint) * PAD_RATIO;

  if (dataMin <= 0) {
    return { domain: [0, niceCeiling(dataMax + pad)], broken: false };
  }

  const lo = Math.max(0, dataMin - pad);
  // When the natural (unpadded-by-underflow) floor would dip below zero, the
  // window is anchored at exactly [0, pad] rather than [0, dataMax + pad] -
  // a near-zero single point would otherwise inherit a lopsided extra
  // dataMax's worth of headroom it doesn't need (hasLeadIn is false here, so
  // there is no meaningful "floor at 0" semantics to preserve beyond this).
  const hi = niceCeiling(dataMin - pad < 0 ? pad : dataMax + pad);
  return { domain: [lo, hi], broken: lo > 0 };
}
