import { Text } from "recharts";
import type { XAxisTickContentProps } from "recharts";

// Bug fix (2026-09-25 Preview finding, item 4/D7's true time axis): Recharts
// center-anchors every XAxis tick label by default. Item 4 puts a real point
// - often a long lead-in label such as "Published 2014-09-06" - right at the
// domain's true leftmost edge, so half the label's rendered width extends
// LEFT of that anchor, past the chart's own left boundary, and gets silently
// clipped there (confirmed live: "Published 2014-09-06" rendered as
// "ublished 2014-09-06"). Left-anchoring ONLY the very first tick (index 0)
// removes the left overflow structurally, for a label of any length, without
// changing any other tick's existing centered look. Recharts loses the
// tick-object shorthand's fill/fontFamily/fontSize once `tick` is a custom
// render function (see YAxisUtils/CartesianAxis's TickItem - a function
// `tick` only receives the computed x/y/payload/textAnchor, not the object
// shorthand's own style props), so those are set explicitly here to match
// the look every chart already used before this fix.
export function createEdgeSafeXAxisTick(params: {
  fill: string;
  formatTick: (xEpoch: number) => string;
}) {
  const { fill, formatTick } = params;
  return function EdgeSafeXAxisTick(props: XAxisTickContentProps & { className?: string }) {
    const { x, y, index, textAnchor, verticalAnchor, payload, className } = props;
    if (payload == null) return null;
    return (
      <Text
        x={x}
        y={y}
        textAnchor={index === 0 ? "start" : textAnchor}
        verticalAnchor={verticalAnchor}
        fill={fill}
        fontFamily="var(--font-mono)"
        fontSize={12}
        className={className}
      >
        {formatTick(Number(payload.value))}
      </Text>
    );
  };
}
