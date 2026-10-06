import { Text } from "recharts";
import type { XAxisTickContentProps } from "recharts";

// Structural fix (2026-09-25, third Preview-finding round - supersedes
// EdgeSafeXAxisTick.tsx, see TECH_DEBT.md). Three prior attempts
// (`026890f`, `ff1afc3`, and a since-abandoned third) tried to reconcile
// Recharts' XAxis tick-overlap-avoidance filtering (getTicks.js's
// getTickSize/isVisible) with a long lead-in text label (e.g. "Published
// 2014-09-06") sitting at the chronological axis's domain-minimum position,
// and each surfaced a NEW failure mode against real production data
// (clipped text, a misplaced neighbor tick, a dropped label). The common
// root cause across all three: Recharts measures every tick's collision
// width from whatever STRING its `tickFormatter` prop returns for that
// tick's value - entirely independent of what a custom `tick` render
// function actually paints - and assumes that measured-width label is
// center-anchored. As long as any long text string exists for that slot,
// some version of this collision math can misfire.
//
// The fix removes the long text at its source instead of continuing to
// patch around Recharts' filtering: each call site's `tickFormatter` now
// returns "" for the lead-in's xEpoch (see TrendChart/RatioChart/
// MultiSeriesTrendChart's own axisTickFormatter), so Recharts' collision
// math always measures that tick as zero-width. A zero-width tick can
// never collide with a neighbor, never gets dropped by "doesn't fit"
// filtering, and never needs to shift a neighboring tick's coordinate to
// make room for it - structurally different from every prior attempt,
// which all still fed Recharts a real (nonzero) measured width and then
// tried to compensate for what that width did afterward. The lead-in's
// full date/label text remains available in the synced data table
// rendered below the chart (unchanged by this fix).
//
// Chart-table-polish-batch item 6 (docs/plans/chart-table-polish-batch.md
// §4 item 6, §8 T6): the structural fix above originally drew a small
// marker glyph at the lead-in's tick slot instead of its (now absent) text
// - item 6 removes that marker glyph too, per direct user instruction: no
// x-axis tick, lead-in or otherwise, ever draws a dot. The lead-in slot now
// renders fully bare (`null`). The dashed connector and its on-line anchor
// dot (drawn by the "lead" Line itself, not this renderer) are untouched -
// see the plan's §3 "Lead-in convention" scope note.

// Recharts loses the tick-object shorthand's fill/fontFamily/fontSize once
// `tick` is a custom render function (see CartesianAxis's TickItem - a
// function `tick` only receives the computed x/y/payload/textAnchor, not
// the object shorthand's own style props), so those are set explicitly
// here to match the look every chart already used before this fix.
export function createLeadInXAxisTick(params: {
  fill: string;
  formatTick: (xEpoch: number) => string;
  isLeadInTick: (xEpoch: number) => boolean;
}) {
  const { fill, formatTick, isLeadInTick } = params;
  return function LeadInXAxisTick(props: XAxisTickContentProps & { className?: string }) {
    const { x, y, textAnchor, verticalAnchor, payload, className } = props;
    if (payload == null) return null;
    const xValue = Number(payload.value);

    if (isLeadInTick(xValue)) return null;

    return (
      <Text
        x={x}
        y={y}
        textAnchor={textAnchor}
        verticalAnchor={verticalAnchor}
        fill={fill}
        fontFamily="var(--font-mono)"
        fontSize={12}
        className={className}
      >
        {formatTick(xValue)}
      </Text>
    );
  };
}
