import { Text } from "recharts";
import type { XAxisTickContentProps } from "recharts";

// Bug fix (2026-09-25 Preview finding, item 4/D7's true time axis): Recharts
// center-anchors every XAxis tick label by default. Item 4 puts a real point
// - often a long lead-in label such as "Published 2014-09-06" - right at the
// domain's true leftmost edge, so half the label's rendered width extends
// LEFT of that anchor, past the chart's own left boundary, and gets silently
// clipped there (confirmed live: "Published 2014-09-06" rendered as
// "ublished 2014-09-06"). Left-anchoring ONLY the true domain-leftmost tick
// removes the left overflow structurally, for a label of any length, without
// changing any other tick's existing centered look.
//
// Second bug fix (2026-09-25 second Preview finding): the original fix
// identified "the edge tick" via Recharts' own render-call `index === 0`,
// which is the tick's position within whatever subset Recharts' internal
// overlap-avoidance filtering decided to actually RENDER - not its position
// in the true domain-ordered ticks array passed in. For a chart with exactly
// two ticks (a lead-in + one real point - the per-work chart shape from the
// original bug report), Recharts sometimes collapses its render pass down to
// a single surviving tick, which then gets `index === 0` regardless of
// whether it's really the domain's leftmost point. Confirmed live: on "Lay
// Down Your Stones and Arrows"'s Hits chart, the lead-in tick vanished from
// Recharts' render entirely and the OTHER (later, rightmost) tick inherited
// index 0, got left-anchored, and overflowed off the right edge instead
// ("2026-" with the rest cut off). Comparing the tick's own x-value (its
// epoch, this being a numeric time axis) against the chart's real domain
// minimum - passed in explicitly by each call site, since that's already
// known from the same `domain`/`ticks` arrays passed to XAxis - is immune to
// whatever subset Recharts chooses to render, and to render order entirely.
// A small epsilon tolerates any floating-point epoch drift between the two
// values without falsely matching a genuinely different tick.
const DOMAIN_MIN_EPSILON_MS = 1;

// Recharts loses the tick-object shorthand's fill/fontFamily/fontSize once
// `tick` is a custom render function (see YAxisUtils/CartesianAxis's
// TickItem - a function `tick` only receives the computed x/y/payload/
// textAnchor, not the object shorthand's own style props), so those are set
// explicitly here to match the look every chart already used before this fix.
export function createEdgeSafeXAxisTick(params: {
  fill: string;
  formatTick: (xEpoch: number) => string;
  domainMin: number;
}) {
  const { fill, formatTick, domainMin } = params;
  return function EdgeSafeXAxisTick(props: XAxisTickContentProps & { className?: string }) {
    const { x, y, textAnchor, verticalAnchor, payload, className } = props;
    if (payload == null) return null;
    const xValue = Number(payload.value);
    const isDomainLeftmost = Math.abs(xValue - domainMin) <= DOMAIN_MIN_EPSILON_MS;
    return (
      <Text
        x={x}
        y={y}
        textAnchor={isDomainLeftmost ? "start" : textAnchor}
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
