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
